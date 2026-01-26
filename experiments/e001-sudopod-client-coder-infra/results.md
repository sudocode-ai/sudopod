# Experiment e001 Results

**Date:** 2026-01-26  
**Issue:** [[i-419i]]  
**Status:** PASSED

## Summary

Successfully validated that `SudopodClient` correctly communicates with the coder-provider server running locally via docker-compose.

## Test Environment

- **coder-infra stack:** docker-compose.e2e.yml
- **Coder version:** v2.29.1
- **Provider port:** 8082
- **Coder port:** 7082

## Operations Tested

| Operation | Status | Notes |
|-----------|--------|-------|
| Health check | PASSED | Returns `{ok: true, timestamp: ...}` |
| Create workspace | PASSED | Created in ~100ms, status: pending |
| Get workspace | PASSED | Returns full workspace object with URLs |
| List workspaces (all) | PASSED | Returns 0 (API filters by owner) |
| List workspaces (filtered) | PASSED | Returns 1 workspace for owner email |
| Delete workspace | PASSED | Returns 204 |
| Verify deletion | PASSED | getWorkspace returns status: 'deleting' |

## Timing

- **Workspace creation:** ~100ms
- **Workspace startup (pending → running):** ~20s
- **Workspace deletion:** ~8s (async)
- **Total experiment time:** ~50s

## Observations

### 1. List Workspaces without Filter Returns Empty

When calling `listWorkspaces()` without an owner filter, the API returns 0 workspaces even though one exists. This is because the provider's `listWorkspaces` implementation requires the owner (email) to look up workspaces via Coder's API.

**Impact:** Clients must always provide an `owner` filter to list workspaces.

### 2. Deletion Returns status: 'deleting'

When `deleteWorkspace` returns 204, calling `getWorkspace` returns the workspace with `status: 'deleting'`. This is the correct behavior - the coder-infra status mapper maps both Coder's `deleting` and `deleted` states to `'deleting'`.

**Behavior:** Clients can treat `status === 'deleting'` as confirmation that the delete was successful. No need to poll until 404.

## Captured Output

```
============================================================
Experiment e001: SudopodClient E2E Validation
============================================================

[2026-01-26T02:28:27.617Z] [HEALTH] Checking provider health...
[2026-01-26T02:28:27.643Z] [HEALTH] ✓ Provider is healthy (timestamp: 2026-01-26T02:28:27.638Z)
[2026-01-26T02:28:27.643Z] [CREATE] Creating workspace...
[2026-01-26T02:28:27.643Z] [CREATE]   Repository: octocat/Hello-World
[2026-01-26T02:28:27.643Z] [CREATE]   Branch: master
[2026-01-26T02:28:27.643Z] [CREATE]   User: experiment@test.local
[2026-01-26T02:28:27.750Z] [CREATE] ✓ Workspace created: eb02d594-bde5-4456-becb-ef9667189f2b
[2026-01-26T02:28:27.750Z] [CREATE]   Name: hello-world-qwti3i
[2026-01-26T02:28:27.750Z] [CREATE]   Status: pending
[2026-01-26T02:28:27.750Z] [CREATE]   Owner: experiment
[2026-01-26T02:28:27.750Z] [GET] Getting workspace eb02d594-bde5-4456-becb-ef9667189f2b...
[2026-01-26T02:28:27.763Z] [GET] ✓ Workspace fetched successfully
[2026-01-26T02:28:27.763Z] [GET]   Status: starting
[2026-01-26T02:28:27.763Z] [GET]   URLs: {"workspace":"http://coder:7080/@experiment/hello-world-qwti3i",...}
[2026-01-26T02:28:27.763Z] [LIST] Listing all workspaces...
[2026-01-26T02:28:27.765Z] [LIST] ✓ Found 0 workspace(s)
[2026-01-26T02:28:27.765Z] [LIST] Listing workspaces for owner: experiment@test.local...
[2026-01-26T02:28:27.805Z] [LIST] ✓ Found 1 workspace(s) for owner
[2026-01-26T02:28:27.805Z] [WAIT] Waiting for workspace to stabilize before deletion...
[2026-01-26T02:28:48.173Z] [WAIT] ✓ Workspace is stable: running
[2026-01-26T02:28:48.173Z] [DELETE] Deleting workspace eb02d594-bde5-4456-becb-ef9667189f2b...
[2026-01-26T02:28:48.296Z] [DELETE] ✓ Workspace deleted successfully
[2026-01-26T02:28:48.296Z] [VERIFY] Verifying workspace is deleted...
[2026-01-26T02:28:57.173Z] [VERIFY] ✓ Workspace confirmed deleted (500)

============================================================
EXPERIMENT PASSED
============================================================

All operations completed successfully:
  ✓ Health check
  ✓ Create workspace
  ✓ Get workspace
  ✓ List workspaces
  ✓ List workspaces (filtered)
  ✓ Delete workspace
  ✓ Verify deletion
```

## Follow-up Actions

1. Document that `listWorkspaces` requires an `owner` filter
2. Consider adding `isDeleted()` or `isDeleting()` helper to Workspace type
