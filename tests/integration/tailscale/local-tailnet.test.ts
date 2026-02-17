/**
 * Integration test: Local Tailscale node join via Headscale + ngrok
 *
 * Validates Phase 1 of the Tailscale integration test scaffold:
 * a local Tailscale client can join a Headscale tailnet through an
 * ngrok tunnel. No codespace involvement — purely local validation
 * of the control plane.
 *
 * Test Flow:
 * 1. Start Headscale via Docker Compose
 * 2. Create API key + user + preauthkey via Headscale client
 * 3. Start ngrok tunnel to Headscale
 * 4. Join local Tailscale to the tailnet via the ngrok URL
 * 5. Verify the node appears in Headscale
 * 6. Teardown: tailscale logout, stop ngrok, docker compose down
 *
 * Prerequisites:
 * - Docker running
 * - ngrok installed and authenticated
 * - Tailscale client installed locally
 * - RUN_INTEGRATION_TESTS=1
 *
 * @see i-4890 - Local Tailscale node join + connectivity integration test
 * @see s-k316 - Codespaces Tailscale Integration
 */

import { describe, it, beforeAll, afterAll, expect } from 'vitest';
import { execSync } from 'node:child_process';
import path from 'node:path';
import { HeadscaleClient } from './headscale-client.js';
import { startNgrokTunnel, type NgrokTunnel } from './ngrok-tunnel.js';

if (!process.env.RUN_INTEGRATION_TESTS) {
  console.log(
    '\n  Skipping integration tests: RUN_INTEGRATION_TESTS not set',
  );
  console.log(
    '   To run: RUN_INTEGRATION_TESTS=1 npx vitest run tests/integration/tailscale/local-tailnet.test.ts --config vitest.integration.config.ts\n',
  );
  process.exit(0);
}

const COMPOSE_FILE = path.resolve('tests/integration/tailscale/docker-compose.yml');
const TEST_USER = 'test-local';
const TEST_HOSTNAME = 'sudopod-test-local';

function shell(cmd: string, timeoutMs = 30_000): string {
  return execSync(cmd, { timeout: timeoutMs, encoding: 'utf-8' }).trim();
}

describe('Local Tailnet Join (Integration)', () => {
  let headscale: HeadscaleClient;
  let ngrok: NgrokTunnel | null = null;
  let userId: string;
  let preauthKey: string;

  // ── Setup ──

  beforeAll(async () => {
    // 1. Start Headscale
    console.log('Starting Headscale via Docker Compose...');
    shell(`docker compose -f ${COMPOSE_FILE} up -d`, 60_000);

    // Wait for Headscale health
    console.log('Waiting for Headscale to be healthy...');
    for (let i = 0; i < 30; i++) {
      try {
        const health = shell('curl -sf http://localhost:8080/health');
        if (health.includes('"pass"')) break;
      } catch {
        // not ready yet
      }
      await new Promise((r) => setTimeout(r, 1_000));
    }

    // 2. Create API key via CLI (no REST API key exists yet)
    console.log('Creating Headscale API key...');
    const apiKey = shell(
      `docker compose -f ${COMPOSE_FILE} exec -T headscale headscale apikeys create -e 1h`,
    );
    console.log(`  API key prefix: ${apiKey.split('.')[0]}...`);

    headscale = new HeadscaleClient({
      baseUrl: 'http://localhost:8080',
      apiKey,
    });

    // 3. Create user + preauthkey via REST API
    console.log('Creating user and preauthkey...');
    const user = await headscale.createUser(TEST_USER);
    userId = user.id;
    preauthKey = await headscale.createPreauthKey(userId);
    console.log(`  User: ${TEST_USER} (id=${userId})`);
    console.log(`  Preauthkey: ${preauthKey.substring(0, 12)}...`);

    // 4. Start ngrok tunnel
    console.log('Starting ngrok tunnel...');
    ngrok = await startNgrokTunnel(8080);
    console.log(`  ngrok URL: ${ngrok.url}`);
  }, 120_000);

  // ── Teardown ──

  afterAll(async () => {
    // Disconnect local Tailscale from the test tailnet
    console.log('Tearing down...');
    try {
      shell('sudo tailscale logout', 15_000);
      console.log('  Tailscale logged out');
    } catch {
      console.log('  Tailscale logout skipped (not connected)');
    }

    // Stop ngrok
    if (ngrok) {
      ngrok.stop();
      console.log('  ngrok stopped');
    }

    // Stop Headscale
    shell(`docker compose -f ${COMPOSE_FILE} down -v`, 30_000);
    console.log('  Docker Compose stopped');
  }, 60_000);

  // ── Tests ──

  it('should join local Tailscale to Headscale via ngrok', async () => {
    expect(ngrok).not.toBeNull();
    const ngrokUrl = ngrok!.url;

    console.log(`Joining tailnet via ${ngrokUrl}...`);

    // Join the tailnet — needs sudo on macOS/Linux
    shell(
      `sudo tailscale up --login-server=${ngrokUrl} --authkey=${preauthKey} --hostname=${TEST_HOSTNAME} --accept-dns=false`,
      30_000,
    );

    console.log('  tailscale up succeeded');
  }, 60_000);

  it('should show the local node as connected in Headscale', async () => {
    console.log('Checking Headscale node list...');

    // Poll for the node to appear (may take a moment after join)
    let nodes = await headscale.listNodes();
    for (let i = 0; i < 10 && nodes.length === 0; i++) {
      await new Promise((r) => setTimeout(r, 2_000));
      nodes = await headscale.listNodes();
    }

    expect(nodes.length).toBeGreaterThan(0);

    const localNode = nodes.find(
      (n) =>
        n.givenName === TEST_HOSTNAME || n.name === TEST_HOSTNAME,
    );
    expect(localNode).toBeDefined();
    expect(localNode!.online).toBe(true);
    expect(localNode!.ipAddresses.length).toBeGreaterThan(0);
    expect(localNode!.ipAddresses[0]).toMatch(/^100\.64\./);

    console.log(`  Node: ${localNode!.givenName}`);
    console.log(`  IPs: ${localNode!.ipAddresses.join(', ')}`);
    console.log(`  Online: ${localNode!.online}`);
  }, 60_000);

  it('should show connected status via tailscale CLI', () => {
    console.log('Checking tailscale status...');

    const status = shell('tailscale status');

    expect(status).toBeTruthy();
    // Status output should contain our hostname
    console.log(`  Status:\n${status}`);
  }, 15_000);
});
