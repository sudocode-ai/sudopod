package orchestrator

import (
	"context"
	"testing"
	"time"

	"github.com/e2b-dev/infra/packages/api/internal/api"
	"github.com/e2b-dev/infra/packages/api/internal/orchestrator/events"
	"github.com/e2b-dev/infra/packages/shared/pkg/smap"
	"github.com/stretchr/testify/require"
	"go.opentelemetry.io/otel/trace"
	"go.uber.org/zap"
)

func TestNodeDrainHandling(t *testing.T) {
	// Use a shorter timeout for tests
	ctx, cancel := context.WithTimeout(context.Background(), 1*time.Second)
	defer cancel()

	t.Run("excludes draining nodes from scheduling", func(t *testing.T) {
		// Create fresh orchestrator for each test
		o := &Orchestrator{
			tracer: trace.NewNoopTracerProvider().Tracer("test"),
			nodes:  smap.New[*Node](),
		}

		// Arrange
		nodeID := "test-node"
		node := newMockNode(nodeID)
		o.nodes.Insert(nodeID, node)

		// Act
		node.draining.Store(true)
		node.SetStatus(api.NodeStatusDraining)

		// Assert - verify node is excluded from scheduling
		selectedNode, err := o.getLeastBusyNode(ctx, nil)
		require.Error(t, err, "should not select a draining node")
		require.Nil(t, selectedNode)
	})

	t.Run("includes non-draining nodes in scheduling", func(t *testing.T) {
		// Create fresh orchestrator for each test
		o := &Orchestrator{
			tracer: trace.NewNoopTracerProvider().Tracer("test"),
			nodes:  smap.New[*Node](),
		}

		// Arrange
		nodeID := "test-node"
		node := newMockNode(nodeID)
		o.nodes.Insert(nodeID, node)

		// Act - ensure node is not draining
		node.draining.Store(false)
		node.SetStatus(api.NodeStatusReady)

		// Assert - verify node is available for scheduling
		selectedNode, err := o.getLeastBusyNode(ctx, nil)
		require.NoError(t, err)
		require.NotNil(t, selectedNode)
		require.Equal(t, nodeID, selectedNode.Info.ID)
	})

	t.Run("handles multiple nodes with mixed drain states", func(t *testing.T) {
		// Create fresh orchestrator for each test
		o := &Orchestrator{
			tracer: trace.NewNoopTracerProvider().Tracer("test"),
			nodes:  smap.New[*Node](),
		}

		// Arrange
		readyNode := newMockNode("ready-node")
		readyNode.CPUUsage.Store(50)
		o.nodes.Insert("ready-node", readyNode)

		drainingNode := newMockNode("draining-node")
		drainingNode.CPUUsage.Store(20) // Lower CPU usage but draining
		drainingNode.draining.Store(true)
		drainingNode.SetStatus(api.NodeStatusDraining)
		o.nodes.Insert("draining-node", drainingNode)

		// Act & Assert
		selectedNode, err := o.getLeastBusyNode(ctx, nil)
		require.NoError(t, err)
		require.NotNil(t, selectedNode)
		require.Equal(t, "ready-node", selectedNode.Info.ID, "should select ready node even with higher CPU usage")
	})
}

func TestNomadEventHandling(t *testing.T) {
	ctx, cancel := context.WithTimeout(context.Background(), 1*time.Second)
	defer cancel()

	t.Run("updates node drain state when nomad drain event received", func(t *testing.T) {
		// Create fresh orchestrator for each test
		o := &Orchestrator{
			tracer: trace.NewNoopTracerProvider().Tracer("test"),
			nodes:  smap.New[*Node](),
			logger: zap.NewNop().Sugar(),
		}

		// Arrange
		nodeID := "test-node"
		node := newMockNode(nodeID)
		o.nodes.Insert(nodeID, node)

		// Create mock event stream
		stream := events.NewMockEventStream()
		mockStream := stream.(*events.MockEventStream)

		// Start the event handler
		require.NoError(t, o.StartEventHandler(ctx, stream), "should start event handler")

		// Act - simulate a drain event from Nomad
		mockStream.EmitNodeDrainEvent(nodeID, true)

		// Assert - verify node state is updated
		require.Eventually(t, func() bool {
			return node.draining.Load() && node.Status() == api.NodeStatusDraining
		}, 100*time.Millisecond, 10*time.Millisecond, "node should be marked as draining")

		// Verify node is excluded from scheduling
		selectedNode, err := o.getLeastBusyNode(ctx, nil)
		require.Error(t, err, "should not select a draining node")
		require.Nil(t, selectedNode)
	})
}
