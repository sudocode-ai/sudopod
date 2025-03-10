package events

import (
	"github.com/hashicorp/nomad/api"
)

// MockEventStream represents the contract for how events flow from Nomad
type MockEventStream struct {
	events chan *api.Events
	errors chan error
	done   chan struct{}
}

// NewMockEventStream creates a new mock event stream for testing
func NewMockEventStream() EventStreamReader {
	stream := &MockEventStream{
		events: make(chan *api.Events, 10),
		errors: make(chan error, 10),
		done:   make(chan struct{}),
	}

	// Emit an initial empty event to signal the stream is working
	go func() {
		stream.events <- &api.Events{
			Events: []api.Event{},
		}
	}()

	return stream
}

// ReadEvents implements EventStreamReader
func (m *MockEventStream) ReadEvents() <-chan *api.Events {
	return m.events
}

// ReadErrors implements EventStreamReader
func (m *MockEventStream) ReadErrors() <-chan error {
	return m.errors
}

// EmitNodeDrainEvent emits a node drain event as Nomad would
func (m *MockEventStream) EmitNodeDrainEvent(nodeID string, draining bool) {
	select {
	case <-m.done:
		return // Don't send if we're stopped
	default:
		event := &api.Events{
			Index: 1,
			Events: []api.Event{
				{
					Topic: "Node",
					Type:  "NodeUpdate",
					Key:   nodeID,
					FilterKeys: []string{
						nodeID,
					},
					Index: 1,
					Payload: map[string]interface{}{
						"Node": map[string]interface{}{
							"ID":     nodeID,
							"Drain":  draining,
							"Status": "ready",
						},
					},
				},
			},
		}
		m.events <- event
	}
}

// Stop implements the contract for stopping the event stream
func (m *MockEventStream) Stop() {
	close(m.done)
	close(m.events)
	close(m.errors)
}
