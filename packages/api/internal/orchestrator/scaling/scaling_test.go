package scaling

import (
	"context"
	"fmt"
	"testing"
	"time"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	"go.uber.org/zap/zaptest"
	"google.golang.org/api/compute/v1"

	"github.com/e2b-dev/infra/packages/api/internal/api"
	"github.com/e2b-dev/infra/packages/api/internal/node"
)

// mockComputeService implements computeOperations for testing
type mockComputeService struct {
	removedInstances []string
	instances        []*compute.Instance
	operations       map[string]*compute.Operation
}

func (m *mockComputeService) RemoveInstance(ctx context.Context, projectID, zone, instanceGroup, instance string) (*compute.Operation, error) {
	m.removedInstances = append(m.removedInstances, instance)
	op := &compute.Operation{
		Name:   "test-op",
		Status: "DONE",
	}
	m.operations["test-op"] = op
	return op, nil
}

func (m *mockComputeService) FindInstanceByIP(ctx context.Context, projectID, zone, ip string) (*compute.Instance, error) {
	for _, instance := range m.instances {
		for _, networkInterface := range instance.NetworkInterfaces {
			if networkInterface.NetworkIP == ip {
				return instance, nil
			}
		}
	}
	return nil, fmt.Errorf("no instance found with IP %s", ip)
}

func (m *mockComputeService) WaitForOperation(ctx context.Context, projectID, zone, name string) error {
	op, exists := m.operations[name]
	if !exists {
		return fmt.Errorf("operation not found")
	}
	if op.Error != nil {
		return fmt.Errorf("operation failed: %v", op.Error)
	}
	return nil
}

func TestManager_HandleNodeStatusChange(t *testing.T) {
	tests := []struct {
		name           string
		nodeInfo       *node.NodeInfo
		newStatus      api.NodeStatus
		instances      []*compute.Instance
		expectRemoval  bool
		expectedError  bool
		expectedNodeID string
	}{
		{
			name: "node draining triggers removal",
			nodeInfo: &node.NodeInfo{
				ID:        "test-node-1",
				IPAddress: "10.0.0.1",
			},
			newStatus: api.NodeStatusDraining,
			instances: []*compute.Instance{
				{
					Name:     "instance-1",
					SelfLink: "projects/test/zones/test-zone/instances/instance-1",
					NetworkInterfaces: []*compute.NetworkInterface{
						{NetworkIP: "10.0.0.1"},
					},
				},
			},
			expectRemoval:  true,
			expectedNodeID: "test-node-1",
		},
		{
			name: "ready status does not trigger removal",
			nodeInfo: &node.NodeInfo{
				ID:        "test-node-2",
				IPAddress: "10.0.0.2",
			},
			newStatus: api.NodeStatusReady,
			instances: []*compute.Instance{
				{
					Name:     "instance-2",
					SelfLink: "projects/test/zones/test-zone/instances/instance-2",
					NetworkInterfaces: []*compute.NetworkInterface{
						{NetworkIP: "10.0.0.2"},
					},
				},
			},
			expectRemoval: false,
		},
		{
			name: "node not found in instance group",
			nodeInfo: &node.NodeInfo{
				ID:        "test-node-3",
				IPAddress: "10.0.0.3",
			},
			newStatus:     api.NodeStatusDraining,
			instances:     []*compute.Instance{},
			expectRemoval: false,
			expectedError: true,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			mock := &mockComputeService{
				instances:  tt.instances,
				operations: make(map[string]*compute.Operation),
			}

			manager := &Manager{
				logger:            zaptest.NewLogger(t).Sugar(),
				projectID:         "test-project",
				zone:              "test-zone",
				instanceGroup:     "test-group",
				scheduledRemovals: make(map[string]*time.Timer),
			}

			// Set a short delay for testing
			manager.SetRemovalDelay(100 * time.Millisecond)

			// Set our mock compute operations
			manager.SetComputeOperations(mock)

			// Handle the status change
			manager.HandleNodeStatusChange(tt.nodeInfo, tt.newStatus)

			if tt.expectRemoval {
				// Wait for the scheduled removal
				time.Sleep(150 * time.Millisecond)

				// Verify the instance was removed
				assert.Contains(t, mock.removedInstances, "projects/test/zones/test-zone/instances/instance-1")
			} else {
				assert.Empty(t, mock.removedInstances)
			}
		})
	}
}

func TestManager_findInstanceByIP(t *testing.T) {
	tests := []struct {
		name         string
		ip           string
		instances    []*compute.Instance
		expectError  bool
		expectedName string
	}{
		{
			name: "instance found",
			ip:   "10.0.0.1",
			instances: []*compute.Instance{
				{
					Name:     "instance-1",
					SelfLink: "projects/test/zones/test-zone/instances/instance-1",
					NetworkInterfaces: []*compute.NetworkInterface{
						{NetworkIP: "10.0.0.1"},
					},
				},
			},
			expectedName: "instance-1",
		},
		{
			name: "instance not found",
			ip:   "10.0.0.2",
			instances: []*compute.Instance{
				{
					Name:     "instance-1",
					SelfLink: "projects/test/zones/test-zone/instances/instance-1",
					NetworkInterfaces: []*compute.NetworkInterface{
						{NetworkIP: "10.0.0.1"},
					},
				},
			},
			expectError: true,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			mock := &mockComputeService{
				instances:  tt.instances,
				operations: make(map[string]*compute.Operation),
			}

			manager := &Manager{
				logger:        zaptest.NewLogger(t).Sugar(),
				projectID:     "test-project",
				zone:          "test-zone",
				instanceGroup: "test-group",
			}

			// Set our mock compute operations
			manager.SetComputeOperations(mock)

			instance, err := mock.FindInstanceByIP(context.Background(), manager.projectID, manager.zone, tt.ip)
			if tt.expectError {
				require.Error(t, err)
				return
			}

			require.NoError(t, err)
			assert.Equal(t, tt.expectedName, instance.Name)
		})
	}
}

func TestManager_scheduleNodeRemoval(t *testing.T) {
	manager := &Manager{
		logger:            zaptest.NewLogger(t).Sugar(),
		scheduledRemovals: make(map[string]*time.Timer),
	}

	// Set a short delay for testing
	manager.SetRemovalDelay(100 * time.Millisecond)

	nodeInfo := &node.NodeInfo{
		ID: "test-node",
	}

	// Schedule removal
	manager.scheduleNodeRemoval(nodeInfo)

	// Verify timer was created
	assert.Len(t, manager.scheduledRemovals, 1)
	assert.Contains(t, manager.scheduledRemovals, "test-node")

	// Schedule again for same node
	manager.scheduleNodeRemoval(nodeInfo)

	// Verify still only one timer
	assert.Len(t, manager.scheduledRemovals, 1)
}
