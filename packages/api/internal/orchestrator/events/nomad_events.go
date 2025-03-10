package events

import (
	"context"

	"github.com/hashicorp/nomad/api"
)

// EventStream represents a stream of Nomad events
type EventStream interface {
	Stop()
}

// EventStreamReader is an internal interface for reading events
type EventStreamReader interface {
	EventStream
	ReadEvents() <-chan *api.Events
	ReadErrors() <-chan error
}

// DrainStateChangeHandler is called when a node's drain state changes
type DrainStateChangeHandler func(nodeID string, draining bool)

// NomadEventHandler handles events from Nomad's event stream
type NomadEventHandler interface {
	Start(ctx context.Context) error
	Stop()
	OnDrainStateChange(handler DrainStateChangeHandler)
}

// EventStreamOption configures the event handler
type EventStreamOption func(*nomadEventHandler)

// WithEventStream sets the event stream for testing
func WithEventStream(stream EventStreamReader) EventStreamOption {
	return func(h *nomadEventHandler) {
		h.stream = stream
	}
}

// nomadEventHandler implements NomadEventHandler
type nomadEventHandler struct {
	drainHandlers []DrainStateChangeHandler
	stream        EventStreamReader
	ctx           context.Context
	cancel        context.CancelFunc
}

// NewNomadEventHandler creates a new event handler
func NewNomadEventHandler(opts ...EventStreamOption) NomadEventHandler {
	h := &nomadEventHandler{}
	for _, opt := range opts {
		opt(h)
	}
	return h
}

func (h *nomadEventHandler) Start(ctx context.Context) error {
	if h.stream == nil {
		return nil // For now, just return nil if no stream is set
	}

	h.ctx, h.cancel = context.WithCancel(ctx)

	// Start processing events in a goroutine
	go h.processEvents()

	return nil
}

func (h *nomadEventHandler) processEvents() {
	for {
		select {
		case <-h.ctx.Done():
			return
		case events := <-h.stream.ReadEvents():
			if events == nil {
				continue
			}
			for _, event := range events.Events {
				if event.Topic == "Node" && event.Type == "NodeUpdate" {
					if node, ok := event.Payload["Node"].(map[string]interface{}); ok {
						nodeID, _ := node["ID"].(string)
						draining, _ := node["Drain"].(bool)
						h.notifyDrainHandlers(nodeID, draining)
					}
				}
			}
		case <-h.stream.ReadErrors():
			// For now, just continue on errors
			continue
		}
	}
}

func (h *nomadEventHandler) notifyDrainHandlers(nodeID string, draining bool) {
	for _, handler := range h.drainHandlers {
		handler(nodeID, draining)
	}
}

func (h *nomadEventHandler) Stop() {
	if h.cancel != nil {
		h.cancel()
	}
	if h.stream != nil {
		h.stream.Stop()
	}
}

func (h *nomadEventHandler) OnDrainStateChange(handler DrainStateChangeHandler) {
	h.drainHandlers = append(h.drainHandlers, handler)
}
