package events

import (
	"context"
	"fmt"

	"github.com/hashicorp/nomad/api"
)

// NomadEventStream implements EventStreamReader for real Nomad events
type NomadEventStream struct {
	nomadClient *api.Client
	events      chan *api.Events
	errors      chan error
	done        chan struct{}
	ctx         context.Context
	cancel      context.CancelFunc
}

// NewNomadEventStream creates a new event stream that reads from Nomad's event API
func NewNomadEventStream(nomadClient *api.Client) EventStreamReader {
	ctx, cancel := context.WithCancel(context.Background())
	stream := &NomadEventStream{
		nomadClient: nomadClient,
		events:      make(chan *api.Events, 10),
		errors:      make(chan error, 10),
		done:        make(chan struct{}),
		ctx:         ctx,
		cancel:      cancel,
	}

	if err := stream.Start(ctx); err != nil {
		// If we can't start the stream, send the error on the error channel
		go func() {
			stream.errors <- fmt.Errorf("failed to start event stream: %w", err)
		}()
	}

	return stream
}

// ReadEvents implements EventStreamReader
func (n *NomadEventStream) ReadEvents() <-chan *api.Events {
	return n.events
}

// ReadErrors implements EventStreamReader
func (n *NomadEventStream) ReadErrors() <-chan error {
	return n.errors
}

// Start begins streaming events from Nomad
func (n *NomadEventStream) Start(ctx context.Context) error {
	topics := map[api.Topic][]string{
		api.TopicNode: {"*"}, // Subscribe to all node events
	}

	eventCh, err := n.nomadClient.EventStream().Stream(ctx, topics, 0, &api.QueryOptions{})
	if err != nil {
		return fmt.Errorf("failed to start Nomad event stream: %w", err)
	}

	go func() {
		defer close(n.events)
		defer close(n.errors)

		for {
			select {
			case <-n.done:
				return
			case <-ctx.Done():
				return
			case event := <-eventCh:
				if event.Err != nil {
					select {
					case n.errors <- event.Err:
					default:
						// Drop error if channel is full
					}
					continue
				}

				select {
				case n.events <- event:
				default:
					// Drop event if channel is full
				}
			}
		}
	}()

	return nil
}

// Stop implements EventStream
func (n *NomadEventStream) Stop() {
	n.cancel()
	close(n.done)
}
