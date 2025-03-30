# Checkpoint Implementation Plan

## Phase 1: API Layer
1. Add new protobuf messages for checkpoint operations
   - `SandboxSnapshotRequest`
   - `SandboxSnapshotResponse`

2. Add OpenAPI specification
   ```yaml
   /sandboxes/{sandboxID}/snapshot:
     post:
       description: Create a checkpoint of the sandbox that can be used to spawn new sandboxes
       tags: [sandboxes]
       security:
         - ApiKeyAuth: []
         - Supabase1TokenAuth: []
           Supabase2TeamAuth: []
       parameters:
         - $ref: "#/components/parameters/sandboxID"
       requestBody:
         required: true
         content:
           application/json:
             schema:
               type: object
               properties:
                 expiry:
                   type: string
                   format: date-time
                   description: When the checkpoint should expire
       responses:
         "201":
           description: Checkpoint created successfully
           content:
             application/json:
               schema:
                 $ref: "#/components/schemas/Template"
   ```

3. Implement API endpoint handler
   - Add snapshot endpoint in API service
   - Add validation logic for sandbox existence
   - Add logging for debugging/validation
   - Integrate with existing snapshot creation logic

## Phase 2: Core Checkpoint Logic
1. Implement checkpoint creation
   - Use existing snapshot/template creation logic
   - Generate alias in format `{source_sandbox_id}_{checkpoint_num}`
   - Create snapshot entry with checkpoint metadata
   - Add logging for validation

2. Implement lineage tracking
   - Use existing snapshot lineage tracking
   - Add checkpoint-specific metadata parsing
   - Add validation logging

## Testing Strategy
   - Create checkpoint from base template using /snapshot endpoint
   - Spawn new sandbox from checkpoint
   - Verify persistence
   - Verify lineage tracking
   - Verify checkpoint metadata and expiry

## Success Criteria
- Can create checkpoint from running sandbox using /snapshot endpoint
- Can spawn new sandbox from checkpoint
- Checkpoints persist beyond sandbox lifetime
- Lineage tracking works correctly
- All operations properly logged for debugging
- Checkpoint expiry correctly managed through metadata 