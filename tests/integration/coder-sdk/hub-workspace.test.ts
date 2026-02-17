/**
 * CoderClient Hub Workspace Lifecycle — Integration Tests
 *
 * Full headless flow: admin creates a headless user, then creates and manages
 * a workspace for that user. This validates the core sudocode-hub integration
 * where all operations go through the admin token.
 *
 * Lifecycle: create headless user → create workspace → running → agent ready →
 *   verify sudocode → stop → start → delete.
 *
 * Requires CODER_HUB_URL and CODER_HUB_TOKEN env vars (Flow 2).
 * Uses generous timeouts — workspace creation with Docker templates can take 30-120s.
 *
 * @see s-7rdw - Coder Local Development (Flow 2)
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { CoderClient } from '../../../src/coder-sdk/client.js';
import type { CoderWorkspace, CoderWorkspaceAgent, CoderUser } from '../../../src/coder-sdk/types.js';
import {
  getCoderHubEnv,
  createTestClient,
  safeDeleteWorkspace,
} from './helpers.js';

const result = getCoderHubEnv();
const skipReason = result.skipReason;

/**
 * Extract the first agent from a workspace's latest build resources.
 */
function getFirstAgent(workspace: CoderWorkspace): CoderWorkspaceAgent | undefined {
  for (const resource of workspace.latest_build.resources) {
    if (resource.agents && resource.agents.length > 0) {
      return resource.agents[0];
    }
  }
  return undefined;
}

describe.skipIf(skipReason)('CoderClient Hub Workspace Lifecycle (integration)', () => {
  let client: CoderClient;
  let orgId: string;
  let templateId: string;
  let headlessUser: CoderUser;
  let workspace: CoderWorkspace | undefined;

  const testSuffix = Date.now();
  const headlessUsername = `hub-ws-test-${testSuffix}`;
  const workspaceName = `hub-test-${testSuffix}`;

  beforeAll(async () => {
    client = createTestClient(result.env!);

    // Get org ID from admin user
    const admin = await client.getCurrentUser();
    orgId = admin.organization_ids[0];

    // Get the default template (pushed by init script)
    const template = await client.getTemplateByName(orgId, 'default');
    templateId = template.id;

    // Create a headless user for this test run
    headlessUser = await client.createUser({
      email: `${headlessUsername}@test.local`,
      username: headlessUsername,
      name: 'Hub Workspace Test User',
      loginType: 'none',
      organizationIds: [orgId],
    });
  }, 30_000);

  afterAll(async () => {
    if (workspace) {
      await safeDeleteWorkspace(client, workspace.id);
    }
  });

  it('headless user was created with login_type "none"', () => {
    expect(headlessUser).toBeDefined();
    expect(headlessUser.username).toBe(headlessUsername);
    expect(headlessUser.login_type).toBe('none');
  });

  it('createWorkspace() creates a workspace owned by the headless user', async () => {
    workspace = await client.createWorkspace({
      organizationId: orgId,
      username: headlessUser.username,
      name: workspaceName,
      templateId,
      richParameterValues: [
        { name: 'repository', value: 'octocat/Hello-World' },
        { name: 'claude_ltt', value: 'test-hub-ltt-token' },
        { name: 'sudocode_port', value: '3000' },
      ],
    });

    expect(workspace).toBeDefined();
    expect(workspace.id).toBeDefined();
    expect(workspace.name).toBe(workspaceName);
    expect(workspace.owner_name).toBe(headlessUsername);
    expect(workspace.template_id).toBe(templateId);
  }, 60_000);

  it('waitForWorkspaceStatus("running") resolves', async () => {
    expect(workspace).toBeDefined();

    const running = await client.waitForWorkspaceStatus({
      workspaceId: workspace!.id,
      targetStatus: 'running',
      pollIntervalMs: 3000,
      timeoutMs: 180_000,
    });

    expect(running.latest_build.status).toBe('running');
  }, 200_000);

  it('agent connects after workspace starts', async () => {
    expect(workspace).toBeDefined();

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

    const deadline = Date.now() + 600_000;
    let agent: CoderWorkspaceAgent | undefined;

    while (Date.now() < deadline) {
      const ws = await client.getWorkspace(workspace!.id);
      agent = getFirstAgent(ws);

      const elapsed = Math.round((Date.now() - (deadline - 600_000)) / 1000);
      console.log(
        `[hub lifecycle +${elapsed}s] status=${agent?.status ?? 'n/a'} lifecycle=${agent?.lifecycle_state ?? 'n/a'}`,
      );

      if (agent?.lifecycle_state === 'ready') break;
      if (agent?.lifecycle_state === 'start_error') {
        throw new Error('Agent startup script failed (lifecycle_state = start_error)');
      }

      await new Promise((r) => setTimeout(r, 5000));
    }

    expect(agent).toBeDefined();
    expect(agent!.lifecycle_state).toBe('ready');
  }, 610_000);

  it('getWorkspace() returns workspace owned by headless user', async () => {
    expect(workspace).toBeDefined();

    const fetched = await client.getWorkspace(workspace!.id);
    expect(fetched.id).toBe(workspace!.id);
    expect(fetched.name).toBe(workspaceName);
    expect(fetched.owner_name).toBe(headlessUsername);
  });

  it('listWorkspaces() with owner filter includes the workspace', async () => {
    expect(workspace).toBeDefined();

    const response = await client.listWorkspaces({
      query: `owner:${headlessUsername}`,
    });

    expect(response.workspaces).toBeInstanceOf(Array);
    const found = response.workspaces.find((w) => w.name === workspaceName);
    expect(found).toBeDefined();
    expect(found!.owner_name).toBe(headlessUsername);
  });

  it('stopWorkspace() stops the headless user workspace', async () => {
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

  it('startWorkspace() restarts the headless user workspace', async () => {
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

    // Clear so afterAll doesn't double-delete
    workspace = undefined;
  }, 60_000);
});
