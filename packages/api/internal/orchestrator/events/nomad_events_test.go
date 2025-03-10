package events

import (
	"context"
	"fmt"
	"testing"
	"time"

	"github.com/stretchr/testify/require"
)

func TestNodeDrainDetection(t *testing.T) {
	stream := NewMockEventStream()
	ctx := context.Background()

	handler := NewNomadEventHandler(WithEventStream(stream))
	require.NoError(t, handler.Start(ctx))

	t.Run("updates node drain state when event received", func(t *testing.T) {
		// Arrange
		nodeID := "test-node"
		var drainStateChanged bool
		handler.OnDrainStateChange(func(id string, draining bool) {
			if id == nodeID && draining {
				drainStateChanged = true
			}
		})

		// Act - simulate a drain event
		stream.EmitNodeDrainEvent(nodeID, true)

		// Assert - verify the contract is fulfilled
		require.Eventually(t, func() bool {
			return drainStateChanged
		}, 100*time.Millisecond, 10*time.Millisecond, "node drain state should be detected")
	})

	t.Run("maintains consistency during event stream errors", func(t *testing.T) {
		// Arrange
		nodeID := "test-node"
		var drainStateChanges []bool
		handler.OnDrainStateChange(func(id string, draining bool) {
			if id == nodeID {
				drainStateChanges = append(drainStateChanges, draining)
			}
		})

		// Act - simulate error and recovery
		stream.EmitNodeDrainEvent(nodeID, true)
		stream.errors <- fmt.Errorf("connection lost")
		stream.EmitNodeDrainEvent(nodeID, false)

		// Assert - verify state transitions are consistent
		require.Eventually(t, func() bool {
			return len(drainStateChanges) == 2 &&
				drainStateChanges[0] == true &&
				drainStateChanges[1] == false
		}, 100*time.Millisecond, 10*time.Millisecond, "node drain state changes should be consistent")
	})

	t.Run("handles concurrent drain events", func(t *testing.T) {
		// Arrange
		nodeIDs := []string{"node-1", "node-2", "node-3"}
		stateChanges := make(map[string]bool)

		handler.OnDrainStateChange(func(id string, draining bool) {
			stateChanges[id] = draining
		})

		// Act - simulate concurrent drain events
		for _, id := range nodeIDs {
			go stream.EmitNodeDrainEvent(id, true)
		}

		// Assert - verify all events are processed
		require.Eventually(t, func() bool {
			for _, id := range nodeIDs {
				if !stateChanges[id] {
					return false
				}
			}
			return true
		}, 100*time.Millisecond, 10*time.Millisecond, "all node drain events should be processed")
	})

	t.Run("stops processing events when stopped", func(t *testing.T) {
		// Arrange
		nodeID := "test-node"
		var eventProcessed bool
		handler.OnDrainStateChange(func(id string, draining bool) {
			eventProcessed = true
		})

		// Act
		handler.Stop()
		stream.EmitNodeDrainEvent(nodeID, true)

		// Give some time for any events to be processed
		time.Sleep(50 * time.Millisecond)
		require.False(t, eventProcessed, "events should not be processed after stop")
	})
}
