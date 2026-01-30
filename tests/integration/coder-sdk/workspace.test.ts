/**
 * CoderClient Workspace Lifecycle — Integration Tests
 *
 * Full lifecycle test: create → running → stop → stopped → start → running → delete.
 * Also tests lookup operations (getWorkspace, getWorkspaceByOwnerAndName, listWorkspaces).
 *
 * Requires CODER_URL and CODER_TOKEN env vars (Flow 1).
 * Uses generous timeouts — workspace creation with Docker templates can take 30-120s.
 *
 * @see s-7rdw - Coder Local Development (Flow 1)
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { CoderClient } from '../../../src/coder-sdk/client.js';
import { CoderApiError } from '../../../src/coder-sdk/errors.js';
import type { CoderWorkspace } from '../../../src/coder-sdk/types.js';
import {
  getCoderSelfHostedEnv,
  createTestClient,
  generateTestWorkspaceName,
  safeDeleteWorkspace,
} from './helpers.js';

const result = getCoderSelfHostedEnv();
const skipReason = result.skipReason;

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

  it('createWorkspace() creates a workspace and returns it', async () => {
    workspace = await client.createWorkspace({
      organizationId: orgId,
      username: 'me',
      name: workspaceName,
      templateId,
      richParameterValues: [
        { name: 'repository', value: 'coder/coder' },
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
