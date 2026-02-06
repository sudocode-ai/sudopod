/**
 * CoderProvider Integration Tests — Full Lifecycle
 *
 * Tests the unified Provider interface against a real self-hosted Coder instance.
 * Creates a workspace via `provider.create()`, exercises stop/resume/get/list/delete.
 *
 * Requires CODER_URL and CODER_TOKEN env vars.
 *
 * @see s-6q31 - Self-Hosted Coder Provider spec
 * @see i-3dlc - CoderProvider implementation issue
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createProvider } from '../../../../src/provider/factory.js';
import { CoderProvider } from '../../../../src/provider/coder/index.js';
import { WorkspaceNotFoundError } from '../../../../src/provider/errors.js';
import type { Provider, Workspace } from '../../../../src/provider/types.js';

// =============================================================================
// Environment Detection
// =============================================================================

function getTestEnv(): { url: string; token: string } | undefined {
  const url = process.env.CODER_URL;
  const token = process.env.CODER_TOKEN;
  if (!url || !token) return undefined;
  return { url, token };
}

const env = getTestEnv();
const skipReason = env
  ? undefined
  : 'CODER_URL / CODER_TOKEN not set. Set these env vars to run provider integration tests.';

// =============================================================================
// Tests
// =============================================================================

describe.skipIf(skipReason)('CoderProvider Lifecycle (integration)', () => {
  let provider: Provider;
  let workspace: Workspace | undefined;
  const workspaceName = `provider-test-${Date.now()}`;

  beforeAll(() => {
    provider = createProvider('coder', {
      url: env!.url,
      authToken: env!.token,
    });
  });

  afterAll(async () => {
    if (workspace) {
      try {
        await provider.delete(workspace.id);
      } catch {
        console.warn(`[cleanup] Failed to delete workspace ${workspace.id}`);
      }
    }
  });

  // ---------------------------------------------------------------------------
  // Factory
  // ---------------------------------------------------------------------------

  it('createProvider("coder") returns a CoderProvider instance', () => {
    expect(provider).toBeInstanceOf(CoderProvider);
    expect(provider.name).toBe('Coder');
  });

  // ---------------------------------------------------------------------------
  // create()
  // ---------------------------------------------------------------------------

  it('create() provisions a workspace and returns it running', async () => {
    workspace = await provider.create({
      name: workspaceName,
      repository: { owner: 'octocat', repo: 'Hello-World' },
      retentionDays: 1,
    });

    expect(workspace).toBeDefined();
    expect(workspace.id).toBeDefined();
    expect(workspace.name).toBe(workspaceName);
    expect(workspace.status).toBe('running');
    expect(workspace.connection.ssh.command).toContain(workspaceName);
    expect(workspace.connection.urls?.dashboard).toContain(workspaceName);
  }, 300_000);

  // ---------------------------------------------------------------------------
  // get()
  // ---------------------------------------------------------------------------

  it('get() returns the workspace details', async () => {
    expect(workspace).toBeDefined();

    const fetched = await provider.get(workspace!.id);

    expect(fetched.id).toBe(workspace!.id);
    expect(fetched.name).toBe(workspaceName);
    expect(fetched.status).toBe('running');
  });

  // ---------------------------------------------------------------------------
  // list()
  // ---------------------------------------------------------------------------

  it('list() includes the workspace', async () => {
    expect(workspace).toBeDefined();

    const all = await provider.list();

    expect(all).toBeInstanceOf(Array);
    const found = all.find((w) => w.name === workspaceName);
    expect(found).toBeDefined();
    expect(found!.id).toBe(workspace!.id);
  });

  it('list({ status: ["running"] }) includes the workspace', async () => {
    expect(workspace).toBeDefined();

    const running = await provider.list({ status: ['running'] });

    const found = running.find((w) => w.name === workspaceName);
    expect(found).toBeDefined();
  });

  // ---------------------------------------------------------------------------
  // stop()
  // ---------------------------------------------------------------------------

  it('stop() transitions workspace to stopped', async () => {
    expect(workspace).toBeDefined();

    await provider.stop(workspace!.id);

    const stopped = await provider.get(workspace!.id);
    expect(stopped.status).toBe('stopped');
  }, 120_000);

  // ---------------------------------------------------------------------------
  // resume()
  // ---------------------------------------------------------------------------

  it('resume() starts a stopped workspace back to running', async () => {
    expect(workspace).toBeDefined();

    const resumed = await provider.resume(workspace!.id);

    expect(resumed.status).toBe('running');
    expect(resumed.id).toBe(workspace!.id);
  }, 300_000);

  // ---------------------------------------------------------------------------
  // delete()
  // ---------------------------------------------------------------------------

  it('delete() triggers workspace deletion', async () => {
    expect(workspace).toBeDefined();

    await provider.delete(workspace!.id);

    // Give Coder a moment to start the delete build
    await new Promise((r) => setTimeout(r, 3000));

    // The workspace should be in a deleting/deleted state or gone
    try {
      const deleted = await provider.get(workspace!.id);
      expect(['deleting', 'failed']).toContain(deleted.status);
    } catch (err) {
      // 404 is fine — workspace is fully deleted
      expect(err).toBeInstanceOf(WorkspaceNotFoundError);
    }

    // Clear workspace ref so afterAll doesn't double-delete
    workspace = undefined;
  }, 60_000);

  // ---------------------------------------------------------------------------
  // Error cases
  // ---------------------------------------------------------------------------

  it('get() with non-existent ID throws WorkspaceNotFoundError', async () => {
    await expect(
      provider.get('00000000-0000-0000-0000-000000000000'),
    ).rejects.toThrow(WorkspaceNotFoundError);
  });
});
