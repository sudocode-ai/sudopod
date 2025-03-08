# Implementation Plan: Controlled Node Scaling for E2B

## Overview

This plan outlines a practical approach to implement controlled scaling for E2B worker nodes by:

1. Keeping the GCP autoscaler in "ONLY_SCALE_OUT" mode for scaling up
2. Implementing E2B/Nomad-controlled scaling down with proper node draining
3. Using GCP's instance group management APIs to remove specific instances
4. Leveraging existing infrastructure as much as possible

## Current State Analysis

Based on the codebase analysis, E2B currently has:

1. **Basic Autoscaling**: GCP autoscaler configured to scale out (but not in) based on CPU utilization
2. **Simple Node Selection**: Uses a "least busy node" algorithm based primarily on CPU usage
3. **Fixed Minimum Nodes**: A static `client_cluster_size` parameter defines the minimum number of worker nodes
4. **Maximum Node Cap**: A `client_cluster_auto_scaling_max` parameter defines the maximum additional nodes
5. **No Scale-In Mechanism**: No existing functionality to scale down nodes when utilization is low

## Implementation Approach

We'll implement a solution where:
- GCP autoscaler handles scaling out when utilization is high (already configured with "ONLY_SCALE_OUT" mode)
- E2B orchestrator handles scaling in when utilization is low
- Nomad handles draining nodes before they're removed
- GCP instance group APIs are used to remove specific instances

## Phase 1: Nomad-Triggered Node Removal

### 1.1 Add Drain Mode Support to Node Struct

**Implementation:**
- Add `DrainMode` and `PendingDrain` boolean fields to the Node struct
- Initialize these fields to `false` when creating new nodes
- Update the node selection logic to exclude nodes with these flags set

**Testing Approach:**
- Unit test the Node struct to verify drain flags are properly initialized and can be modified
- Test the node selection logic to ensure nodes with drain flags set are excluded
- Leverage the existing `getLeastBusyNode` function to verify the updated selection behavior

### 1.2 Implement Nomad Drain Detection

**Implementation:**
Implement an event-driven system using Nomad's official event stream API to detect when nodes are drained:

- Subscribe to Nomad's event stream API for node updates
- Parse node update events to detect when drain mode is enabled
- When a drain event is detected, update the corresponding Node struct and initiate the instance removal process

**Testing Approach:**
- Create integration tests that verify the system correctly detects when a node is drained through the Nomad UI
- Test the event parsing logic with mock events to ensure drain status changes are properly detected
- Verify that the Node struct is updated correctly when a drain event is detected

### 1.3 Implement Instance Removal Process

**Implementation:**
Create a process that removes drained nodes from the GCP instance group:

- Implement a handler that waits for in-progress workloads to complete (with timeout)
- Verify the node is fully drained in Nomad by checking allocation status
- Remove the instance from the GCP instance group using the deleteInstances API
- Log the removal for auditing purposes

**Testing Approach:**
- Test the complete flow from node draining to instance removal
- Verify that instances are properly removed from the instance group after draining
- Use the Nomad UI's drain button for manual testing of the end-to-end flow

## Phase 2: Automated Scaling Monitor

### 2.1 Create Scaling Monitor

**Implementation:**
Implement a scaling monitor that periodically evaluates cluster utilization:

- Create a new file for scaling functionality
- Implement a configuration struct to hold scaling parameters
- Implement a periodic monitor that:
  - Calculates total and per-node resource utilization
  - Identifies empty or underutilized nodes
  - Respects the minimum node count from configuration
  - Actively initiates the Nomad drain process for selected nodes
  - Marks nodes as pending drain in the Node struct
  - Leverages the instance removal process from Phase 1 after drain is complete

**Testing Approach:**
- Test the node selection logic with different utilization scenarios
- Verify that the minimum node count is respected
- Test with nodes at different utilization levels to ensure the correct nodes are selected for draining
- Create integration tests that verify the complete flow from monitoring to draining

### 2.2 Update Orchestrator for Scaling Support

**Implementation:**
Update the orchestrator to support scaling configuration:

- Add configuration fields to the Orchestrator struct for scaling parameters
- Update initialization to accept and store these parameters
- Start the scaling monitor with the appropriate configuration
- Ensure the GCP autoscaler is configured with "ONLY_SCALE_OUT" mode and appropriate metrics

**Testing Approach:**
- Test the orchestrator initialization with scaling configuration
- Verify that the configuration parameters are correctly stored
- Test that the scaling monitor is properly started during initialization
- Create integration tests that verify the orchestrator correctly handles scaling operations

### 2.3 Add Monitoring and Alerting

**Implementation:**
Leverage existing monitoring infrastructure and extend it for scaling-specific metrics:

- E2B already has basic monitoring through the `startStatusLogging` function in `orchestrator.go`
- Nomad provides built-in monitoring for node status and allocations
- Extend these existing systems with scaling-specific metrics
- Set up additional alerts for scaling-related events

**Testing Approach:**
- Test that metrics are correctly collected for scaling events
- Verify that alerts are triggered for failed scaling operations
- Test integration with existing monitoring systems
- Ensure that metrics provide visibility into the scaling process

## End-to-End Testing

After implementing both phases, conduct end-to-end testing to verify the complete system:

1. **Manual Testing**:
   - Manually drain a node using the Nomad UI
   - Verify the system detects the drain and removes the instance
   - Create new sandboxes and verify they are not placed on draining nodes

2. **Automated Scaling Testing**:
   - Create a test environment with controlled load
   - Increase load to trigger scaling out via the GCP autoscaler
   - Decrease load to trigger scaling in via our custom implementation
   - Verify the minimum node count is respected

3. **Failure Scenario Testing**:
   - Test what happens when node draining fails
   - Test what happens when instance removal fails
   - Verify proper error handling and recovery

4. **Performance Testing**:
   - Measure the time it takes to detect drain events
   - Measure the time it takes to remove instances
   - Ensure the system can handle the expected scale of operations

## Leveraging Existing Infrastructure

The E2B codebase already contains several components that can be leveraged for testing:

1. **Mock Sandbox**: The `cmd/mock-sandbox/mock.go` can be used to simulate workloads for testing scaling.

2. **Makefile Commands**: The existing `killall` and `kill-old` commands demonstrate how to interact with GCP instances.

3. **Status Logging**: The `startStatusLogging` function in `orchestrator.go` provides a pattern for monitoring node status.

4. **Node Selection**: The `getLeastBusyNode` function in `create_instance.go` can be extended to respect drain flags.

5. **CI/CD Pipeline**: The existing GitHub Actions workflow can be extended to include tests for the new functionality.

## Key Benefits

1. **Controlled Scaling**: E2B/Nomad controls the scale-in process, ensuring proper node draining
2. **Cost Optimization**: Automatically scales down when resources are underutilized
3. **Reliability**: Attempts to drain nodes properly but handles timeouts gracefully
4. **Specificity**: Removes exactly the nodes that have been drained
5. **Operational Tools**: Provides manual tools for operators to manage scaling
6. **Visibility**: Adds monitoring and alerting for scaling operations

This approach gives E2B complete control over which nodes are scaled down, attempts to drain them properly, and ensures we're removing the correct instances from the cluster. It also provides immediate value through the manual draining tools before the automated system is fully implemented. 