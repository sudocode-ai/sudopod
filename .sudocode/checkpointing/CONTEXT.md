# Sandbox Checkpointing

## Overview
Checkpointing allows saving the state of a sandbox as a template, which can then be used to spawn new sandboxes. The checkpoint mechanism will build on the existing snapshot functionality, using the snapshots table for storing checkpoint data. Each checkpoint will be stored as a snapshot with additional metadata to track checkpoint-specific information like expiry time.

## API Architecture

The system consists of several layers that handle different aspects of template and sandbox management:

1. External API Layer (`packages/api/internal/handlers/`)
   - Implements the HTTP endpoints that external clients interact with
   - Handles HTTP request/response lifecycle
   - Performs authentication and validation
   - Manages database operations (creating template/build entries)
   - Delegates actual sandbox operations to the Orchestrator Client
   - Example: `sandbox_snapshot.go` implements `POST /sandboxes/{id}/snapshot`

2. Orchestrator Client (`packages/api/internal/orchestrator/`)
   - Internal client used by the API layer
   - Provides high-level interface for sandbox operations
   - Manages communication with Orchestrator Server via gRPC
   - Handles template/snapshot metadata in database
   - Example: `SnapshotInstance()` method called by the API handlers

3. Orchestrator Server (`packages/orchestrator/`)
   - gRPC server that manages sandbox lifecycle
   - Implements low-level sandbox operations
   - Coordinates with Template Manager for builds
   - Handles actual snapshot creation and storage
   - Example: `sandboxes.go` implements the actual snapshot creation logic

4. Template Manager
   - Manages template builds and storage
   - Handles template versioning and caching
   - Coordinates with storage systems
   - Example: Handles uploading snapshots to GCS

### Template Creation Flow
```
External Request                 API Handler                Orchestrator              Template Manager
     │                              │                            │                          │
     │ POST /templates              │                            │                          │
     │─────────────────────────────>│                            │                          │
     │                              │                            │                          │
     │                              │ Create Build Entry         │                          │
     │                              │────────────────────────────>                          │
     │                              │                            │                          │
     │                              │         BuildID            │                          │
     │                              │<────────────────────────────                          │
     │                              │                            │                          │
     │         202 Accepted         │                            │                          │
     │<─────────────────────────────│                            │                          │
     │                              │                            │                          │
     │ POST /templates/{id}/builds/{buildId}                     │                          │
     │─────────────────────────────>│                            │                          │
     │                              │                            │                          │
     │                              │ Create Template            │                          │
     │                              │────────────────────────────>────────────────────────>│
     │                              │                            │                          │
     │         202 Accepted         │                            │                          │
     │<─────────────────────────────│                            │                          │
     │                              │                            │                          │
```

### Snapshot Creation Flow
```
External Request                 API Handler                Orchestrator              Sandbox
     │                              │                            │                       │
     │ POST /sandboxes/{id}/snapshot│                            │                       │
     │─────────────────────────────>│                            │                       │
     │                              │                            │                       │
     │                              │ Create Template Entry      │                       │
     │                              │ Create Build Entry         │                       │
     │                              │                            │                       │
     │                              │ SnapshotInstance()         │                       │
     │                              │────────────────────────────>                       │
     │                              │                            │                       │
     │                              │                            │ Create Snapshot       │
     │                              │                            │──────────────────────>│
     │                              │                            │                       │
     │                              │                            │ Snapshot Response     │
     │                              │                            │<──────────────────────│
     │                              │                            │                       │
     │         202 Accepted         │                            │                       │
     │<─────────────────────────────│                            │                       │
     │                              │                            │                       │
     │                              │ Background: Upload to GCS   │                       │
     │                              │ Background: Update Status   │                       │
     │                              │                            │                       │
```

The key differences from the previous flow are:
1. Creates template and build entries in database first
2. Returns 202 Accepted immediately after initiating snapshot
3. Handles storage and status updates asynchronously
4. Uses build ID throughout the process for tracking

### Checkpoint Creation Flow (New)
```
External Request                 API Handler                Orchestrator              Sandbox
     │                              │                            │                       │
     │ POST /sandboxes/{id}/checkpoint                          │                       │
     │─────────────────────────────>│                            │                       │
     │                              │                            │                       │
     │                              │ CheckpointInstance()       │                       │
     │                              │────────────────────────────>                       │
     │                              │                            │                       │
     │                              │                            │ Create Checkpoint     │
     │                              │                            │──────────────────────>│
     │                              │                            │                       │
     │                              │                            │ Checkpoint Response   │
     │                              │                            │<──────────────────────│
     │                              │                            │                       │
     │                              │ Template Object            │                       │
     │                              │<────────────────────────────                       │
     │                              │                            │                       │
     │         201 Created          │                            │                       │
     │<─────────────────────────────│                            │                       │
     │                              │                            │                       │
```

The key differences in the checkpoint flow are:
1. Uses dedicated checkpoint endpoint
2. Stores additional metadata for checkpoint tracking
3. Generates checkpoint-specific template IDs
4. Sets appropriate expiry times

## Flow Example
```
base-template
└── spawn -> sandbox1
    └── checkpoint -> sandbox1_0 (snapshot with checkpoint metadata)
        ├── spawn -> sandbox2
        │   └── checkpoint -> sandbox2_0 (snapshot with checkpoint metadata)
        └── spawn -> sandbox3
            └── checkpoint -> sandbox3_0 (snapshot with checkpoint metadata)
```

## Current System Architecture

### Snapshot/Template System
Both templates and snapshots use the same underlying pause and snapshot mechanism. We'll leverage the snapshots table for checkpoint storage, using its metadata field to store checkpoint-specific data.

1. Snapshot Generation Process:
   ```go
   Process Flow
   └── Process.CreateSnapshot()
       ├── Process.Pause() - Pauses VM using Firecracker API
       │   └── operations.PatchVM(&models.VM{State: models.VMStatePaused})
       ├── Create snapshot files
       │   ├── memfile: /mnt/snapshot-cache/<build_id>-memfile-<cache_id>.full
       │   └── snapfile: /orchestrator/template/<template_id>/<build_id>/cache/<cache_id>/snapfile
       ├── Generate diffs
       │   ├── Memory pages via userfaultfd
       │   └── Filesystem blocks via copy-on-write
       └── Upload to GCS with appropriate storage path
   ```

2. Differential Storage Mechanism:
   a. Memory Diffs:
   ```go
   // packages/orchestrator/internal/sandbox/sandbox.go
   memfileDirtyPages := s.uffd.Dirty()  // Get bitmap of modified memory pages
   err = header.CreateDiff(sourceFile, s.files.MemfilePageSize(), memfileDirtyPages, memfileDiff)
   ```
   - Uses userfaultfd (uffd) to track which memory pages were modified
   - Only stores changed pages in the diff
   - Maintains metadata about page locations and sizes

   b. Filesystem Diffs:
   ```go
   // packages/orchestrator/internal/sandbox/sandbox.go
   rootfsDirtyBlocks, err := s.rootfs.Export(ctx, rootfsDiffFile, s.Stop)
   ```
   - Tracks modified filesystem blocks
   - Creates diffs containing only changed blocks
   - Uses copy-on-write for efficiency

   c. Diff Metadata and Lineage:
   ```go
   // packages/orchestrator/internal/sandbox/sandbox.go
   memfileMetadata := &header.Metadata{
       Version:     1,
       Generation:  originalMemfile.Header().Metadata.Generation + 1,
       BlockSize:   originalMemfile.Header().Metadata.BlockSize,
       Size:        originalMemfile.Header().Metadata.Size,
       BuildId:     buildId,
       BaseBuildId: originalMemfile.Header().Metadata.BaseBuildId,
   }
   ```
   - Tracks generation numbers for diff chain
   - References base template/snapshot via BaseBuildId
   - Maintains block size and mapping information

3. Loading and Applying Diffs:
   a. Template/Snapshot Loading:
   ```go
   // packages/orchestrator/internal/sandbox/template/storage.go
   if isSnapshot && h == nil {
       headerObject := gcs.NewObject(ctx, bucket, buildId+"/"+string(fileType)+storage.HeaderSuffix)
       diffHeader, err := header.Deserialize(headerObject)
       // ...
   }
   ```
   - Loads diff headers from storage
   - Reconstructs mapping information
   - Handles both base templates and snapshots

   b. Sandbox Creation:
   ```go
   // packages/orchestrator/internal/sandbox/sandbox.go
   rootfsOverlay, err := rootfs.NewCowDevice(
       readonlyRootfs,
       sandboxFiles.SandboxCacheRootfsPath(),
       sandboxFiles.RootfsBlockSize(),
   )
   ```
   - Creates copy-on-write layer for filesystem
   - Applies memory diffs in sequence
   - Maintains original template as read-only base

4. Database Structure:
Existing snapshots table will be used for both snapshots and checkpoints.
   ```sql
   -- snapshots table used for both snapshots and checkpoints
   CREATE TABLE snapshots (
       id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
       env_id TEXT NOT NULL,
       sandbox_id TEXT NOT NULL,
       base_env_id TEXT NOT NULL,
       created_at TIMESTAMP WITH TIME ZONE,
       metadata JSONB -- Stores checkpoint-specific data
   );
   ```

   Checkpoint metadata format:
   ```json
   {
       "checkpoint_expiry": "2024-04-30T00:00:00Z",
       "is_checkpoint": true
   }
   ```

5. Storage Hierarchy:
   ```
   GCS Bucket
   └── <build_id>/
       ├── memfile
       ├── memfile.header (contains diff mappings)
       ├── rootfs.ext4
       ├── rootfs.ext4.header (contains diff mappings)
       └── snapfile

   Local Disk Cache
   ├── /mnt/disks/fc-envs/v1/<template_id>/builds/<build_id>/ (templates)
   └── /mnt/snapshot-cache/ (snapshots)
   ```

6. Recursive Snapshot Support:
   ```go
   // packages/orchestrator/internal/sandbox/sandbox.go
   memfileMappings := header.MergeMappings(
       originalMemfile.Header().Mapping,  // Base template mappings
       memfileMapping,                    // New changes
   )
   ```
   - Each snapshot references its base via BaseBuildId
   - Diffs are stored relative to immediate parent
   - System can reconstruct full state by applying diff chain
   - Generation numbers track the depth of the chain

7. Key Differences in Usage:
   - Templates:
     - Created via Template API
     - Uses permanent storage paths
     - Stored permanently in GCS
     - No source sandbox tracking
     - Used for spawning new sandboxes
     - Retained until explicitly deleted
   - Snapshots/Checkpoints:
     - Created via Snapshot/Checkpoint API
     - Created from running sandbox state
     - Stored permanently in GCS with metadata
     - Linked to source sandbox via snapshots table
     - Used for resuming same sandbox (snapshots) or spawning new ones (checkpoints)
     - Cleaned up based on expiry time (checkpoints) or sandbox deletion (snapshots)

Note: The diff-based storage system naturally enforces safe deletion - a template cannot be deleted if any other template's diffs depend on it (via BaseBuildId references). This means deletion must work from leaf nodes upward through the template tree, automatically protecting active branches.

The deletion mechanism is enforced through several layers:
- Database foreign key constraints prevent deletion of templates referenced by other templates:
  ```go
  // packages/shared/pkg/db/template.go
  // BaseBuildId in env_builds references builds.id
  // This prevents deletion of builds that are referenced by other builds
  ```

- The diff chain structure ensures that deleting a template would break any child templates:
  ```go
  // packages/orchestrator/internal/sandbox/sandbox.go
  memfileMetadata := &header.Metadata{
      BaseBuildId: originalMemfile.Header().Metadata.BaseBuildId,
  }
  ```

- When deleting a template, the system will:
  ```go
  // packages/orchestrator/internal/sandbox/template/storage.go
  // Deletion only succeeds for leaf nodes (no child references)
  // DB foreign key constraints enforce this automatically
  if err := tx.Delete(&models.EnvBuild{}).Where("id = ?", buildId).Error; err != nil {
      return fmt.Errorf("failed to delete build: %w", err)
  }
  ```
  - Only succeed for leaf nodes (templates with no children)
  - Automatically protect active branches
  - Allow deletion to work up the tree as leaves are removed
  - Clean up both DB entries and associated GCS/local storage only after dependency checks

This existing behavior will be particularly useful for implementing checkpoint cleanup in the future, as it ensures we can't break checkpoint chains by deleting intermediate nodes.

### Target Architecture (Checkpoints)

The checkpoint mechanism will leverage the existing snapshot system, using the snapshots table for storage. Here are the key additions and changes:

1. Database Schema:
   - Uses existing snapshots table
   - Adds checkpoint metadata in JSONB field:
     ```json
     {
         "checkpoint_expiry": "2024-04-30T00:00:00Z",
         "is_checkpoint": true
     }
     ```

2. Template Identification:
   - Format: `{source_sandbox_id}_{checkpoint_num}`
   - Inherits configuration from source sandbox (VCPU, RAM, etc.)
   - Lineage tracked through template/sandbox IDs

3. Storage Changes:
   - Use permanent template paths instead of cache paths
   - Skip registering cleanup functions
   - Remove `defer os.RemoveAll` calls
   - Store in both local disk and GCS

4. Lineage Implementation:
   Given template ID `sandbox2_0`:
   ```go
   func GetTemplateLineage(templateID string) ([]string, error) {
       // 1. Parse sandbox ID: "sandbox2" from "sandbox2_0"
       // 2. Look up sandbox2's source template: "sandbox1_0"
       // 3. Parse that sandbox ID: "sandbox1"
       // 4. Look up sandbox1's source: "base-template"
       // 5. Return ["base-template", "sandbox1_0", "sandbox2_0"]
   }
   ```

5. API Changes:
   ```go
   // packages/api/internal/handlers/sandbox_checkpoint.go
   func (a *APIStore) PostSandboxesSandboxIDCheckpoint(c *gin.Context, sandboxID api.SandboxID) {
       // 1. Validate sandbox exists and belongs to team
       // 2. Call orchestrator checkpoint (reuses snapshot mechanism)
       // 3. Return template ID
   }
   ```

6. Protobuf Messages:
   ```protobuf
   message SandboxCheckpointRequest {
       string sandbox_id = 1;
   }
   message SandboxCheckpointResponse {
       string template_id = 1;
   }
   ```

## Example Usage
```
# Create sandbox from base
POST /sandboxes {"template-alias": "base-template"}
-> Returns: sandbox1

# Create checkpoint
POST /sandboxes/sandbox1/checkpoint
-> Creates snapshot with checkpoint metadata
-> Returns: {"template-alias": "sandbox1_0"}

# Spawn from checkpoint
POST /sandboxes {"templateId"}
-> Returns: sandbox2
```

## Technical Notes
- Leverages existing snapshot creation logic
- Stores checkpoints as snapshots with metadata
- No modifications needed to sandbox creation flow
- Maintains backward compatibility
- Lineage can be reconstructed from template/sandbox IDs
- Checkpoint expiry managed through metadata field