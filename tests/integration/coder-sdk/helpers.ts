/**
 * Integration test helpers for sudopod-coder-sdk.
 *
 * Provides environment detection with actionable setup instructions
 * when local Coder infrastructure is not running.
 *
 * @see s-7rdw - Coder Local Development
 */

import { CoderClient } from '../../../src/coder-sdk/client.js';

export interface CoderTestEnv {
  url: string;
  token: string;
}

/**
 * Detect self-hosted Coder environment (Flow 1, port 7080).
 * Returns either a valid env or a skip reason.
 *
 * The setup file (setup.ts) auto-provisions infrastructure and sets env vars.
 * If they're still missing here, Docker or the submodule is unavailable.
 */
export function getCoderSelfHostedEnv():
  | { env: CoderTestEnv; skipReason?: undefined }
  | { env?: undefined; skipReason: string } {
  const url = process.env.CODER_URL;
  const token = process.env.CODER_TOKEN;

  if (!url || !token) {
    return {
      skipReason: [
        'Self-hosted Coder not available (CODER_URL / CODER_TOKEN not set).',
        'The setup file should auto-provision this. Possible causes:',
        '  - refs/coder-infra submodule missing: git submodule update --init refs/coder-infra',
        '  - Docker not running',
        '  - Setup script failed (check test output above for details)',
      ].join('\n'),
    };
  }

  return { env: { url, token } };
}

/**
 * Detect hub Coder environment (Flow 2, port 7081).
 * Returns either a valid env or a skip reason.
 *
 * The setup file (setup.ts) auto-provisions infrastructure and sets env vars.
 * If they're still missing here, Docker or the submodule is unavailable.
 */
export function getCoderHubEnv():
  | { env: CoderTestEnv; skipReason?: undefined }
  | { env?: undefined; skipReason: string } {
  const url = process.env.CODER_HUB_URL;
  const token = process.env.CODER_HUB_TOKEN;

  if (!url || !token) {
    return {
      skipReason: [
        'Hub Coder not available (CODER_HUB_URL / CODER_HUB_TOKEN not set).',
        'The setup file should auto-provision this. Possible causes:',
        '  - refs/coder-infra submodule missing: git submodule update --init refs/coder-infra',
        '  - Docker not running',
        '  - Hub init container failed (check test output above for details)',
      ].join('\n'),
    };
  }

  return { env: { url, token } };
}

/**
 * Create a CoderClient from a test environment config.
 */
export function createTestClient(env: CoderTestEnv): CoderClient {
  return new CoderClient({ baseUrl: env.url, token: env.token });
}

/**
 * Generate a unique workspace name for integration tests.
 */
export function generateTestWorkspaceName(prefix = 'sdk-test'): string {
  return `${prefix}-${Date.now()}`;
}

/**
 * Cleanup helper: attempt to delete a workspace, logging warnings on failure.
 */
export async function safeDeleteWorkspace(
  client: CoderClient,
  workspaceId: string,
): Promise<void> {
  try {
    await client.deleteWorkspace(workspaceId);
    // Give Coder a moment to start the delete
    await new Promise((resolve) => setTimeout(resolve, 2000));
  } catch (error) {
    console.warn(`Failed to cleanup workspace ${workspaceId}:`, error);
  }
}
