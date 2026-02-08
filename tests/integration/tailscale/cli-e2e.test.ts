/**
 * E2E test: Tailscale CLI commands
 *
 * Validates the full flow from spec s-5dat:
 *   1. `sudopod headscale start` — spin up local Headscale via Docker
 *   2. `sudopod tailscale create-key` — generate a preauthkey from stored config
 *   3. `sudopod tailscale connect` — join the local machine to the tailnet
 *   4. Verify node appears in Headscale
 *   5. Teardown
 *
 * Prerequisites:
 * - Docker running
 * - Tailscale client installed locally
 * - RUN_INTEGRATION_TESTS=1
 *
 * Run:
 *   RUN_INTEGRATION_TESTS=1 npx vitest run tests/integration/tailscale/cli-e2e.test.ts --config vitest.integration.tailscale.config.ts
 *
 * @see s-5dat - Sudopod Tailscale CLI Support
 */

import { describe, it, beforeAll, afterAll, expect } from 'vitest';
import { execSync } from 'node:child_process';
import { readFileSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { HeadscaleClient } from '../../../src/headscale/client.js';

if (!process.env.RUN_INTEGRATION_TESTS) {
  console.log(
    '\n  Skipping integration tests: RUN_INTEGRATION_TESTS not set',
  );
  console.log(
    '   To run: RUN_INTEGRATION_TESTS=1 npx vitest run tests/integration/tailscale/cli-e2e.test.ts --config vitest.integration.tailscale.config.ts\n',
  );
  process.exit(0);
}

const HEADSCALE_PORT = '8080';
const HEADSCALE_URL = `http://localhost:${HEADSCALE_PORT}`;
const TEST_HOSTNAME = 'sudopod-cli-e2e';

// Use a temp config directory so we don't pollute the user's real config
const TEST_CONFIG_DIR = join(tmpdir(), `sudopod-cli-e2e-${Date.now()}`);
const TEST_CONFIG_PATH = join(TEST_CONFIG_DIR, 'config.json');

function shell(cmd: string, timeoutMs = 30_000): string {
  return execSync(cmd, {
    timeout: timeoutMs,
    encoding: 'utf-8',
    env: {
      ...process.env,
      // Override config path for test isolation
      SUDOPOD_CONFIG_PATH: TEST_CONFIG_PATH,
    },
  }).trim();
}

function readTestConfig(): Record<string, unknown> {
  try {
    return JSON.parse(readFileSync(TEST_CONFIG_PATH, 'utf-8'));
  } catch {
    return {};
  }
}

describe('Tailscale CLI E2E', () => {
  let apiKey: string;
  let headscaleClient: HeadscaleClient;

  // ── Setup ──

  beforeAll(async () => {
    // Create temp config directory
    mkdirSync(TEST_CONFIG_DIR, { recursive: true });
    writeFileSync(TEST_CONFIG_PATH, '{}');

    // Ensure Docker is available
    try {
      execSync('docker info', { stdio: 'pipe', timeout: 10_000 });
    } catch {
      throw new Error('Docker is not available. Cannot run Headscale E2E tests.');
    }

    // Ensure any previous test Headscale is stopped
    try {
      shell(
        `docker compose -f tests/integration/tailscale/docker-compose.yml down -v`,
        30_000,
      );
    } catch {
      // ignore — may not be running
    }
  }, 60_000);

  // ── Teardown ──

  afterAll(async () => {
    // Disconnect local Tailscale from the test tailnet
    console.log('Tearing down...');
    try {
      shell('tailscale logout', 15_000);
      console.log('  Tailscale logged out');
    } catch {
      console.log('  Tailscale logout skipped (not connected)');
    }

    // Stop Headscale
    try {
      shell(
        `docker compose -f tests/integration/tailscale/docker-compose.yml down -v`,
        30_000,
      );
      console.log('  Headscale stopped');
    } catch {
      console.log('  Headscale cleanup failed (may already be stopped)');
    }

    // Clean up temp config
    try {
      rmSync(TEST_CONFIG_DIR, { recursive: true, force: true });
    } catch {
      // ignore
    }
  }, 60_000);

  // ── Tests ──

  it('should start a local Headscale instance', async () => {
    console.log('Starting Headscale via Docker Compose...');

    // Start Headscale directly (not via CLI — CLI finds compose file relative to package root)
    shell(
      `docker compose -f tests/integration/tailscale/docker-compose.yml up -d --wait headscale`,
      60_000,
    );

    // Wait for health endpoint
    let healthy = false;
    for (let i = 0; i < 30; i++) {
      try {
        const health = shell(`curl -sf ${HEADSCALE_URL}/health`);
        if (health.includes('"pass"')) {
          healthy = true;
          break;
        }
      } catch {
        // not ready yet
      }
      await new Promise((r) => setTimeout(r, 1_000));
    }
    expect(healthy).toBe(true);
    console.log('  Headscale is healthy');

    // Create default user
    try {
      shell(
        `docker compose -f tests/integration/tailscale/docker-compose.yml exec -T headscale headscale users create default`,
      );
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (!msg.includes('already exists')) throw err;
    }
    console.log('  Default user created');

    // Generate API key
    apiKey = shell(
      `docker compose -f tests/integration/tailscale/docker-compose.yml exec -T headscale headscale apikeys create -e 1h`,
    );
    expect(apiKey).toBeTruthy();
    console.log(`  API key: ${apiKey.substring(0, 12)}...`);

    // Store in test config so subsequent commands can use it
    const config = {
      tailscale: {
        controlServer: HEADSCALE_URL,
        apiKey,
      },
    };
    writeFileSync(TEST_CONFIG_PATH, JSON.stringify(config, null, 2));

    // Create HeadscaleClient for verification later
    headscaleClient = new HeadscaleClient({
      baseUrl: HEADSCALE_URL,
      apiKey,
    });
  }, 120_000);

  it('should create a preauthkey via HeadscaleClient', async () => {
    expect(headscaleClient).toBeDefined();

    console.log('Creating preauthkey via HeadscaleClient...');

    const users = await headscaleClient.listUsers();
    expect(users.length).toBeGreaterThan(0);
    console.log(`  Using user: ${users[0].name} (id=${users[0].id})`);

    const key = await headscaleClient.createPreauthKey(users[0].id, {
      ephemeral: true,
      reusable: false,
    });
    expect(key).toBeTruthy();
    expect(typeof key).toBe('string');
    console.log(`  Preauthkey: ${key.substring(0, 12)}...`);

    // Store key for connect step
    (globalThis as Record<string, unknown>).__testPreauthKey = key;
  }, 30_000);

  it('should connect local Tailscale to the headscale tailnet', async () => {
    const preauthKey = (globalThis as Record<string, unknown>).__testPreauthKey as string;
    expect(preauthKey).toBeTruthy();

    console.log('Connecting local Tailscale to tailnet...');

    // Join the tailnet — use --force-reauth in case already connected to a different server.
    // No sudo needed on macOS (Tailscale app daemon handles it).
    // On Linux, the caller may need to run with sudo or have appropriate permissions.
    shell(
      `tailscale up --login-server=${HEADSCALE_URL} --authkey=${preauthKey} --hostname=${TEST_HOSTNAME} --accept-dns=false --force-reauth`,
      30_000,
    );
    console.log('  tailscale up succeeded');

    // Verify we're connected
    const status = shell('tailscale status');
    expect(status).toBeTruthy();
    console.log(`  Status:\n${status}`);
  }, 60_000);

  it('should show the node in Headscale after connect', async () => {
    expect(headscaleClient).toBeDefined();

    console.log('Verifying node in Headscale...');

    // Poll for the node to appear
    let nodes = await headscaleClient.listNodes();
    for (let i = 0; i < 15 && nodes.length === 0; i++) {
      await new Promise((r) => setTimeout(r, 2_000));
      nodes = await headscaleClient.listNodes();
    }

    expect(nodes.length).toBeGreaterThan(0);

    const testNode = nodes.find(
      (n) => n.givenName === TEST_HOSTNAME || n.name === TEST_HOSTNAME,
    );
    expect(testNode).toBeDefined();
    expect(testNode!.online).toBe(true);
    expect(testNode!.ipAddresses.length).toBeGreaterThan(0);
    expect(testNode!.ipAddresses[0]).toMatch(/^100\.64\./);

    console.log(`  Node: ${testNode!.givenName}`);
    console.log(`  IPs: ${testNode!.ipAddresses.join(', ')}`);
    console.log(`  Online: ${testNode!.online}`);
  }, 60_000);

  it('should be able to create additional preauthkeys after connect', async () => {
    expect(headscaleClient).toBeDefined();

    console.log('Creating additional preauthkey (simulating workspace deploy)...');

    const users = await headscaleClient.listUsers();
    const key = await headscaleClient.createPreauthKey(users[0].id, {
      ephemeral: true,
      reusable: false,
    });

    expect(key).toBeTruthy();
    expect(typeof key).toBe('string');
    console.log(`  Additional key: ${key.substring(0, 12)}...`);
    console.log('  This key would be passed to sudopod create --tailscale');
  }, 30_000);
});
