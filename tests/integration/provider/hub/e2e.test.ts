/**
 * Hub Provider E2E Test — Full Workspace Lifecycle
 *
 * Validates the full hub pathway:
 *   HubProvider → mock hub server (in-process) → CoderOrchestrator → staging Coder
 *
 * Tests run serially against a single workspace:
 *   health check → auth rejection → create → get → list → stop → resume → delete
 *
 * Prerequisites:
 * - CODER_URL and CODER_TOKEN set (loaded from .env.coder-staging by setup.ts)
 * - RUN_INTEGRATION_TESTS=1
 *
 * @see s-7utm - Mock Hub Server + HubProvider Implementation
 */

import { describe, it, beforeAll, afterAll, expect } from 'vitest';
import type { Server } from 'node:http';
import { createHubServer } from '../../../../src/hub-server/index.js';
import { HubProvider } from '../../../../src/provider/hub/index.js';
import type { Workspace } from '../../../../src/provider/types.js';

if (!process.env.RUN_INTEGRATION_TESTS) {
  console.log(
    '\n  Skipping Hub E2E tests: RUN_INTEGRATION_TESTS not set',
  );
  console.log(
    '  To run: RUN_INTEGRATION_TESTS=1 npm run test:e2e:hub\n',
  );
  process.exit(0);
}

const TEST_REPO_OWNER = 'sudocode-ai';
const TEST_REPO_NAME = 'sudocode';
const TEST_BRANCH = 'main';
const RETENTION_DAYS = 1;
const HUB_API_KEY = `test-hub-key-${Date.now()}`;

function getTestEnv(): { coderUrl: string; coderToken: string } | undefined {
  const coderUrl = process.env.CODER_URL;
  const coderToken = process.env.CODER_TOKEN;
  if (!coderUrl || !coderToken) return undefined;
  return { coderUrl, coderToken };
}

describe('Hub Provider E2E: Full Workspace Lifecycle', () => {
  const testEnv = getTestEnv();
  if (!testEnv) {
    it.skip('CODER_URL and CODER_TOKEN not set — skipping', () => {});
    return;
  }

  let server: Server;
  let hubUrl: string;
  let provider: HubProvider;
  let workspace: Workspace;

  // ── Setup: start mock hub server in-process ──

  beforeAll(async () => {
    console.log('Starting mock hub server in-process...');
    const app = createHubServer({
      coderUrl: testEnv.coderUrl,
      coderToken: testEnv.coderToken,
      apiKeys: [HUB_API_KEY],
    });

    // Listen on random port
    server = await new Promise<Server>((resolve) => {
      const s = app.listen(0, () => resolve(s));
    });

    const addr = server.address();
    if (!addr || typeof addr === 'string') {
      throw new Error('Failed to get server address');
    }
    hubUrl = `http://localhost:${addr.port}`;
    console.log(`  Hub server listening at ${hubUrl}`);

    // Create HubProvider pointing at the in-process server
    provider = new HubProvider({
      url: hubUrl,
      authToken: HUB_API_KEY,
    });
  }, 30_000);

  // ── Teardown ──

  afterAll(async () => {
    console.log('Tearing down...');

    // Delete workspace if it was created
    if (workspace) {
      try {
        await provider.delete(workspace.id);
        console.log(`  Deleted workspace: ${workspace.id}`);
      } catch (err) {
        console.log(`  Failed to delete workspace: ${err}`);
      }
    }

    // Stop server
    if (server) {
      await new Promise<void>((resolve) => server.close(() => resolve()));
      console.log('  Hub server stopped');
    }
  }, 120_000);

  // ── Health check ──

  it('health check responds without auth', async () => {
    const res = await fetch(`${hubUrl}/health`);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(body.timestamp).toBeDefined();
  }, 10_000);

  // ── Auth rejection ──

  it('rejects requests with invalid auth token', async () => {
    const res = await fetch(`${hubUrl}/workspaces`, {
      headers: { 'Authorization': 'Bearer wrong-key' },
    });
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.code).toBe('AUTHENTICATION_FAILED');
  }, 10_000);

  // ── Create ──

  it('create() provisions a workspace via hub', async () => {
    console.log('Creating workspace via HubProvider...');
    workspace = await provider.create({
      name: `hub-e2e-${Date.now()}`,
      repository: {
        owner: TEST_REPO_OWNER,
        repo: TEST_REPO_NAME,
        branch: TEST_BRANCH,
      },
      retentionDays: RETENTION_DAYS,
    });

    console.log(`  Created: ${workspace.id} / ${workspace.name} (status=${workspace.status})`);
    expect(workspace).toBeDefined();
    expect(workspace.id).toBeTruthy();
    expect(workspace.name).toBeTruthy();
    expect(workspace.status).toBe('running');
    expect(workspace.createdAt).toBeInstanceOf(Date);
  }, 600_000);

  // ── Get ──

  it('get() returns the workspace', async () => {
    const ws = await provider.get(workspace.id);
    expect(ws.id).toBe(workspace.id);
    expect(ws.name).toBe(workspace.name);
    expect(ws.status).toBe('running');
    expect(ws.createdAt).toBeInstanceOf(Date);
  }, 30_000);

  // ── List ──

  it('list() includes the workspace', async () => {
    const all = await provider.list();
    const found = all.find((ws) => ws.id === workspace.id);
    expect(found).toBeDefined();
    expect(found!.name).toBe(workspace.name);
  }, 30_000);

  // ── Stop ──

  it('stop() stops the workspace', async () => {
    console.log('Stopping workspace via HubProvider...');
    await provider.stop(workspace.id);
    console.log('  Workspace stopped');

    // Verify it's stopped
    const ws = await provider.get(workspace.id);
    expect(ws.status).toBe('stopped');
    console.log(`  Verified status: ${ws.status}`);
  }, 600_000);

  // ── Resume ──

  it('resume() resumes the workspace', async () => {
    console.log('Resuming workspace via HubProvider...');
    const ws = await provider.resume(workspace.id);
    workspace = ws;
    console.log(`  Resumed: status=${ws.status}`);
    expect(ws.status).toBe('running');
    expect(ws.id).toBeTruthy();
  }, 600_000);

  // ── Delete ──

  it('delete() removes the workspace', async () => {
    console.log('Deleting workspace via HubProvider...');
    await provider.delete(workspace.id);
    console.log('  Workspace deleted');

    // Verify it's gone (should throw WorkspaceNotFoundError)
    try {
      await provider.get(workspace.id);
      // If we get here, the workspace still exists — fail
      expect.fail('Expected WorkspaceNotFoundError after delete');
    } catch (err: unknown) {
      // Expected — workspace was deleted
      expect((err as Error).message).toBeTruthy();
    }

    // Clear workspace so afterAll doesn't try to delete again
    workspace = undefined as unknown as Workspace;
  }, 600_000);
});
