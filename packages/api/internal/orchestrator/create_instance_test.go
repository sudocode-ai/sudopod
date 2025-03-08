package orchestrator

import (
	"context"
	"testing"

	"github.com/e2b-dev/infra/packages/api/internal/api"
	"github.com/e2b-dev/infra/packages/api/internal/node"
	"github.com/e2b-dev/infra/packages/shared/pkg/smap"
	"github.com/stretchr/testify/assert"
	"go.opentelemetry.io/otel/trace"
	"google.golang.org/grpc"
	"google.golang.org/grpc/connectivity"
)

// mockConnection implements e2bgrpc.ClientConnInterface for testing
type mockConnection struct {
	state connectivity.State
}

func (m *mockConnection) GetState() connectivity.State {
	return m.state
}

func (m *mockConnection) Close() error {
	return nil
}

func (m *mockConnection) Invoke(ctx context.Context, method string, args any, reply any, opts ...grpc.CallOption) error {
	return nil
}

func (m *mockConnection) NewStream(ctx context.Context, desc *grpc.StreamDesc, method string, opts ...grpc.CallOption) (grpc.ClientStream, error) {
	return nil, nil
}

// mockGRPCClient is a test implementation of GRPCClient
type mockGRPCClient struct {
	connection *grpc.ClientConn
}

func newMockNode(id string) *Node {
	return &Node{
		Info:           &node.NodeInfo{ID: id},
		sbxsInProgress: smap.New[*sbxInProgress](),
		Client: &GRPCClient{
			connection: &mockConnection{
				state: connectivity.Ready,
			},
		},
		status: api.NodeStatusReady,
	}
}

func TestGetLeastBusyNode(t *testing.T) {
	tests := []struct {
		name          string
		setupNodes    func() map[string]*Node
		expectedNode  string
		expectError   bool
		nodesExcluded map[string]*Node
	}{
		{
			name: "Should select least busy node",
			setupNodes: func() map[string]*Node {
				nodes := make(map[string]*Node)

				// Node 1 with higher CPU usage
				node1 := newMockNode("node1")
				node1.CPUUsage.Store(80)
				nodes["node1"] = node1

				// Node 2 with lower CPU usage
				node2 := newMockNode("node2")
				node2.CPUUsage.Store(20)
				nodes["node2"] = node2

				return nodes
			},
			expectedNode:  "node2",
			expectError:   false,
			nodesExcluded: make(map[string]*Node),
		},
		{
			name: "Should skip draining nodes",
			setupNodes: func() map[string]*Node {
				nodes := make(map[string]*Node)

				// Node 1 is draining
				node1 := newMockNode("node1")
				node1.CPUUsage.Store(20)
				node1.draining.Store(true)
				node1.SetStatus(api.NodeStatusDraining)
				nodes["node1"] = node1

				// Node 2 is ready
				node2 := newMockNode("node2")
				node2.CPUUsage.Store(80)
				nodes["node2"] = node2

				return nodes
			},
			expectedNode:  "node2",
			expectError:   false,
			nodesExcluded: make(map[string]*Node),
		},
		{
			name: "Should skip pending drain nodes",
			setupNodes: func() map[string]*Node {
				nodes := make(map[string]*Node)

				// Node 1 is pending drain
				node1 := newMockNode("node1")
				node1.CPUUsage.Store(20)
				node1.pendingDrain.Store(true)
				nodes["node1"] = node1

				// Node 2 is ready
				node2 := newMockNode("node2")
				node2.CPUUsage.Store(80)
				nodes["node2"] = node2

				return nodes
			},
			expectedNode:  "node2",
			expectError:   false,
			nodesExcluded: make(map[string]*Node),
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			o := &Orchestrator{
				nodes:  smap.New[*Node](),
				tracer: trace.NewNoopTracerProvider().Tracer("test"),
			}

			nodes := tt.setupNodes()
			for _, node := range nodes {
				o.nodes.Insert(node.Info.ID, node)
			}

			node, err := o.getLeastBusyNode(context.Background(), tt.nodesExcluded)

			if tt.expectError {
				assert.Error(t, err)
				assert.Nil(t, node)
			} else {
				assert.NoError(t, err)
				assert.NotNil(t, node)
				assert.Equal(t, tt.expectedNode, node.Info.ID)
			}
		})
	}
}
