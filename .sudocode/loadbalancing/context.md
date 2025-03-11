#

Refer to global context in [context.md](../context.md)

# Context

## Load Balancing

We are implementing controlled node scaling for E2B, focusing on leveraging existing monitoring infrastructure to make scaling decisions.

### Current State
- GCP autoscaler is configured in "ONLY_SCALE_OUT" mode with 60% CPU utilization target
- Comprehensive monitoring is in place:
  - Node CPU and memory usage tracking
  - Sandbox allocation tracking
  - Regular status logging
  - OpenTelemetry metrics collection
- Node drain API endpoint exists and is functional
- Node selection properly handles drain state

### Completed Work
- Verified existing monitoring capabilities
- Confirmed node selection properly handles drain state
- Identified GCP instance group APIs needed for node removal

### Next Steps
1. Instance Group Removal
   - Design tests for GCP instance mapping
   - Implement instance removal logic
   - Add error handling and logging

2. Automated Node Scaling
   - Design tests for scaling decisions
   - Implement scaling logic using existing metrics
   - Add safety mechanisms

### Design Decisions
1. Leverage existing monitoring infrastructure
2. Use existing drain API endpoint
3. Test-driven development approach
4. Use IP address for node-to-instance mapping

### Required Features
1. Instance Group Management
   - Map nodes to GCP instances
   - Safe instance removal
   - Error handling

2. Automated Scaling
   - Use existing metrics for scaling decisions
   - Safe drain automation
   - Minimum node count enforcement

### Future Work
- Fine-tuning of scaling thresholds
- Enhanced monitoring alerts
- Configuration for scaling parameters

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

