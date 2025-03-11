#

Refer to global context in [context.md](../context.md)

# Context

## Load Balancing

Phase 1.1 of controlled node scaling has been implemented:

### Completed Work
- Added drain mode support to Node struct with atomic fields:
  ```go
  type Node struct {
      // ... existing fields ...
      draining     atomic.Bool
      pendingDrain atomic.Bool
  }
  ```
- Updated node selection logic in `getLeastBusyNode` to exclude draining/pending drain nodes
- Added test coverage for node selection behavior
- Removed unnecessary getter/setter methods in favor of direct atomic operations
- Updated status logging to include drain state information

### Modified Files
- `packages/api/internal/orchestrator/node.go`: Added drain mode fields
- `packages/api/internal/orchestrator/create_instance.go`: Updated node selection logic
- `packages/api/internal/orchestrator/create_instance_test.go`: Added test coverage
- `packages/api/internal/orchestrator/orchestrator.go`: Updated status logging

### Test Results
```
=== RUN   TestGetLeastBusyNode
=== RUN   TestGetLeastBusyNode/Should_select_least_busy_node
=== RUN   TestGetLeastBusyNode/Should_skip_draining_nodes
=== RUN   TestGetLeastBusyNode/Should_skip_pending_drain_nodes
--- PASS: TestGetLeastBusyNode (0.03s)
PASS
ok      github.com/e2b-dev/infra/packages/api/internal/orchestrator     0.357s
```

### Design Decisions
1. Using atomic operations directly instead of getter/setter methods
2. Focusing tests on behavior (node selection) rather than implementation details
3. Maintaining thread safety through atomic fields
4. Following existing codebase patterns for field access
5. Using E2B's admin API for node drain control instead of Nomad's event stream

## Work In Progress
- Phase 1.2: Implementing node drain control using E2B admin API
- Phase 1.3: Implementing instance removal process
- Phase 2: Automated scaling monitor

## Work TODO
1. Phase 1.2:
   - Implement `DrainNode` method using admin API
   - Add monitoring for node allocation status
   - Add timeout handling for drain operations
   - Add logging for drain operations

2. Phase 1.3:
   - Implement handler for waiting on in-progress workloads
   - Add verification of node drain status
   - Implement GCP instance group removal
   - Add logging for removal process

3. Phase 2:
   - Create scaling monitor
   - Implement utilization calculations
   - Add configuration for scaling parameters
   - Set up monitoring and alerting

