# Implementation Plan: Controlled Node Scaling for E2B

## Overview

This plan outlines a practical approach to implement controlled scaling for E2B worker nodes by:

1. Leveraging existing monitoring and metrics collection
2. Using E2B's existing admin API for controlled node draining
3. Using GCP's instance group management APIs to remove specific instances

## Current State

- GCP autoscaler is configured in "ONLY_SCALE_OUT" mode with 60% CPU utilization target
- Node drain API endpoint is implemented and functional
- When a node is set to "draining" status, it triggers instance removal after a delay
- Autoscaler is temporarily disabled during instance removal to prevent race conditions

## Implementation Approach

### Phase 1: Node Removal Implementation (Completed)
- Implemented safe node removal process triggered by drain state
- Added delay before removal to allow workload migration
- Added autoscaler state management during removal
- Added comprehensive logging
- Reuses existing drain API endpoint

### Phase 2: Load Allocation Optimization (Completed)
- Successfully implemented sandbox allocation strategy to prefer fuller nodes
- Implementation completed:
  - Updated `getLeastBusyNode` to prefer nodes with higher utilization
  - Ensured sufficient resources are still available
  - Considered both current load and in-progress sandbox creations
  - Maintained existing safety checks
- Validation test successful:
  - Test with 6 jobs demonstrated correct behavior
  - First 5 jobs allocated to single server
  - 6th job correctly allocated to second server after drain API call
  - Confirmed proper load balancing and drain handling

### Phase 3: Simple Node Cleanup (Current Focus)
- Implement periodic check for empty nodes
- Implementation needs:
  - Add periodic task to check for nodes with zero sandboxes
  - If empty node found, set it to draining
  - Rely on existing minimum node count in autoscaler to prevent over-scaling
  - Reuse existing drain -> remove instance mechanism

## Testing Strategy

Tests will be written before implementation for each component:

1. Load Allocation Tests:
```go
func TestNodeAllocation(t *testing.T) {
    // Test allocation prefers fuller nodes
    // Test resource availability checks
    // Test safety mechanisms
}
```

2. Node Cleanup Tests:
```go
func TestNodeCleanup(t *testing.T) {
    // Test empty node detection
    // Test drain triggering
    // Test minimum node count respect
}
```

## Implementation Timeline

1. **Phase 1** (Completed):
   - Implemented instance group removal
   - Added safety mechanisms
   - Added comprehensive logging

2. **Phase 2** (Completed):
   - Implemented fuller-node-first allocation
   - Tested allocation behavior successfully
   - Verified resource availability checks
   - Demonstrated correct behavior in production test

3. **Phase 3** (Current Focus):
   - Implement simple periodic cleanup
   - Test cleanup behavior
   - Verify minimum node count handling

## Notes

- Using existing monitoring and metrics collection for decisions
- Leveraging existing minimum node count for scale-in control
- Keeping implementation simple and maintainable
- Focus on stability over complex optimization 


## Future Support

### Node Cycling

To maintain system health and prevent long-running nodes from accumulating state or performance issues, we should implement automatic node cycling:

1. **Track Node Age**:
   - Add creation timestamp to node metadata when nodes are created
   - Store this in the `Node` struct

2. **Age-Based Node Selection**:
   - Modify `getOptimalNode` to consider node age when selecting nodes
   - Prefer newer nodes when utilization is similar
   - Add weight factors for balancing age vs. utilization
