# Integration Tests

This directory contains integration tests for sudopod that interact with real remote development environments.

## Overview

Integration tests validate sudopod primitives against real infrastructure. There are two categories:

1. **Codespaces tests** — create and manage real GitHub Codespaces
2. **Coder SDK tests** — run against a local Coder instance via Docker

Tests skip gracefully when infrastructure is unavailable, printing setup instructions.

## Prerequisites

### 1. GitHub CLI Authentication

Integration tests require the GitHub CLI (`gh`) to be installed and authenticated:

```bash
# Install GitHub CLI (if not already installed)
# macOS
brew install gh

# Linux
# See https://github.com/cli/cli/blob/trunk/docs/install_linux.md

# Windows
# See https://github.com/cli/cli#windows

# Authenticate with GitHub
gh auth login
```

**Verify authentication:**

```bash
gh auth status
```

You should see output indicating you're logged into GitHub.com with appropriate scopes.

### 2. Required Permissions

Your GitHub account needs:
- Access to create codespaces (requires GitHub Pro, Team, or Enterprise)
- Write access to `sudocode-ai/sudocode` repository (or fork it for testing)
- Sufficient codespace quota (integration tests may create multiple codespaces)

### 3. Node.js and Dependencies

Ensure you have Node.js 18+ and dependencies installed:

```bash
npm install
```

## Running Integration Tests

### Run All Integration Tests

```bash
npm run test:integration
```

This will:
1. Check for GitHub CLI authentication
2. Run all integration tests serially
3. Clean up created codespaces automatically

### Run Specific Test Files

```bash
# Run only the full deployment test
npx vitest run tests/integration/utils/codespaces/full-deployment.test.ts --config vitest.integration.config.ts

# Run only idle timeout behavior tests
npx vitest run tests/integration/utils/codespaces/idle-timeout-behavior.test.ts --config vitest.integration.config.ts
```

### Watch Mode (Not Recommended)

⚠️ **Warning:** Watch mode is not recommended for integration tests as it may create many codespaces and exhaust your quota.

If you need to iterate on tests, use:

```bash
# Run a specific test file once
npx vitest run tests/integration/utils/codespaces/full-deployment.test.ts --config vitest.integration.config.ts
```

## Coder SDK Integration Tests

The `coder-sdk/` tests validate the `sudopod-coder-sdk` against a real Coder instance running locally via Docker.

### Local Coder Setup (Flow 1 — Self-Hosted)

```bash
cd refs/coder-infra

# Start the self-hosted stack (port 7080)
docker compose -f docker-compose.self-hosted.yml up -d

# Run setup: creates admin user, pushes default template, generates API token
./scripts/setup-self-hosted.sh

# Export token to your shell
eval $(./scripts/get-token.sh --export)

# Verify it works
curl http://localhost:7080/api/v2/buildinfo
```

This gives you `CODER_URL=http://localhost:7080` and `CODER_TOKEN` in your environment.

### Running Coder SDK Tests

```bash
# Run all coder-sdk integration tests
npx vitest run tests/integration/coder-sdk/ --config vitest.integration.config.ts

# Run specific test file
npx vitest run tests/integration/coder-sdk/user.test.ts --config vitest.integration.config.ts
```

If `CODER_URL` or `CODER_TOKEN` are not set, all coder-sdk tests will skip with a message showing the exact setup commands.

### Test Files

| File | What it tests | Timeout |
|------|---------------|---------|
| `user.test.ts` | `getCurrentUser`, `getUser("me")`, `listUsers` | Default |
| `template.test.ts` | `listTemplates`, `getTemplateByName`, `getTemplateVersion` | Default |
| `workspace.test.ts` | Full lifecycle: create → running → stop → start → delete | 200s per step |
| `errors.test.ts` | Invalid token (401), not found (404), duplicate name (409) | 60s |

### Port Conventions

| Flow | Port | Env Vars | Docker Compose File |
|------|------|----------|---------------------|
| Flow 1 (Self-Hosted) | 7080 | `CODER_URL`, `CODER_TOKEN` | `docker-compose.self-hosted.yml` |
| Flow 2 (Hub) | 7081 | `CODER_HUB_URL`, `CODER_HUB_TOKEN` | `docker-compose.hub.yml` |

Both flows can run simultaneously since they use different ports.

### Teardown

```bash
# Stop self-hosted Coder
docker compose -f docker-compose.self-hosted.yml down -v

# Stop hub Coder
docker compose -f docker-compose.hub.yml down -v
```

## Test Configuration

Integration tests use `vitest.integration.config.ts` with special settings:

- **Test Timeout:** 10 minutes (for long-running builds)
- **Hook Timeout:** 2 minutes (for codespace creation)
- **Serial Execution:** Tests run one at a time to avoid conflicts
- **No Coverage:** Coverage is disabled for integration tests

## Test Structure

```
tests/integration/
├── README.md                              # This file
├── coder-sdk/                             # Coder SDK integration tests
│   ├── helpers.ts                         # Env detection + setup instructions
│   ├── user.test.ts                       # User operations
│   ├── template.test.ts                   # Template operations
│   ├── workspace.test.ts                  # Full workspace lifecycle
│   └── errors.test.ts                     # Error handling (401, 404, 409)
├── provider/
│   └── coder/
│       ├── api.test.ts                    # CoderApiClient integration tests
│       └── cli.test.ts                    # CLI integration tests
└── utils/
    └── codespaces/
        ├── helpers.ts                     # Codespaces test utilities
        ├── full-deployment.test.ts        # End-to-end deployment test
        ├── idle-timeout-behavior.test.ts  # Idle timeout daemon validation
        └── dev-mode-installation.test.ts  # Dev mode installation test
```

## Writing New Integration Tests

### Basic Structure

```typescript
import { describe, it, beforeAll, afterAll, expect } from 'vitest';
import {
  verifyTestPrerequisites,
  trackCodespace,
  cleanupTrackedCodespaces,
  generateTestCodespaceName,
} from '../helpers.js';
import { createCodespace, deleteCodespace } from '../../../../src/utils/codespaces/index.js';

describe('My Integration Test', () => {
  let codespaceName: string;

  // Check prerequisites before any tests
  beforeAll(async () => {
    await verifyTestPrerequisites();
    
    codespaceName = generateTestCodespaceName('my-test');
    const codespace = await createCodespace({
      repository: 'sudocode-ai/sudocode',
      machine: 'basicLinux32gb',
      retentionPeriod: 1
    });
    
    codespaceName = codespace.name;
    trackCodespace(codespaceName); // Register for automatic cleanup
  }, 120000); // 2 minute timeout

  // Clean up codespaces after all tests
  afterAll(async () => {
    await cleanupTrackedCodespaces();
  }, 60000);

  it('should do something with codespace', async () => {
    // Your test logic here
  });
});
```

### Best Practices

1. **Always use `trackCodespace()`** to register codespaces for cleanup
2. **Always call `cleanupTrackedCodespaces()`** in `afterAll()`
3. **Use descriptive test names** in `generateTestCodespaceName()`
4. **Set appropriate timeouts** for long-running operations
5. **Verify prerequisites** with `verifyTestPrerequisites()`
6. **Use `basicLinux32gb` machine** for faster startup and lower cost
7. **Set `retentionPeriod: 1`** to auto-delete codespaces after 1 day

### Available Test Helpers

See `tests/integration/utils/codespaces/helpers.ts` for utilities:

- `verifyTestPrerequisites()` - Check GitHub CLI auth
- `trackCodespace(name)` - Register codespace for cleanup
- `untrackCodespace(name)` - Remove from cleanup list
- `cleanupTrackedCodespaces()` - Delete all tracked codespaces
- `safeDeleteCodespace(name)` - Delete with error handling
- `generateTestCodespaceName(testName?)` - Generate unique name
- `waitForCondition(fn, timeout, interval?)` - Poll until condition
- `retryWithBackoff(fn, maxRetries?, delay?)` - Retry with backoff
- `withCleanup(testFn, cleanupFn)` - Ensure cleanup runs

## Timeouts

Different operations require different timeouts:

| Operation | Recommended Timeout | Notes |
|-----------|---------------------|-------|
| Codespace creation | 2 minutes | `beforeAll` hook |
| Wait for ready | 1-2 minutes | Check state every 2s |
| Install Claude Code | 5 minutes | Downloads and installs |
| Build sudocode | 10 minutes | npm install + build |
| Start server | 2 minutes | Includes startup verification |
| Wait for port | 1-2 minutes | Check every 2s |
| Keepalive tests | 5-30 minutes | Depends on test scenario |

Configure timeouts in test options:

```typescript
it('long running test', async () => {
  // test logic
}, 600000); // 10 minute timeout
```

## Cleanup Behavior

The test helpers ensure cleanup happens even if tests fail:

1. **Normal completion:** `afterAll()` calls `cleanupTrackedCodespaces()`
2. **Test failure:** `afterAll()` still runs and cleans up
3. **Process termination:** Codespaces may be left behind (see manual cleanup)

### Manual Cleanup

If tests are interrupted (Ctrl+C), codespaces may not be cleaned up automatically.

**List your codespaces:**

```bash
gh codespace list
```

**Delete a specific codespace:**

```bash
gh codespace delete --codespace <name> --force
```

**Delete all sudopod test codespaces:**

```bash
gh codespace list --json name | jq -r '.[] | select(.name | startswith("sudopod-")) | .name' | xargs -I {} gh codespace delete --codespace {} --force
```

## Troubleshooting

### "GitHub CLI not installed"

Install the GitHub CLI: https://cli.github.com/

### "Not authenticated with GitHub"

Run `gh auth login` and follow the prompts.

### "Failed to create codespace"

Check:
- You have codespace creation permissions
- Your account has available quota
- The repository exists and you have access
- GitHub Codespaces service is operational

### "Codespace not ready after Xs"

The codespace may be taking longer than expected to start. Check:
- GitHub Codespaces status page
- Your internet connection
- Try increasing the timeout in the test

### "Port not listening after Xs"

The server may be taking longer to start. Check:
- Codespace logs: `gh codespace ssh --codespace <name> -- cat /tmp/sudocode-3000.log`
- Installation errors in previous test steps
- Try increasing the timeout

### Tests hang indefinitely

Integration tests run serially and can take a long time:
- Full deployment: 10-15 minutes
- Keepalive behavior: 20-30 minutes
- Be patient and check for progress messages

### Codespaces left behind after crash

If your test process crashes, manually clean up:

```bash
# List all your codespaces
gh codespace list

# Delete sudopod test codespaces
gh codespace list --json name | jq -r '.[] | select(.name | startswith("sudopod-")) | .name' | xargs -I {} gh codespace delete --codespace {} --force
```

## CI/CD Integration

To run integration tests in CI:

1. **Set up GitHub CLI authentication** using a GitHub token:

```yaml
- name: Authenticate GitHub CLI
  run: |
    echo "${{ secrets.GITHUB_TOKEN }}" | gh auth login --with-token
```

2. **Run integration tests:**

```yaml
- name: Run integration tests
  run: npm run test:integration
  timeout-minutes: 60
```

3. **Ensure cleanup on failure:**

The test helpers automatically clean up, but you can add a cleanup step:

```yaml
- name: Clean up test codespaces
  if: always()
  run: |
    gh codespace list --json name | \
      jq -r '.[] | select(.name | startswith("sudopod-")) | .name' | \
      xargs -I {} gh codespace delete --codespace {} --force || true
```

## Cost Considerations

Integration tests create real GitHub Codespaces, which:
- Count against your codespace quota
- May incur costs depending on your GitHub plan
- Use compute and storage resources

**Recommendations:**
- Run integration tests only when necessary (not on every commit)
- Use `basicLinux32gb` machine type (cheapest option)
- Set short retention periods (`retentionPeriod: 1`)
- Clean up codespaces promptly
- Consider running tests in a separate GitHub account for cost isolation

## Questions or Issues?

If you encounter problems with integration tests:

1. Check this README for troubleshooting steps
2. Verify your GitHub CLI authentication
3. Check GitHub Codespaces service status
4. Review test output for specific error messages
5. Open an issue in the sudopod repository

## Related Documentation

- [GitHub Codespaces Documentation](https://docs.github.com/en/codespaces)
- [GitHub CLI Documentation](https://cli.github.com/manual/)
- [Vitest Documentation](https://vitest.dev/)
- [Sudopod Primitives Documentation](../../../src/utils/codespaces/README.md)
