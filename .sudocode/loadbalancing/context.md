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
- Load allocation optimization is complete:
  - Sandbox allocation prefers fuller nodes
  - Successfully tested with multiple jobs
  - Proper handling of drain states
  - Resource availability checks in place

### Completed Work
- Implemented node drain state management
- Added instance removal on drain state
- Added safety delay before instance removal
- Added autoscaler state management during removal
- Added comprehensive logging for scaling operations
- Completed load allocation optimization:
  - Modified allocation strategy to prefer fuller nodes
  - Implemented resource availability checks
  - Verified behavior with production test
  - Confirmed proper drain state handling

### Next Steps

1. Simple Node Cleanup (Current Focus)
   - Add periodic check for empty nodes
   - Use drain state to trigger removal
   - Leverage existing minimum node count from autoscaler
   - Reuse existing instance removal mechanism

### Temporarily Reverted Changes (To Be Reapplied)
We temporarily reverted the following changes to debug an issue:

1. `packages/api/internal/node/node.go`:
   ```go
   // GetID returns the node ID
   func (n *NodeInfo) GetID() string {
       return n.ID
   }
   ```

2. `packages/api/internal/orchestrator/node.go`:
   - Added `lastEmptyStateTime atomic.Value` field
   - Added methods:
     - `MarkEmpty()`: Sets empty timestamp
     - `MarkActive()`: Clears empty timestamp
     - `EmptyDuration()`: Returns duration of empty state
     - `IsEmpty()`: Checks if node is empty
     - `GetInfo()`: Returns node info interface

3. `packages/api/internal/orchestrator/cache.go`:
   - Added empty node tracking in `getDeleteInstanceFunction`
   - Added node activation in `getInsertInstanceFunction`

4. `packages/api/internal/orchestrator/orchestrator.go`:
   - Added cleanup manager integration
   - Added `GetCleanupNodes()` method

Plan is to reapply these changes one by one, testing each step to ensure stability.

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
- Phase 2 (Complete): Load allocation optimization
- Phase 3 (In Progress): Simple node cleanup
  
### Current Testing Changes
Currently testing minimal changes:
1. Added log line "Starting node sync" in `orchestrator.go` to improve visibility of node sync process
2. Added `GetID()` method to `NodeInfo` struct as foundation for node tracking

### Pending Changes (To Be Added Incrementally)
We'll add these changes back one by one after validating current changes:

1. Node Empty State Tracking (`packages/api/internal/orchestrator/node.go`):
   ```go
   type Node struct {
       // ... existing fields ...
       lastEmptyStateTime atomic.Value
   }
   ```
   - Methods to add:
     - `MarkEmpty()`: Sets empty timestamp
     - `MarkActive()`: Clears empty timestamp
     - `EmptyDuration()`: Returns duration of empty state
     - `IsEmpty()`: Checks if node is empty
     - `GetInfo()`: Returns node info interface

2. Cache Operation Updates (`packages/api/internal/orchestrator/cache.go`):
   - Add empty node tracking in `getDeleteInstanceFunction`
   - Add node activation in `getInsertInstanceFunction`

3. Cleanup Manager Integration (`packages/api/internal/orchestrator/orchestrator.go`):
   - Add `cleanupMgr *scaling.NodeCleanupManager` field
   - Add `GetCleanupNodes()` method
   - Initialize cleanup manager in `New()`

### Testing Strategy
1. Current Changes:
   - Deploy and verify "Starting node sync" appears in logs
   - Confirm `GetID()` method works with existing node operations
   - Monitor for any unexpected behavior

2. For Each Pending Change:
   - Add one component at a time
   - Deploy and verify logs
   - Test specific functionality
   - Monitor system stability
   - Only proceed to next change after validation

## Work In Progress
- Testing minimal changes for node sync logging
- Validating `GetID()` method integration
- Planning incremental addition of empty state tracking

## Work TODO
1. After current changes are validated:
   - Add empty state tracking to Node struct
   - Implement empty state management in cache operations
   - Add cleanup manager integration
   - Set up comprehensive logging for cleanup operations
   - Add monitoring and alerts

