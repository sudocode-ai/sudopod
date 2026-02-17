/**
 * Hub E2E: workspace creation with sudocode server verification.
 *
 * Creates a headless user, creates a workspace with claude_ltt and
 * sudocode_port parameters, waits for the startup script to complete,
 * and verifies the sudocode app is healthy via the Coder API.
 *
 * This is the end-to-end validation that the hub template's startup_script
 * actually installs sudocode, writes credentials, and starts the server.
 *
 * Requires CODER_HUB_URL and CODER_HUB_TOKEN (provisioned by setup-hub.ts).
 *
 * @see i-30qz - E2E test: hub flow workspace creation and sudocode server verification
 * @see s-7rdw - Coder Local Development (template startup script)
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { CoderClient } from '../../../src/coder-sdk/client.js';
import type { CoderWorkspace, CoderWorkspaceAgent, CoderWorkspaceApp } from '../../../src/coder-sdk/types.js';
import { getCoderHubEnv, createTestClient, safeDeleteWorkspace } from './helpers.js';

const result = getCoderHubEnv();
const skipReason = result.skipReason;

function getFirstAgent(workspace: CoderWorkspace): CoderWorkspaceAgent | undefined {
  for (const resource of workspace.latest_build.resources) {
    if (resource.agents && resource.agents.length > 0) {
      return resource.agents[0];
    }
  }
  return undefined;
}

function getSudocodeApp(agent: CoderWorkspaceAgent): CoderWorkspaceApp | undefined {
  return agent.apps.find((app) => app.slug === 'sudocode');
}

describe.skipIf(skipReason)('Hub E2E: sudocode server verification (integration)', () => {
  let client: CoderClient;
  let orgId: string;
  let workspace: CoderWorkspace | undefined;

  const testSuffix = Date.now();
  const headlessUsername = `hub-e2e-${testSuffix}`;
  const workspaceName = `hub-e2e-${testSuffix}`;

  beforeAll(async () => {
    client = createTestClient(result.env!);

    const admin = await client.getCurrentUser();
    orgId = admin.organization_ids[0];

    // Create headless user
    await client.createUser({
      email: `${headlessUsername}@test.local`,
      username: headlessUsername,
      name: 'Hub E2E Test User',
      loginType: 'none',
      organizationIds: [orgId],
    });

    // Create workspace with sudocode parameters
    const template = await client.getTemplateByName(orgId, 'default');
    workspace = await client.createWorkspace({
      organizationId: orgId,
      username: headlessUsername,
      name: workspaceName,
      templateId: template.id,
      richParameterValues: [
        { name: 'repository', value: 'octocat/Hello-World' },
        { name: 'claude_ltt', value: 'test-e2e-ltt-token' },
        { name: 'sudocode_port', value: '3000' },
      ],
    });

    // Wait for running
    await client.waitForWorkspaceStatus({
      workspaceId: workspace.id,
      targetStatus: 'running',
      pollIntervalMs: 3000,
      timeoutMs: 180_000,
    });

    // Wait for agent lifecycle_state === 'ready' (startup script complete)
    const deadline = Date.now() + 600_000;
    while (Date.now() < deadline) {
      const ws = await client.getWorkspace(workspace.id);
      const agent = getFirstAgent(ws);
      const elapsed = Math.round((Date.now() - (deadline - 600_000)) / 1000);
      console.log(
        `[hub-e2e +${elapsed}s] agent=${agent?.status ?? 'n/a'} lifecycle=${agent?.lifecycle_state ?? 'n/a'}`,
      );

      if (agent?.lifecycle_state === 'ready') {
        workspace = ws;
        break;
      }
      if (agent?.lifecycle_state === 'start_error') {
        throw new Error('Agent startup script failed (lifecycle_state = start_error)');
      }
      await new Promise((r) => setTimeout(r, 5000));
    }

    const agent = getFirstAgent(workspace);
    if (agent?.lifecycle_state !== 'ready') {
      throw new Error('Agent did not reach ready state within timeout');
    }
  }, 660_000);

  afterAll(async () => {
    if (workspace) {
      await safeDeleteWorkspace(client, workspace.id);
    }
  });

  it('agent startup script completed (lifecycle_state = ready)', () => {
    const agent = getFirstAgent(workspace!);
    expect(agent).toBeDefined();
    expect(agent!.lifecycle_state).toBe('ready');
  });

  it('sudocode app exists on the agent', () => {
    const agent = getFirstAgent(workspace!);
    expect(agent).toBeDefined();

    const app = getSudocodeApp(agent!);
    expect(app).toBeDefined();
    expect(app!.slug).toBe('sudocode');
    expect(app!.display_name).toBe('Sudocode Server');
  });

  it('sudocode app health check is passing', async () => {
    // The app health may take a moment to update after the agent reaches ready.
    // Poll until healthy or timeout.
    const deadline = Date.now() + 60_000;
    let app: CoderWorkspaceApp | undefined;

    while (Date.now() < deadline) {
      const ws = await client.getWorkspace(workspace!.id);
      const agent = getFirstAgent(ws);
      if (agent) {
        app = getSudocodeApp(agent);
        if (app?.health === 'healthy') break;
        console.log(`[hub-e2e] sudocode app health: ${app?.health ?? 'n/a'}`);
      }
      await new Promise((r) => setTimeout(r, 3000));
    }

    expect(app).toBeDefined();
    expect(app!.health).toBe('healthy');
  }, 70_000);
});
