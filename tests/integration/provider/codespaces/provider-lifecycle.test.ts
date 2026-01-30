/**
 * Integration test: CodespacesProvider E2E Lifecycle
 *
 * Exercises the full CodespacesProvider class through a complete lifecycle:
 *   create -> verify running -> stop -> verify stopped -> resume -> verify running -> delete
 *
 * This validates the provider abstraction end-to-end, not just the CLI primitives.
 *
 * Expected Duration: ~10-15 minutes
 *
 * Prerequisites:
 * - GitHub CLI installed and authenticated
 * - Access to create codespaces
 *
 * IMPORTANT: Requires RUN_INTEGRATION_TESTS=1
 *
 * @see i-44in - Integration test: E2E CodespacesProvider lifecycle
 * @see s-84xz - Codespaces Provider Implementation specification
 */

import { describe, it, beforeAll, afterAll, expect } from 'vitest';

if (!process.env.RUN_INTEGRATION_TESTS) {
  console.log(
    '\n⚠️  Skipping integration tests: RUN_INTEGRATION_TESTS not set'
  );
  console.log(
    '   To run: RUN_INTEGRATION_TESTS=1 npx vitest run tests/integration/provider/codespaces/provider-lifecycle.test.ts --config vitest.integration.config.ts\n'
  );
  process.exit(0);
}

import { CodespacesProvider } from '../../../../src/provider/codespaces/index.js';
import type { Workspace } from '../../../../src/provider/types.js';
import { WorkspaceNotFoundError } from '../../../../src/provider/errors.js';
import { deleteCodespace } from '../../../../src/provider/codespaces/cli.js';
import {
  verifyTestPrerequisites,
  trackCodespace,
  cleanupTrackedCodespaces,
} from '../../utils/codespaces/helpers.js';

// We don't use authToken in the CLI path (gh handles auth), but the type requires it
const provider = new CodespacesProvider({ authToken: '' });

describe('CodespacesProvider E2E Lifecycle (Integration)', () => {
  let workspace: Workspace;

  // ──────────────────────────────────────────────────────────────────────────
  // Setup & Teardown
  // ──────────────────────────────────────────────────────────────────────────

  beforeAll(async () => {
    console.log('Verifying integration test prerequisites...');
    await verifyTestPrerequisites();
  }, 30_000);

  afterAll(async () => {
    // Safety net: if workspace was created but test failed before delete,
    // clean up via the CLI directly
    if (workspace?.id) {
      console.log(`Safety cleanup: deleting ${workspace.id}...`);
      try {
        await deleteCodespace(workspace.id);
      } catch {
        // best effort
      }
    }
    await cleanupTrackedCodespaces(false);
  }, 120_000);

  // ──────────────────────────────────────────────────────────────────────────
  // Step 1: create()
  // ──────────────────────────────────────────────────────────────────────────

  it('should create a workspace', async () => {
    console.log('');
    console.log('═══════════════════════════════════════════');
    console.log(' Step 1: provider.create()');
    console.log('═══════════════════════════════════════════');

    workspace = await provider.create({
      name: `sudopod-integ-${Date.now()}`,
      repository: { owner: 'sudocode-ai', repo: 'sudocode', branch: 'main' },
      retentionDays: 1,
      machineType: 'basicLinux32gb',
      // No setup config — we're testing the provider lifecycle, not setup
      // No runtime config — skip server start to keep test fast
    });

    trackCodespace(workspace.id);

    console.log(`  ID:     ${workspace.id}`);
    console.log(`  Name:   ${workspace.name}`);
    console.log(`  Status: ${workspace.status}`);
    console.log(`  Repo:   ${workspace.repository.owner}/${workspace.repository.repo}`);
    console.log(`  SSH:    ${workspace.connection.ssh.command}`);
    console.log(`  URLs:   ${JSON.stringify(workspace.connection.urls)}`);

    // Verify workspace shape
    expect(workspace.id).toBeTruthy();
    expect(workspace.name).toBe(workspace.id); // codespace name = id
    expect(workspace.status).toBe('running');
    expect(workspace.repository.owner).toBe('sudocode-ai');
    expect(workspace.repository.repo).toBe('sudocode');
    expect(workspace.createdAt).toBeInstanceOf(Date);

    // Verify connection info
    expect(workspace.connection.ssh.command).toContain('gh codespace ssh');
    expect(workspace.connection.ssh.command).toContain(workspace.id);
    expect(workspace.connection.urls).toBeDefined();
    expect(workspace.connection.urls!.ide).toContain('.github.dev');
    expect(workspace.connection.urls!.dashboard).toContain('github.com/codespaces');
  }, 600_000); // 10 min — includes waiting for Available

  // ──────────────────────────────────────────────────────────────────────────
  // Step 2: get() — verify running state
  // ──────────────────────────────────────────────────────────────────────────

  it('should get the running workspace', async () => {
    console.log('');
    console.log('═══════════════════════════════════════════');
    console.log(' Step 2: provider.get() — running');
    console.log('═══════════════════════════════════════════');

    const ws = await provider.get(workspace.id);

    expect(ws.id).toBe(workspace.id);
    expect(ws.status).toBe('running');
    expect(ws.connection.ssh.command).toContain(workspace.id);

    console.log(`  Status: ${ws.status}`);
  }, 60_000);

  // ──────────────────────────────────────────────────────────────────────────
  // Step 3: list() — find workspace
  // ──────────────────────────────────────────────────────────────────────────

  it('should list workspaces and find the created one', async () => {
    console.log('');
    console.log('═══════════════════════════════════════════');
    console.log(' Step 3: provider.list()');
    console.log('═══════════════════════════════════════════');

    const all = await provider.list();
    const found = all.find((w) => w.id === workspace.id);

    expect(found).toBeDefined();
    expect(found!.status).toBe('running');

    console.log(`  Found in list of ${all.length} workspaces`);

    // Test filtering
    const running = await provider.list({ status: ['running'] });
    const runningFound = running.find((w) => w.id === workspace.id);
    expect(runningFound).toBeDefined();

    const stopped = await provider.list({ status: ['stopped'] });
    const stoppedFound = stopped.find((w) => w.id === workspace.id);
    expect(stoppedFound).toBeUndefined();

    console.log(`  Filtering works: running=${running.length}, stopped=${stopped.length}`);
  }, 60_000);

  // ──────────────────────────────────────────────────────────────────────────
  // Step 4: stop()
  // ──────────────────────────────────────────────────────────────────────────

  it('should stop the workspace', async () => {
    console.log('');
    console.log('═══════════════════════════════════════════');
    console.log(' Step 4: provider.stop()');
    console.log('═══════════════════════════════════════════');

    await provider.stop(workspace.id);

    // Verify stopped — poll since state change is async
    let ws: Workspace | undefined;
    const start = Date.now();
    while (Date.now() - start < 120_000) {
      ws = await provider.get(workspace.id);
      console.log(`  State: ${ws.status}`);
      if (ws.status === 'stopped') break;
      await new Promise((r) => setTimeout(r, 5_000));
    }

    expect(ws!.status).toBe('stopped');
    console.log(`  Stopped in ${Math.round((Date.now() - start) / 1000)}s`);
  }, 180_000);

  // ──────────────────────────────────────────────────────────────────────────
  // Step 5: stop() again — idempotent
  // ──────────────────────────────────────────────────────────────────────────

  it('should no-op when stopping an already-stopped workspace', async () => {
    console.log('');
    console.log('═══════════════════════════════════════════');
    console.log(' Step 5: provider.stop() — idempotent');
    console.log('═══════════════════════════════════════════');

    // Should not throw
    await provider.stop(workspace.id);

    const ws = await provider.get(workspace.id);
    expect(ws.status).toBe('stopped');

    console.log('  No-op confirmed: still stopped');
  }, 60_000);

  // ──────────────────────────────────────────────────────────────────────────
  // Step 6: resume()
  // ──────────────────────────────────────────────────────────────────────────

  it('should resume the stopped workspace', async () => {
    console.log('');
    console.log('═══════════════════════════════════════════');
    console.log(' Step 6: provider.resume()');
    console.log('═══════════════════════════════════════════');

    const resumed = await provider.resume(workspace.id);

    console.log(`  ID:     ${resumed.id}`);
    console.log(`  Status: ${resumed.status}`);
    console.log(`  SSH:    ${resumed.connection.ssh.command}`);
    console.log(`  URLs:   ${JSON.stringify(resumed.connection.urls)}`);

    expect(resumed.id).toBe(workspace.id);
    expect(resumed.status).toBe('running');
    expect(resumed.connection.ssh.command).toContain(workspace.id);
    expect(resumed.connection.urls).toBeDefined();
    expect(resumed.connection.urls!.ide).toContain('.github.dev');
  }, 600_000); // 10 min — includes starting + waiting + runtime

  // ──────────────────────────────────────────────────────────────────────────
  // Step 7: get() — verify running again
  // ──────────────────────────────────────────────────────────────────────────

  it('should show running state after resume', async () => {
    console.log('');
    console.log('═══════════════════════════════════════════');
    console.log(' Step 7: provider.get() — running after resume');
    console.log('═══════════════════════════════════════════');

    const ws = await provider.get(workspace.id);

    expect(ws.status).toBe('running');
    console.log(`  Status: ${ws.status}`);
  }, 60_000);

  // ──────────────────────────────────────────────────────────────────────────
  // Step 8: delete()
  // ──────────────────────────────────────────────────────────────────────────

  it('should delete the workspace', async () => {
    console.log('');
    console.log('═══════════════════════════════════════════');
    console.log(' Step 8: provider.delete()');
    console.log('═══════════════════════════════════════════');

    await provider.delete(workspace.id);

    // Verify it's gone — get() should throw WorkspaceNotFoundError
    // (getCodespace returns null → get() throws)
    await expect(provider.get(workspace.id)).rejects.toThrow(
      WorkspaceNotFoundError
    );

    console.log(`  Deleted: ${workspace.id}`);
  }, 60_000);
});
