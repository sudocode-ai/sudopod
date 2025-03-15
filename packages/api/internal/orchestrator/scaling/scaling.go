package scaling

import (
	"context"
	"fmt"
	"strings"
	"sync"
	"time"

	"go.uber.org/zap"
	"google.golang.org/api/compute/v1"

	"github.com/e2b-dev/infra/packages/api/internal/api"
	"github.com/e2b-dev/infra/packages/api/internal/node"
)

// computeOperations defines the GCP compute operations we need
type computeOperations interface {
	// RemoveInstance removes an instance from the instance group
	RemoveInstance(ctx context.Context, projectID, zone, instanceGroup string, instance string) (*compute.Operation, error)
	// FindInstanceByIP finds an instance by its IP address
	FindInstanceByIP(ctx context.Context, projectID, zone, ip string) (*compute.Instance, error)
	// WaitForOperation waits for a GCP operation to complete
	WaitForOperation(ctx context.Context, projectID, zone, name string) error
	// GetAutoscaler gets the autoscaler for an instance group
	GetAutoscaler(ctx context.Context, projectID, zone, instanceGroup string) (*compute.Autoscaler, error)
	// UpdateAutoscaler updates an autoscaler's configuration
	UpdateAutoscaler(ctx context.Context, projectID, zone string, autoscaler *compute.Autoscaler) (*compute.Operation, error)
}

// gcpComputeClient implements computeOperations using the real GCP client
type gcpComputeClient struct {
	service *compute.Service
}

func (g *gcpComputeClient) RemoveInstance(ctx context.Context, projectID, zone, instanceGroup string, instance string) (*compute.Operation, error) {
	// Log the values we're using
	fmt.Printf("Removing instance. Project: %s, Zone: %s, Instance Group: %s, Instance: %s\n", projectID, zone, instanceGroup, instance)

	return g.service.InstanceGroupManagers.DeleteInstances(
		projectID,
		zone,
		instanceGroup,
		&compute.InstanceGroupManagersDeleteInstancesRequest{
			Instances: []string{fmt.Sprintf("zones/%s/instances/%s", zone, instance)},
		},
	).Context(ctx).Do()
}

func (g *gcpComputeClient) FindInstanceByIP(ctx context.Context, projectID, zone, ip string) (*compute.Instance, error) {
	// List all instances in the project/zone without filtering
	instances, err := g.service.Instances.List(projectID, zone).Do()
	if err != nil {
		return nil, fmt.Errorf("failed to list instances: %w", err)
	}

	for _, instance := range instances.Items {
		for _, networkInterface := range instance.NetworkInterfaces {
			if networkInterface.NetworkIP == ip {
				return instance, nil
			}
		}
	}

	// Log all instances and their IPs for debugging
	var foundInstances []string
	for _, instance := range instances.Items {
		ips := []string{}
		for _, ni := range instance.NetworkInterfaces {
			ips = append(ips, ni.NetworkIP)
		}
		foundInstances = append(foundInstances, fmt.Sprintf("instance %s (IPs: %v)", instance.Name, ips))
	}

	return nil, fmt.Errorf("no instance found with IP %s. Found instances: %v", ip, foundInstances)
}

func (g *gcpComputeClient) WaitForOperation(ctx context.Context, projectID, zone, name string) error {
	for {
		select {
		case <-ctx.Done():
			return ctx.Err()
		case <-time.After(2 * time.Second):
			result, err := g.service.ZoneOperations.Get(
				projectID,
				zone,
				name,
			).Context(ctx).Do()

			if err != nil {
				return fmt.Errorf("failed to get operation status: %w", err)
			}

			if result.Status == "DONE" {
				if result.Error != nil {
					return fmt.Errorf("operation failed: %v", result.Error)
				}
				return nil
			}
		}
	}
}

func (g *gcpComputeClient) GetAutoscaler(ctx context.Context, projectID, zone, instanceGroup string) (*compute.Autoscaler, error) {
	// Infer autoscaler name from instance group name by removing "-ig" suffix
	autoscalerName := strings.TrimSuffix(instanceGroup, "-ig") + "-autoscaler"
	return g.service.Autoscalers.Get(projectID, zone, autoscalerName).Context(ctx).Do()
}

func (g *gcpComputeClient) UpdateAutoscaler(ctx context.Context, projectID, zone string, autoscaler *compute.Autoscaler) (*compute.Operation, error) {
	return g.service.Autoscalers.Update(projectID, zone, autoscaler).Context(ctx).Do()
}

// Manager handles node scaling operations
type Manager struct {
	logger        *zap.SugaredLogger
	compute       computeOperations
	projectID     string
	zone          string
	instanceGroup string

	// Track nodes scheduled for removal
	scheduledRemovals   map[string]*time.Timer
	scheduledRemovalsMu sync.Mutex

	// How long to wait after setting a node to draining before removing it
	removalDelay time.Duration
	// How long to wait after instance removal before re-enabling autoscaler
	autoscalerReenableDelay time.Duration
}

// NewManager creates a new scaling manager
func NewManager(logger *zap.SugaredLogger, projectID, zone, instanceGroup string) (*Manager, error) {
	computeService, err := compute.NewService(context.Background())
	if err != nil {
		return nil, fmt.Errorf("failed to create compute client: %w", err)
	}

	return &Manager{
		logger:                  logger,
		compute:                 &gcpComputeClient{service: computeService},
		projectID:               projectID,
		zone:                    zone,
		instanceGroup:           instanceGroup,
		scheduledRemovals:       make(map[string]*time.Timer),
		removalDelay:            60 * time.Second, // Give Nomad time to process drain state
		autoscalerReenableDelay: 10 * time.Second, // Wait after instance removal before re-enabling autoscaler
	}, nil
}

// HandleNodeStatusChange is called when a node's status changes
func (m *Manager) HandleNodeStatusChange(nodeInfo *node.NodeInfo, newStatus api.NodeStatus) {
	if newStatus == api.NodeStatusDraining {
		m.scheduleNodeRemoval(nodeInfo)
	}
}

// scheduleNodeRemoval schedules a node for removal after the delay period
func (m *Manager) scheduleNodeRemoval(nodeInfo *node.NodeInfo) {
	m.scheduledRemovalsMu.Lock()
	defer m.scheduledRemovalsMu.Unlock()

	// Cancel any existing timer for this node
	if timer, exists := m.scheduledRemovals[nodeInfo.ID]; exists {
		timer.Stop()
	}

	// Schedule the removal
	timer := time.AfterFunc(m.removalDelay, func() {
		if err := m.removeNodeFromInstanceGroup(context.Background(), nodeInfo.IPAddress); err != nil {
			m.logger.Errorf("Failed to remove node %s from instance group: %v", nodeInfo.ID, err)
		}
	})

	m.scheduledRemovals[nodeInfo.ID] = timer
}

// removeNodeFromInstanceGroup removes a node from the GCP instance group
func (m *Manager) removeNodeFromInstanceGroup(ctx context.Context, ip string) error {
	m.logger.Infow(
		"Starting node removal process",
		"nodeIP", ip,
		"projectID", m.projectID,
		"zone", m.zone,
		"instanceGroup", m.instanceGroup,
	)

	// Get the current autoscaler configuration
	autoscaler, err := m.compute.GetAutoscaler(ctx, m.projectID, m.zone, m.instanceGroup)
	if err != nil {
		m.logger.Warnw("Failed to get autoscaler, proceeding with instance removal", "error", err)
	} else {
		// Store the original mode
		originalMode := autoscaler.AutoscalingPolicy.Mode
		m.logger.Infow(
			"Current autoscaler configuration",
			"mode", originalMode,
			"minSize", autoscaler.AutoscalingPolicy.MinNumReplicas,
			"maxSize", autoscaler.AutoscalingPolicy.MaxNumReplicas,
		)

		// Disable autoscaling temporarily
		autoscaler.AutoscalingPolicy.Mode = "OFF"
		m.logger.Infow("Temporarily disabling autoscaler", "newMode", "OFF", "previousMode", originalMode)

		op, err := m.compute.UpdateAutoscaler(ctx, m.projectID, m.zone, autoscaler)
		if err != nil {
			m.logger.Warnw("Failed to disable autoscaler, proceeding anyway", "error", err)
		} else {
			if err := m.compute.WaitForOperation(ctx, m.projectID, m.zone, op.Name); err != nil {
				m.logger.Warnw("Failed waiting for autoscaler disable operation", "error", err)
			} else {
				m.logger.Info("Successfully disabled autoscaler")
			}
		}

		// Make sure we re-enable the autoscaler when we're done
		defer func() {
			// Add delay before re-enabling autoscaler
			m.logger.Infow("Waiting before re-enabling autoscaler", "delay", m.autoscalerReenableDelay)
			time.Sleep(m.autoscalerReenableDelay)

			m.logger.Infow("Restoring autoscaler configuration", "mode", originalMode)
			autoscaler.AutoscalingPolicy.Mode = originalMode
			op, err := m.compute.UpdateAutoscaler(ctx, m.projectID, m.zone, autoscaler)
			if err != nil {
				m.logger.Warnw("Failed to restore autoscaler mode", "error", err)
				return
			}
			if err := m.compute.WaitForOperation(ctx, m.projectID, m.zone, op.Name); err != nil {
				m.logger.Warnw("Failed waiting for autoscaler mode restore operation", "error", err)
			} else {
				m.logger.Infow("Successfully restored autoscaler configuration", "mode", originalMode)
			}
		}()
	}

	// Find instance by IP address
	instance, err := m.compute.FindInstanceByIP(ctx, m.projectID, m.zone, ip)
	if err != nil {
		return fmt.Errorf("failed to find instance by IP: %w", err)
	}

	m.logger.Infow(
		"Found instance to remove",
		"nodeIP", ip,
		"instanceName", instance.Name,
		"instanceSelfLink", instance.SelfLink,
		"instanceGroup", m.instanceGroup,
	)

	// Remove the instance
	op, err := m.compute.RemoveInstance(
		ctx,
		m.projectID,
		m.zone,
		m.instanceGroup,
		instance.Name,
	)
	if err != nil {
		return fmt.Errorf("failed to remove instance from instance group: %w", err)
	}

	// Wait for the removal operation to complete
	if err := m.compute.WaitForOperation(ctx, m.projectID, m.zone, op.Name); err != nil {
		return fmt.Errorf("failed waiting for instance removal operation: %w", err)
	}

	m.logger.Infow(
		"Successfully removed node from instance group",
		"nodeIP", ip,
		"instanceName", instance.Name,
		"instanceGroup", m.instanceGroup,
	)

	return nil
}
