/**
 * Coder Provider E2E Tests — Environment Variable Injection
 *
 * Validates that env vars passed via the template's `env_vars` parameter
 * are available inside the workspace's agent environment.
 *
 * Two test paths:
 * 1. Direct Coder API (self-hosted flow) — simulates user setting env vars in Coder UI
 * 2. Sudopod Provider API (hub flow) — simulates hub passing env vars via templateParams
 *
 * Prerequisites:
 * - CODER_URL and CODER_TOKEN set (auto-provisioned by vitest setup)
 * - Template with `env_vars` parameter pushed to the Coder server
 *
 * @see s-40aw - Workspace Environment Variable Injection via Coder Template
 * @see i-srpi - E2E test: self-hosted flow
 * @see i-2i0f - E2E test: hub flow
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { CoderClient } from '../../../../src/coder-sdk/client.js';
import { createProvider } from '../../../../src/provider/factory.js';
import { createCoderExecFn } from '../../../../src/provider/coder/cli.js';
import type { Provider, ExecFn } from '../../../../src/provider/types.js';

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
// Test 1: Direct Coder API (Self-Hosted Flow)
// =============================================================================

describe.skipIf(skipReason)('Env Injection: Direct Coder API (self-hosted flow)', () => {
  let client: CoderClient;
  let exec: ExecFn;
  let workspaceId: string | undefined;
  let workspaceName: string;

  const TEST_SECRET_KEY = 'TEST_SECRET_FROM_CODER';
  const TEST_SECRET_VALUE = `coder-direct-${Date.now()}`;

  beforeAll(() => {
    client = new CoderClient({ baseUrl: env!.url, token: env!.token });
    exec = createCoderExecFn({ coderUrl: env!.url, coderToken: env!.token });
  });

  afterAll(async () => {
    if (workspaceId) {
      try {
        await client.deleteWorkspace(workspaceId);
        console.log(`  [cleanup] Deleted workspace ${workspaceId}`);
      } catch (err) {
        console.warn(`  [cleanup] Failed to delete workspace: ${err}`);
      }
    }
  });

  it('creates a workspace with env_vars and verifies env var is present', async () => {
    // 1. Resolve template + org
    const user = await client.getCurrentUser();
    const organizationId = user.organization_ids[0];
    const template = await client.getTemplateByName(organizationId, 'default');

    // 2. Create workspace with env_vars rich parameter
    workspaceName = `env-direct-${Date.now()}`;
    const envVars = JSON.stringify({ [TEST_SECRET_KEY]: TEST_SECRET_VALUE });

    const workspace = await client.createWorkspace({
      organizationId,
      username: 'me',
      name: workspaceName,
      templateId: template.id,
      richParameterValues: [
        { name: 'repository', value: 'octocat/Hello-World' },
        { name: 'branch', value: 'main' },
        { name: 'env_vars', value: envVars },
      ],
      ttlMs: 24 * 60 * 60 * 1000,
    });
    workspaceId = workspace.id;
    console.log(`  Created workspace: ${workspaceName} (${workspaceId})`);

    // 3. Wait for running
    const ready = await client.waitForWorkspaceStatus({
      workspaceId: workspace.id,
      targetStatus: 'running',
    });
    expect(ready.latest_build.status).toBe('running');
    console.log(`  Workspace running`);

    // 4. Verify env var is in the agent environment
    const result = await exec(workspaceName, `echo $${TEST_SECRET_KEY}`);
    console.log(`  env var value: "${result.stdout.trim()}"`);
    expect(result.stdout.trim()).toBe(TEST_SECRET_VALUE);
  }, 600_000);
});

// =============================================================================
// Test 2: Sudopod Provider API (Hub Flow)
// =============================================================================

describe.skipIf(skipReason)('Env Injection: Sudopod Provider templateParams (hub flow)', () => {
  let provider: Provider;
  let exec: ExecFn;
  let workspaceId: string | undefined;
  let workspaceName: string;

  const TEST_SECRET_KEY = 'TEST_SECRET_FROM_HUB';
  const TEST_SECRET_VALUE = `hub-injected-${Date.now()}`;

  beforeAll(() => {
    provider = createProvider('coder', {
      url: env!.url,
      authToken: env!.token,
    });
    exec = createCoderExecFn({ coderUrl: env!.url, coderToken: env!.token });
  });

  afterAll(async () => {
    if (workspaceId) {
      try {
        await provider.delete(workspaceId);
        console.log(`  [cleanup] Deleted workspace ${workspaceId}`);
      } catch (err) {
        console.warn(`  [cleanup] Failed to delete workspace: ${err}`);
      }
    }
  });

  it('creates a workspace via provider with templateParams.env_vars and verifies env var is present', async () => {
    // 1. Create workspace via Provider API with env_vars in templateParams
    workspaceName = `env-hub-${Date.now()}`;
    const envVars = JSON.stringify({ [TEST_SECRET_KEY]: TEST_SECRET_VALUE });

    const workspace = await provider.create({
      name: workspaceName,
      repository: { owner: 'octocat', repo: 'Hello-World' },
      retentionDays: 1,
      templateParams: {
        env_vars: envVars,
      },
    });
    workspaceId = workspace.id;
    console.log(`  Created workspace: ${workspaceName} (${workspaceId}), status=${workspace.status}`);
    expect(workspace.status).toBe('running');

    // 2. Verify env var is in the agent environment
    const result = await exec(workspaceName, `echo $${TEST_SECRET_KEY}`);
    console.log(`  env var value: "${result.stdout.trim()}"`);
    expect(result.stdout.trim()).toBe(TEST_SECRET_VALUE);
  }, 600_000);
});
