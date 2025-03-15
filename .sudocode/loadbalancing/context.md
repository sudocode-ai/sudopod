#

Refer to global context in [context.md](../context.md)

# Context

## Load Balancing

We are implementing controlled node scaling for E2B, focusing on efficient resource utilization and system stability.

### Implementation Changes
Key files modified:
- `packages/api/internal/orchestrator/scaling/scaling.go` (new): Core scaling manager implementation
- `packages/api/internal/orchestrator/scaling/scaling_test.go` (new): Tests for scaling functionality
- `packages/api/internal/orchestrator/node.go`: Added node status change handling
- `packages/api/internal/orchestrator/orchestrator.go`: Integrated scaling manager
- `packages/api/internal/orchestrator/client.go`: Client-side changes for scaling
- Infrastructure changes:
  - `main.tf`: Updated autoscaler configuration
  - `packages/nomad/*.tf`: Updated Nomad configuration for node management
  - `packages/cluster/outputs.tf`: Added outputs for scaling
  - `packages/shared/pkg/consts/gcp.go`: Added GCP-related constants

### Current State
- GCP autoscaler is configured in "ONLY_SCALE_OUT" mode (60% CPU utilization target)
- Node drain API endpoint (`/nodes/{nodeID}`) triggers instance removal after a delay
- Autoscaler is temporarily disabled during instance removal to prevent race conditions
- Basic node monitoring is in place:
  - CPU and memory usage tracking
  - Sandbox allocation tracking
  - Regular status logging

### Completed Work
- Implemented node drain state management
- Added instance removal on drain state
- Added safety delay before instance removal
- Added autoscaler state management during removal
- Added comprehensive logging for scaling operations

### Next Steps

1. Load Allocation Optimization
   - Change allocation strategy to prefer fuller nodes
   - Ensure sufficient resources remain available
   - Consider both current load and pending operations
   - Maintain existing safety checks

2. Simple Node Cleanup
   - Add periodic check for empty nodes
   - Use drain state to trigger removal
   - Leverage existing minimum node count from autoscaler
   - Reuse existing instance removal mechanism

### Design Decisions
1. Use existing monitoring infrastructure
2. Leverage node drain API for controlled scaling
3. Keep node cleanup simple:
   - Only remove completely empty nodes
   - Use autoscaler's minimum node count as safety limit
4. Focus on stability over complex optimization

### Required Features
1. Load Allocation
   - Modified node selection algorithm
   - Resource availability checks
   - Load balancing metrics

2. Node Cleanup
   - Simple periodic empty node check
   - Drain state triggering
   - Minimum node count enforcement

### Future Considerations
- Fine-tune scaling thresholds
- Monitor cleanup behavior
- Adjust minimum node count based on usage patterns
- Consider predictive scaling if needed

## Implementation Status
- Phase 1 (Complete): Instance group removal on drain
- Phase 2 (Next): Load allocation optimization
- Phase 3 (Planned): Simple node cleanup

## Work In Progress
- Phase 1: Implementing instance group removal process
- Phase 2: Implementing automated scaling using existing metrics

## Work TODO
1. Phase 1:
   - Implement GCP instance group removal
   - Add logging for removal process
   - Add error handling

2. Phase 2:
   - Define utilization thresholds
   - Implement scaling decision logic
   - Add safety mechanisms
   - Set up alerts

