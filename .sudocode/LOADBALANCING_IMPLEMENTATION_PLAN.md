# Implementation Plan: Simplified Load Balancing for E2B

## Overview

This plan outlines a simplified approach to implement load balancing for E2B worker nodes by:

1. Enhancing the autoscaling capabilities of Nomad client nodes
2. Implementing a basic resource threshold-based scaling policy
3. Solving the scale-down challenge with a node draining approach
4. Implementing a simple and effective allocation strategy

## Current State Analysis

Based on the codebase analysis, E2B currently has:

1. **Basic Autoscaling**: GCP autoscaler configured to scale out (but not in) based on CPU utilization (target of 60%)
2. **Simple Node Selection**: Uses a "least busy node" algorithm based primarily on CPU usage
3. **Fixed Minimum Nodes**: A static `client_cluster_size` parameter defines the minimum number of worker nodes
4. **Maximum Node Cap**: A `client_cluster_auto_scaling_max` parameter defines the maximum additional nodes
5. **No On-Demand Scaling**: When no suitable nodes are available, the system fails after retrying for 60 seconds

## Phase 1: Enhanced Autoscaling Configuration

### 1.1 Modify Autoscaler Configuration

Update the GCP autoscaler to support both scaling out and scaling in:

```terraform
# In packages/cluster/client/main.tf
resource "google_compute_autoscaler" "default" {
  provider = google-beta

  name   = "${var.cluster_name}-autoscaler"
  zone   = var.gcp_zone
  target = google_compute_instance_group_manager.client_cluster.id

  autoscaling_policy {
    max_replicas    = var.cluster_size + var.cluster_auto_scaling_max
    min_replicas    = var.cluster_size # Use existing cluster_size as minimum
    cooldown_period = 300 # Increased to prevent thrashing
    mode            = "ON" # Changed from ONLY_SCALE_OUT to ON

    # Use both CPU and memory for scaling decisions
    cpu_utilization {
      target = 0.6 # Scale out when CPU reaches 60%
    }
    
    # Add memory-based scaling
    metric {
      name   = "compute.googleapis.com/instance/memory/percent_used"
      target = 0.6 # Scale out when memory reaches 60%
      type   = "GAUGE"
    }
    
    # Add a custom metric for pending jobs
    metric {
      name   = "custom.googleapis.com/e2b/pending_jobs_signal"
      target = 0.1 # Any value above 0 should trigger scaling
      type   = "GAUGE"
    }
  }
}
```

### 1.2 Test Criteria for Phase 1

1. **Terraform Configuration Test**
   - Test that applies the Terraform configuration and verifies it creates the expected resources
   - Test that confirms the autoscaler is configured with both CPU and memory metrics

2. **Scale-Out Test**
   - Test that creates high CPU/memory load on existing nodes and verifies new nodes are provisioned
   - Test that confirms scaling respects the maximum node limit

3. **Scale-In Test**
   - Test that reduces load on the cluster and verifies nodes are eventually removed
   - Test that confirms scaling respects the minimum node limit

### 1.3 Acceptance Criteria for Phase 1

- Terraform configuration successfully applies without errors (verified by CI/CD pipeline)
- Test that demonstrates the GCP autoscaler configuration includes both CPU and memory metrics
- Test that demonstrates the system scales out when CPU utilization exceeds 60% or memory exceeds 60%
- Test that demonstrates the system scales in when resources are underutilized
- Test that demonstrates minimum and maximum node counts are respected

## Phase 2: Simplified Node Selection

### 2.1 Implement Simple Node Selection

Modify the node selection algorithm to prefer nodes with 30-70% utilization, falling back to less utilized nodes:

```go
// In packages/api/internal/orchestrator/create_instance.go
func (o *Orchestrator) getOptimalNode(ctx context.Context) (*Node, error) {
    ctx, cancel := context.WithTimeout(ctx, nodeSelectionTimeout)
    defer cancel()
    
    var optimalNode *Node
    var fallbackNode *Node
    
    for _, node := range o.nodes.Items() {
        // Skip invalid nodes
        if node == nil || node.Status() != api.NodeStatusReady {
            continue
        }
        
        // Skip nodes in drain mode or pending draining
        if node.DrainMode || node.PendingDrain {
            continue
        }
        
        // Skip overloaded nodes
        if node.sbxsInProgress.Count() > maxStartingInstancesPerNode {
            continue
        }
        
        // Calculate node utilization (simple average of CPU and RAM)
        cpuUtil := float64(node.Info.Resources.CPUUsed) / float64(node.Info.Resources.CPU)
        ramUtil := float64(node.Info.Resources.MemoryUsed) / float64(node.Info.Resources.Memory)
        avgUtil := (cpuUtil + ramUtil) / 2
        
        // Prefer nodes in the 30-70% range
        if avgUtil >= 0.3 && avgUtil <= 0.7 {
            // If we haven't found an optimal node yet, or this one is less busy
            if optimalNode == nil || node.CPUUsage.Load() < optimalNode.CPUUsage.Load() {
                optimalNode = node
            }
        } else if avgUtil < 0.3 {
            // This is a fallback node (low utilization)
            if fallbackNode == nil || node.CPUUsage.Load() < fallbackNode.CPUUsage.Load() {
                fallbackNode = node
            }
        }
        // Nodes over 70% utilization are not considered
    }
    
    // If we found a node in the optimal range, use it
    if optimalNode != nil {
        return optimalNode, nil
    }
    
    // Otherwise, use the best fallback node
    if fallbackNode != nil {
        return fallbackNode, nil
    }
    
    return nil, fmt.Errorf("no suitable node found")
}
```

### 2.2 Update Sandbox Creation to Use New Selection Algorithm

Modify the CreateSandbox function to use the new node selection algorithm:

```go
// In packages/api/internal/orchestrator/create_instance.go
func (o *Orchestrator) CreateSandbox(
    // ... existing parameters ...
) (*api.Sandbox, error) {
    // ... existing code ...
    
    attempt := 1
    nodesExcluded := make(map[string]*Node)
    for {
        // ... existing timeout handling ...
        
        if node == nil {
            // Use the new selection algorithm instead of getLeastBusyNode
            node, err = o.getOptimalNode(childCtx)
            if err != nil {
                // If no optimal node is found, try again excluding any nodes we've already tried
                node, err = o.getLeastBusyNodeExcluding(childCtx, nodesExcluded)
                if err != nil {
                    errMsg := fmt.Errorf("failed to find suitable node: %w", err)
                    telemetry.ReportError(childCtx, errMsg)
                    return nil, errMsg
                }
            }
        }
        
        // ... rest of existing code ...
    }
    
    // ... rest of function ...
}
```

### 2.3 Test Criteria for Phase 2

1. **Node Selection Test**
   - Test that creates a cluster with nodes at various utilization levels and verifies the selection algorithm chooses nodes in the 30-70% range
   - Test that verifies fallback to less utilized nodes when no nodes are in the optimal range
   - Test that verifies nodes in drain mode or pending drain are excluded from selection

2. **Node Distribution Test**
   - Test that creates multiple sandboxes and verifies they are distributed according to the utilization strategy

### 2.4 Acceptance Criteria for Phase 2

- Test that demonstrates the system selects nodes in the 30-70% utilization range when available
- Test that demonstrates the system falls back to less utilized nodes when no nodes are in the optimal range
- Test that demonstrates sandboxes are distributed to achieve balanced utilization across nodes
- Test that demonstrates nodes in drain mode or pending drain are excluded from the selection process

## Phase 3: Simple Node Draining for Scale-Down

### 3.1 Implement Node Draining for Scale-Down

Create a simple node draining mechanism that allows scaling down:

```go
// In packages/api/internal/orchestrator/node.go
type Node struct {
    // ... existing fields ...
    DrainMode    bool
    PendingDrain bool
}

// In packages/api/internal/orchestrator/scaling.go
func (o *Orchestrator) startScalingMonitor(ctx context.Context) {
    ticker := time.NewTicker(5 * time.Minute)
    defer ticker.Stop()
    
    for {
        select {
        case <-ctx.Done():
            return
        case <-ticker.C:
            o.evaluateClusterUtilization(ctx)
        }
    }
}

func (o *Orchestrator) evaluateClusterUtilization(ctx context.Context) {
    // Get all nodes
    nodes := o.nodes.Items()
    
    // Calculate total and used resources
    var totalCPU, usedCPU, totalRAM, usedRAM int64
    var nodeCount, drainingCount, pendingDrainCount int
    var emptyNodes, lowUtilNodes []*Node
    
    for _, node := range nodes {
        if node == nil || node.Status() != api.NodeStatusReady {
            continue
        }
        
        nodeCount++
        totalCPU += node.Info.Resources.CPU
        usedCPU += node.Info.Resources.CPUUsed
        totalRAM += node.Info.Resources.Memory
        usedRAM += node.Info.Resources.MemoryUsed
        
        if node.DrainMode {
            drainingCount++
            continue
        }
        
        if node.PendingDrain {
            pendingDrainCount++
            continue
        }
        
        // Calculate node utilization
        cpuUtil := float64(node.Info.Resources.CPUUsed) / float64(node.Info.Resources.CPU)
        ramUtil := float64(node.Info.Resources.MemoryUsed) / float64(node.Info.Resources.Memory)
        avgUtil := (cpuUtil + ramUtil) / 2
        
        // Categorize nodes
        if avgUtil == 0 {
            emptyNodes = append(emptyNodes, node)
        } else if avgUtil < 0.3 {
            lowUtilNodes = append(lowUtilNodes, node)
        }
    }
    
    // Calculate overall utilization
    cpuUtilization := float64(usedCPU) / float64(totalCPU)
    ramUtilization := float64(usedRAM) / float64(totalRAM)
    
    // Log current utilization
    o.logger.Info("Cluster utilization",
        "cpu_utilization", cpuUtilization,
        "ram_utilization", ramUtilization,
        "node_count", nodeCount,
        "draining_count", drainingCount,
        "pending_drain_count", pendingDrainCount,
    )
    
    // Simple draining logic:
    // 1. Only drain if we have more than minimum nodes
    // 2. Only drain one node at a time
    // 3. Only drain if overall utilization is low
    // 4. Prefer to drain empty nodes first, then low utilization nodes
    
    if nodeCount > o.config.MinNodes && drainingCount == 0 && pendingDrainCount == 0 && cpuUtilization < 0.4 && ramUtilization < 0.4 {
        var nodeToDrain *Node
        
        if len(emptyNodes) > 0 {
            nodeToDrain = emptyNodes[0]
        } else if len(lowUtilNodes) > 0 {
            // Find the least busy node among low utilization nodes
            nodeToDrain = o.findLeastBusyNode(lowUtilNodes)
        }
        
        if nodeToDrain != nil {
            // Mark node as pending drain first
            nodeToDrain.PendingDrain = true
            
            // Log the action
            o.logger.Info("Marking node for pending drain",
                "node_id", nodeToDrain.Info.ID,
                "utilization", float64(nodeToDrain.Info.Resources.CPUUsed) / float64(nodeToDrain.Info.Resources.CPU),
            )
            
            // Start the drain process
            go o.startNodeDrainProcess(ctx, nodeToDrain)
        }
    }
}

func (o *Orchestrator) startNodeDrainProcess(ctx context.Context, node *Node) {
    // First, mark the node as pending drain to prevent new allocations
    // This is already done in evaluateClusterUtilization
    
    // Wait for existing in-progress sandboxes to complete
    // This is a simple approach - in production, you might want more sophisticated logic
    waitCtx, cancel := context.WithTimeout(ctx, 10*time.Minute)
    defer cancel()
    
    ticker := time.NewTicker(30 * time.Second)
    defer ticker.Stop()
    
    for {
        select {
        case <-waitCtx.Done():
            // If we time out waiting, proceed with drain anyway
            o.logger.Warn("Timed out waiting for in-progress sandboxes to complete",
                "node_id", node.Info.ID,
                "in_progress_count", node.sbxsInProgress.Count(),
            )
            break
        case <-ticker.C:
            // Check if there are still sandboxes in progress
            if node.sbxsInProgress.Count() == 0 {
                // All sandboxes completed, we can proceed
                break
            }
            
            o.logger.Info("Waiting for in-progress sandboxes to complete before draining",
                "node_id", node.Info.ID,
                "in_progress_count", node.sbxsInProgress.Count(),
            )
            continue
        }
        
        // Exit the loop if we broke out of the select
        break
    }
    
    // Now mark the node for actual draining
    node.DrainMode = true
    node.PendingDrain = false
    
    // Log the action
    o.logger.Info("Marking node for draining",
        "node_id", node.Info.ID,
        "utilization", float64(node.Info.Resources.CPUUsed) / float64(node.Info.Resources.CPU),
    )
    
    // Notify Nomad to drain the node
    o.drainNodeInNomad(ctx, node.Info.ID)
}

func (o *Orchestrator) findLeastBusyNode(nodes []*Node) *Node {
    var leastBusyNode *Node
    var lowestUsage float64 = 1.0
    
    for _, node := range nodes {
        cpuUtil := float64(node.Info.Resources.CPUUsed) / float64(node.Info.Resources.CPU)
        ramUtil := float64(node.Info.Resources.MemoryUsed) / float64(node.Info.Resources.Memory)
        avgUtil := (cpuUtil + ramUtil) / 2
        
        if leastBusyNode == nil || avgUtil < lowestUsage {
            leastBusyNode = node
            lowestUsage = avgUtil
        }
    }
    
    return leastBusyNode
}

func (o *Orchestrator) drainNodeInNomad(ctx context.Context, nodeID string) {
    // Set drain strategy in Nomad
    spec := &api.DrainSpec{
        Deadline:         4 * time.Hour,
        IgnoreSystemJobs: false,
    }
    
    _, err := o.nomadClient.Nodes().UpdateDrain(nodeID, spec, false, nil)
    if err != nil {
        o.logger.Error("Failed to set node drain mode", "node_id", nodeID, "error", err)
        return
    }
}
```

### 3.2 Test Criteria for Phase 3

1. **Node Draining Test**
   - Test that creates a cluster with underutilized nodes and verifies the least busy node is marked for pending drain
   - Test that verifies nodes transition from pending drain to drain mode after in-progress sandboxes complete
   - Test that verifies the Nomad drain API is called with the correct parameters

2. **Minimum Node Test**
   - Test that attempts to drain nodes when at or near minimum node count and verifies the minimum is respected

3. **Drain Mode Exclusion Test**
   - Test that creates sandboxes when some nodes are in drain mode or pending drain and verifies these nodes are excluded from selection

### 3.3 Acceptance Criteria for Phase 3

- Test that demonstrates the system identifies underutilized nodes when appropriate
- Test that demonstrates empty nodes are drained before low utilization nodes
- Test that demonstrates the system respects the minimum node count
- Test that demonstrates nodes in drain mode are excluded from sandbox placement
- Test that demonstrates nodes pending drain are excluded from sandbox placement
- Test that demonstrates nodes transition properly from pending drain to drain mode
- Test that demonstrates the pending drain state is set before the drain mode state
- Test that demonstrates in-progress sandboxes are allowed to complete on nodes in pending drain state

## Phase 4: Simple Resource Monitoring

### 4.1 Add Basic Resource Monitoring

Implement simple resource monitoring to track cluster utilization:

```go
// In packages/api/internal/metrics/capacity.go
func (m *MetricsCollector) registerCapacityMetrics() {
    m.gauges["cluster_total_cpu"] = promauto.NewGauge(prometheus.GaugeOpts{
        Name: "e2b_cluster_total_cpu",
        Help: "Total CPU resources in the cluster",
    })
    
    m.gauges["cluster_used_cpu"] = promauto.NewGauge(prometheus.GaugeOpts{
        Name: "e2b_cluster_used_cpu",
        Help: "Used CPU resources in the cluster",
    })
    
    m.gauges["cluster_total_memory"] = promauto.NewGauge(prometheus.GaugeOpts{
        Name: "e2b_cluster_total_memory",
        Help: "Total memory resources in the cluster (MB)",
    })
    
    m.gauges["cluster_used_memory"] = promauto.NewGauge(prometheus.GaugeOpts{
        Name: "e2b_cluster_used_memory",
        Help: "Used memory resources in the cluster (MB)",
    })
    
    m.gauges["cluster_node_count"] = promauto.NewGauge(prometheus.GaugeOpts{
        Name: "e2b_cluster_node_count",
        Help: "Number of nodes in the cluster",
    })
    
    m.gauges["cluster_draining_nodes"] = promauto.NewGauge(prometheus.GaugeOpts{
        Name: "e2b_cluster_draining_nodes",
        Help: "Number of nodes in drain mode",
    })
    
    m.gauges["cluster_pending_drain_nodes"] = promauto.NewGauge(prometheus.GaugeOpts{
        Name: "e2b_cluster_pending_drain_nodes",
        Help: "Number of nodes pending drain",
    })
}

func (m *MetricsCollector) updateCapacityMetrics() {
    // Get data from orchestrator
    nodes := m.orchestrator.GetNodes()
    
    var totalCPU, usedCPU, totalMemory, usedMemory float64
    var nodeCount, drainingCount, pendingDrainCount int
    
    for _, node := range nodes {
        if node.Status() == api.NodeStatusReady {
            nodeCount++
            totalCPU += float64(node.Info.Resources.CPU)
            usedCPU += float64(node.Info.Resources.CPUUsed)
            totalMemory += float64(node.Info.Resources.Memory)
            usedMemory += float64(node.Info.Resources.MemoryUsed)
            
            if node.DrainMode {
                drainingCount++
            }
            
            if node.PendingDrain {
                pendingDrainCount++
            }
        }
    }
    
    // Update metrics
    m.gauges["cluster_total_cpu"].Set(totalCPU)
    m.gauges["cluster_used_cpu"].Set(usedCPU)
    m.gauges["cluster_total_memory"].Set(totalMemory)
    m.gauges["cluster_used_memory"].Set(usedMemory)
    m.gauges["cluster_node_count"].Set(float64(nodeCount))
    m.gauges["cluster_draining_nodes"].Set(float64(drainingCount))
    m.gauges["cluster_pending_drain_nodes"].Set(float64(pendingDrainCount))
}
```

### 4.2 Test Criteria for Phase 4

1. **Metrics Registration Test**
   - Test that verifies all required metrics are registered with Prometheus

2. **Metrics Collection Test**
   - Test that creates a cluster with known resource usage and verifies metrics accurately reflect the state

### 4.3 Acceptance Criteria for Phase 4

- Test that demonstrates all metrics are registered correctly
- Test that demonstrates metrics accurately reflect the cluster state
- Test that demonstrates metrics update at the expected intervals

## Phase 5: Pending Jobs Signal

### 5.1 Implement Pending Jobs Signal

Create a simple mechanism to signal when jobs are waiting for resources:

```go
// In packages/api/internal/metrics/scaling.go
func (m *MetricsCollector) registerScalingMetrics() {
    m.gauges["pending_jobs_signal"] = promauto.NewGauge(prometheus.GaugeOpts{
        Name: "e2b_pending_jobs_signal",
        Help: "Signal that indicates jobs are waiting for resources (0 = no pending jobs, 1 = pending jobs)",
    })
    
    m.gauges["pending_jobs_count"] = promauto.NewGauge(prometheus.GaugeOpts{
        Name: "e2b_pending_jobs_count",
        Help: "Number of jobs waiting for resources",
    })
}

// In packages/api/internal/orchestrator/create_instance.go
func (o *Orchestrator) getLeastBusyNodeWithResourceSignal(parentCtx context.Context, nodesExcluded map[string]*Node) (*Node, error) {
    // Signal that we're waiting for resources
    if o.metricsCollector != nil {
        o.metricsCollector.SetGauge("e2b_pending_jobs_signal", 1)
        o.metricsCollector.IncrementGauge("e2b_pending_jobs_count", 1)
    }
    
    // Make sure we clean up the metrics when we're done
    defer func() {
        if o.metricsCollector != nil {
            o.metricsCollector.DecrementGauge("e2b_pending_jobs_count", 1)
            // Only reset the signal to 0 if there are no more pending jobs
            if o.metricsCollector.GetGauge("e2b_pending_jobs_count") <= 0 {
                o.metricsCollector.SetGauge("e2b_pending_jobs_signal", 0)
            }
        }
    }()
    
    // Use the existing getLeastBusyNode logic but with the added signal
    return o.getLeastBusyNodeExcluding(parentCtx, nodesExcluded)
}
```

### 5.2 Update Sandbox Creation to Use the Resource Signal

Modify the CreateSandbox function to use the new node selection with resource signaling:

```go
// In packages/api/internal/orchestrator/create_instance.go
func (o *Orchestrator) CreateSandbox(
    // ... existing parameters ...
) (*api.Sandbox, error) {
    // ... existing code ...
    
    attempt := 1
    nodesExcluded := make(map[string]*Node)
    
    for {
        select {
        case <-childCtx.Done():
            return nil, sandboxCreateFailedError
        default:
            // Continue
        }
        
        if attempt > maxNodeRetries {
            return nil, fmt.Errorf("no suitable nodes available after %d attempts - please try again later", maxNodeRetries)
        }
        
        if node == nil {
            // Try to get a node with resource signaling
            node, err = o.getLeastBusyNodeWithResourceSignal(childCtx, nodesExcluded)
            if err != nil {
                errMsg := fmt.Errorf("failed to get suitable node: %w", err)
                telemetry.ReportError(childCtx, errMsg)
                
                // If this was a timeout error, provide a more helpful message
                if errors.Is(err, context.DeadlineExceeded) {
                    return nil, fmt.Errorf("all nodes are currently busy - the system is scaling to accommodate your request, please try again in a few minutes")
                }
                
                return nil, errMsg
            }
        }
        
        // ... rest of existing code ...
    }
    
    // ... rest of existing code ...
}
```

### 5.3 Test Criteria for Phase 5

1. **Resource Signaling Test**
   - Test that creates a sandbox when resources are constrained
   - Test that verifies the pending jobs signal metric is set correctly

2. **Autoscaler Response Test**
   - Test that verifies the autoscaler responds to the pending jobs signal
   - Test that confirms new nodes are provisioned when jobs are waiting

### 5.4 Acceptance Criteria for Phase 5

- Test that demonstrates the system correctly signals when jobs are waiting for resources
- Test that demonstrates the autoscaler responds to the pending jobs signal by scaling out
- Test that demonstrates the system provides helpful error messages when resources are constrained

## Integration Tests

### End-to-End Scaling Test

This test validates the entire system working together:

1. **Test Setup**:
   - Create a test cluster with minimum nodes
   - Generate increasing load until scaling threshold is reached
   - Verify new nodes are added
   - Reduce load below scale-in threshold
   - Verify least busy node is marked for draining
   - Verify node count eventually reduces

### Acceptance Criteria for Integration Tests

- Test that demonstrates the system scales out when load increases
- Test that demonstrates new sandboxes are distributed according to the optimal utilization strategy
- Test that demonstrates the system identifies underutilized nodes when load decreases
- Test that demonstrates underutilized nodes are marked for pending drain before being fully drained
- Test that demonstrates no new sandboxes are allocated to nodes in pending drain or drain mode
- Test that demonstrates the system eventually scales in by removing drained nodes
- Test that demonstrates metrics accurately reflect all state changes during the test
- Test that demonstrates the pending drain count and draining count metrics are updated correctly

## Implementation Summary

This simplified approach focuses on:

1. **Basic Resource-Based Scaling**: Scale out when CPU or memory utilization reaches thresholds
2. **Simple Node Selection**: Prefer nodes with 30-70% utilization for better resource efficiency
3. **Basic Node Draining**: Mark underutilized nodes for draining to enable scale-down
4. **Simple Monitoring**: Track basic resource metrics to observe scaling behavior
5. **Resource Constraint Signaling**: Signal when jobs are waiting for resources to trigger scaling

The implementation avoids complex algorithms and focuses on practical, immediate improvements to the load balancing system.

## Key Benefits

1. **Efficient Resource Utilization**: Automatically scales based on actual resource usage
2. **Optimal Node Distribution**: Keeps nodes in the ideal 30-70% utilization range
3. **Cost Optimization**: Enables scaling down when resources are underutilized
4. **Simplicity**: Straightforward implementation that can be completed quickly
5. **Observability**: Basic metrics to monitor scaling behavior
6. **Responsiveness**: Resource constraint signaling ensures the system scales when needed

This approach solves the core scaling challenges while remaining simple enough to implement in 1-2 days. 