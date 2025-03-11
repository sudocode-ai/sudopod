# Implementation Plan: Controlled Node Scaling for E2B

## Overview

This plan outlines a practical approach to implement controlled scaling for E2B worker nodes by:

1. Leveraging existing monitoring and metrics collection
2. Using E2B's existing admin API for controlled node draining
3. Using GCP's instance group management APIs to remove specific instances

## Current State Analysis

Based on the codebase analysis, E2B currently has:

1. **Monitoring Infrastructure**
   - Node CPU and memory usage tracking
   - Sandbox allocation tracking
   - Regular status logging
   - OpenTelemetry metrics collection

2. **Autoscaling**
   - GCP autoscaler configured to scale out based on 60% CPU utilization target
   - "ONLY_SCALE_OUT" mode prevents automatic scale-in
   - Fixed minimum nodes via `cluster_size`
   - Maximum node cap via `cluster_auto_scaling_max`

3. **Node Management**
   - Existing drain API endpoint
   - Node selection excludes draining nodes
   - Status tracking implemented

## Implementation Approach

### Phase 1: Node Removal Implementation

#### Goals
- Implement safe node removal process
- Ensure no workload disruption
- Clean removal from GCP instance group

#### Implementation

1. Instance Group Removal
   - Tests should verify:
     - Correct mapping of node to GCP instance using IP
     - Proper instance removal when node is empty
     - Error handling for GCP API failures
   - Implementation needs:
     - Map node to GCP instance using IP
     - Remove instance using GCP API
     - Handle errors and provide logging

### Phase 2: Automated Node Scaling

#### Goals
- Leverage existing monitoring to identify underutilized nodes
- Safely drain and remove nodes when possible
- Maintain minimum node count and service capacity

#### Implementation

1. Node Usage Monitor
   - Tests should verify:
     - Proper utilization threshold checks
     - Respect for minimum node count
     - Safe node selection for removal
   - Implementation needs:
     - Define utilization thresholds
     - Implement drain decision logic
     - Add safety mechanisms

## Testing Strategy

Tests will be written before implementation for each component:

1. Instance Group Tests:
```go
func TestInstanceRemoval(t *testing.T) {
    // Test GCP instance identification
    // Test instance group removal
    // Test error handling
}

func TestNodeScaling(t *testing.T) {
    // Test utilization threshold checks
    // Test minimum node count enforcement
    // Test node selection for removal
}
```

## Implementation Timeline

1. **Phase 1** (Current Focus):
   - Implement and test instance group removal
   - Document behavior and API usage

2. **Phase 2** (Next):
   - Implement automated scaling using existing metrics
   - Add safety mechanisms and logging
   - Test scaling behavior

## Notes

- Existing monitoring and metrics collection will be used for scaling decisions
- No need to implement new monitoring systems
- Focus on using the data we already have to make scaling decisions 