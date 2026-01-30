/**
 * CoderClient Workspace Lifecycle — Integration Tests
 *
 * Full lifecycle test: create → running → agent ready → stop → stopped → start → running → delete.
 * Also tests lookup operations (getWorkspace, getWorkspaceByOwnerAndName, listWorkspaces).
 * Verifies that the template startup script runs (agent lifecycle_state → ready).
 *
 * Requires CODER_URL and CODER_TOKEN env vars (Flow 1).
 * Uses generous timeouts — workspace creation with Docker templates can take 30-120s.
 *
 * @see s-7rdw - Coder Local Development (Flow 1)
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { CoderClient } from '../../../src/coder-sdk/client.js';
import { CoderApiError } from '../../../src/coder-sdk/errors.js';
import type { CoderWorkspace, CoderWorkspaceAgent } from '../../../src/coder-sdk/types.js';
import {
  getCoderSelfHostedEnv,
  createTestClient,
  generateTestWorkspaceName,
  safeDeleteWorkspace,
} from './helpers.js';

const result = getCoderSelfHostedEnv();
const skipReason = result.skipReason;

/**
 * Extract the first agent from a workspace's latest build resources.
 * Returns undefined if no agent is found (e.g., workspace is stopped).
 */
function getFirstAgent(workspace: CoderWorkspace): CoderWorkspaceAgent | undefined {
  for (const resource of workspace.latest_build.resources) {
    if (resource.agents && resource.agents.length > 0) {
      return resource.agents[0];
    }
  }
  return undefined;
}

describe.skipIf(skipReason)('CoderClient Workspace Lifecycle (integration)', () => {
  let client: CoderClient;
  let orgId: string;
  let templateId: string;
  let workspace: CoderWorkspace | undefined;
  const workspaceName = generateTestWorkspaceName();

  beforeAll(async () => {
    client = createTestClient(result.env!);
    const user = await client.getCurrentUser();
    orgId = user.organization_ids[0];

    const template = await client.getTemplateByName(orgId, 'default');
    templateId = template.id;
  });

  afterAll(async () => {
    if (workspace) {
      await safeDeleteWorkspace(client, workspace.id);
    }
  });

  it('createWorkspace() creates a workspace with sudocode parameters', async () => {
    workspace = await client.createWorkspace({
      organizationId: orgId,
      username: 'me',
      name: workspaceName,
      templateId,
      richParameterValues: [
        { name: 'repository', value: 'octocat/Hello-World' },
        { name: 'claude_ltt', value: 'test-ltt-token-for-integration' },
        { name: 'sudocode_port', value: '3000' },
      ],
    });

    expect(workspace).toBeDefined();
    expect(workspace.id).toBeDefined();
    expect(workspace.name).toBe(workspaceName);
    expect(workspace.template_id).toBe(templateId);
  }, 60_000);

  it('waitForWorkspaceStatus("running") resolves when workspace is running', async () => {
    expect(workspace).toBeDefined();

    const running = await client.waitForWorkspaceStatus({
      workspaceId: workspace!.id,
      targetStatus: 'running',
      pollIntervalMs: 3000,
      timeoutMs: 180_000,
    });

    expect(running.latest_build.status).toBe('running');
  }, 200_000);

  it('agent is connected after workspace starts', async () => {
    expect(workspace).toBeDefined();

    // Poll until the agent is connected. The agent connects independently
    // of the startup script — it establishes a connection as soon as the
    // container starts, then runs the startup script asynchronously.
    const deadline = Date.now() + 120_000;
    let agent: CoderWorkspaceAgent | undefined;

    while (Date.now() < deadline) {
      const ws = await client.getWorkspace(workspace!.id);
      agent = getFirstAgent(ws);

      if (agent?.status === 'connected') break;

      await new Promise((r) => setTimeout(r, 3000));
    }

    expect(agent).toBeDefined();
    expect(agent!.status).toBe('connected');
  }, 130_000);

  it('agent lifecycle_state reaches "ready" (startup script completed)', async () => {
    expect(workspace).toBeDefined();

    // Poll until the startup script finishes. This confirms:
    // - npm install -g sudocode succeeded
    // - sudocode init ran
    // - sudocode server launched without the script erroring out
    const deadline = Date.now() + 600_000; // 10 min — first image pull can be slow
    let agent: CoderWorkspaceAgent | undefined;

    while (Date.now() < deadline) {
      const ws = await client.getWorkspace(workspace!.id);
      agent = getFirstAgent(ws);

      if (agent?.lifecycle_state === 'ready') break;
      if (agent?.lifecycle_state === 'start_error') {
        throw new Error('Agent startup script failed (lifecycle_state = start_error)');
      }

      await new Promise((r) => setTimeout(r, 5000));
    }

    expect(agent).toBeDefined();
    expect(agent!.lifecycle_state).toBe('ready');
  }, 610_000);

  it('sudocode server is responding inside workspace (via coder ssh)', async () => {
    expect(workspace).toBeDefined();

    // Use coder CLI to exec a curl inside the workspace.
    // The CLI authenticates using CODER_URL + CODER_SESSION_TOKEN env vars.
    const { execSync } = await import('child_process');

    const ownerName = workspace!.owner_name;
    const wsName = workspace!.name;
    const env = result.env!;

    const output = execSync(
      `coder ssh ${ownerName}/${wsName} -- curl -sf http://localhost:3000/health`,
      {
        env: {
          ...process.env,
          CODER_URL: env.url,
          CODER_SESSION_TOKEN: env.token,
        },
        timeout: 30_000,
        encoding: 'utf-8',
      },
    );

    // The health endpoint should return something — at minimum a 200 response body
    expect(output).toBeDefined();
    expect(output.length).toBeGreaterThan(0);
  }, 60_000);

  it('getWorkspace() returns the workspace', async () => {
    expect(workspace).toBeDefined();

    const fetched = await client.getWorkspace(workspace!.id);

    expect(fetched.id).toBe(workspace!.id);
    expect(fetched.name).toBe(workspaceName);
  });

  it('getWorkspaceByOwnerAndName("me", name) returns the workspace', async () => {
    expect(workspace).toBeDefined();

    const fetched = await client.getWorkspaceByOwnerAndName('me', workspaceName);

    expect(fetched.id).toBe(workspace!.id);
    expect(fetched.name).toBe(workspaceName);
  });

  it('listWorkspaces({ query: "owner:me" }) includes the workspace', async () => {
    expect(workspace).toBeDefined();

    const response = await client.listWorkspaces({ query: 'owner:me' });

    expect(response.workspaces).toBeInstanceOf(Array);
    const found = response.workspaces.find((w) => w.name === workspaceName);
    expect(found).toBeDefined();
  });

  it('stopWorkspace() → waitForWorkspaceStatus("stopped")', async () => {
    expect(workspace).toBeDefined();

    await client.stopWorkspace(workspace!.id);

    const stopped = await client.waitForWorkspaceStatus({
      workspaceId: workspace!.id,
      targetStatus: 'stopped',
      pollIntervalMs: 3000,
      timeoutMs: 120_000,
    });

    expect(stopped.latest_build.status).toBe('stopped');
  }, 130_000);

  it('startWorkspace() → waitForWorkspaceStatus("running")', async () => {
    expect(workspace).toBeDefined();

    await client.startWorkspace(workspace!.id);

    const running = await client.waitForWorkspaceStatus({
      workspaceId: workspace!.id,
      targetStatus: 'running',
      pollIntervalMs: 3000,
      timeoutMs: 180_000,
    });

    expect(running.latest_build.status).toBe('running');
  }, 200_000);

  it('deleteWorkspace() triggers deletion', async () => {
    expect(workspace).toBeDefined();

    const build = await client.deleteWorkspace(workspace!.id);
    expect(build.transition).toBe('delete');

    // Clear the workspace ref so afterAll doesn't double-delete
    workspace = undefined;
  }, 60_000);

  it('getWorkspace() with non-existent ID throws CoderApiError with isNotFound', async () => {
    const fakeId = '00000000-0000-0000-0000-000000000000';

    try {
      await client.getWorkspace(fakeId);
      expect.fail('Expected CoderApiError to be thrown');
    } catch (error) {
      expect(error).toBeInstanceOf(CoderApiError);
      expect((error as CoderApiError).isNotFound).toBe(true);
    }
  });
});
