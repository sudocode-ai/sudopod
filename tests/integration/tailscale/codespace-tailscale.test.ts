/**
 * Integration test: Smoke-test tailscaled in a GitHub Codespace
 *
 * Proves that Tailscale can be installed and run inside a GitHub Codespace,
 * and that the codespace can join a Headscale tailnet via ngrok.
 *
 * This answers the open questions from the spec:
 * - Does the codespace have /dev/net/tun?
 * - Does tailscaled need --tun=userspace-networking?
 * - Do we need sudo?
 * - What's the minimum viable set of flags?
 *
 * Test Flow:
 * 1. Start Headscale + ngrok locally
 * 2. Create a codespace
 * 3. Install Tailscale in the codespace
 * 4. Start tailscaled (figure out what works)
 * 5. tailscale up to join the Headscale tailnet
 * 6. Verify node appears in Headscale
 * 7. Teardown
 *
 * Prerequisites:
 * - Docker running locally
 * - ngrok installed and authenticated
 * - gh CLI authenticated with codespace access
 * - RUN_INTEGRATION_TESTS=1
 *
 * @see i-2f19 - Smoke-test tailscaled in a GitHub Codespace
 * @see s-k316 - Codespaces Tailscale Integration
 */

import { describe, it, beforeAll, afterAll, expect } from 'vitest';
import { execSync } from 'node:child_process';
import path from 'node:path';
import { HeadscaleClient } from './headscale-client.js';
import { startNgrokTunnel, type NgrokTunnel } from './ngrok-tunnel.js';
import {
  createCodespace,
  deleteCodespace,
  getCodespace,
  execInCodespace,
} from '../../../src/provider/codespaces/cli.js';

if (!process.env.RUN_INTEGRATION_TESTS) {
  console.log(
    '\n  Skipping integration tests: RUN_INTEGRATION_TESTS not set',
  );
  console.log(
    '   To run: RUN_INTEGRATION_TESTS=1 npx vitest run tests/integration/tailscale/codespace-tailscale.test.ts --config vitest.integration.config.ts\n',
  );
  process.exit(0);
}

const COMPOSE_FILE = path.resolve('tests/integration/tailscale/docker-compose.yml');
const TEST_REPO = 'sudocode-ai/sudocode';
const TEST_BRANCH = 'main';
const TEST_MACHINE = 'basicLinux32gb';
const RETENTION_DAYS = 1;
const TEST_USER = 'test-codespace';
const TEST_HOSTNAME = 'sudopod-cs-smoke';

function shell(cmd: string, timeoutMs = 30_000): string {
  return execSync(cmd, { timeout: timeoutMs, encoding: 'utf-8' }).trim();
}

async function waitForCodespaceAvailable(
  name: string,
  timeoutMs = 180_000,
): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const cs = await getCodespace(name);
    if (cs?.state === 'Available') return;
    console.log(`  Codespace state: ${cs?.state ?? 'unknown'}`);
    await new Promise((r) => setTimeout(r, 5_000));
  }
  throw new Error(`Codespace ${name} did not become Available`);
}

describe('Codespace Tailscale Smoke Test (Integration)', () => {
  let headscale: HeadscaleClient;
  let ngrok: NgrokTunnel | null = null;
  let codespaceName: string | null = null;
  let preauthKey: string;

  // ── Setup: local infra + codespace ──

  beforeAll(async () => {
    // 1. Start Headscale
    console.log('Starting Headscale via Docker Compose...');
    shell(`docker compose -f ${COMPOSE_FILE} up -d`, 60_000);

    // Wait for health
    for (let i = 0; i < 30; i++) {
      try {
        const health = shell('curl -sf http://localhost:8080/health');
        if (health.includes('"pass"')) break;
      } catch {
        // not ready
      }
      await new Promise((r) => setTimeout(r, 1_000));
    }

    // 2. Create API key + user + preauthkey
    console.log('Setting up Headscale user + preauthkey...');
    const apiKey = shell(
      `docker compose -f ${COMPOSE_FILE} exec -T headscale headscale apikeys create -e 1h`,
    );
    headscale = new HeadscaleClient({
      baseUrl: 'http://localhost:8080',
      apiKey,
    });

    const user = await headscale.createUser(TEST_USER);
    preauthKey = await headscale.createPreauthKey(user.id);
    console.log(`  Preauthkey: ${preauthKey.substring(0, 12)}...`);

    // 3. Start ngrok
    console.log('Starting ngrok tunnel...');
    ngrok = await startNgrokTunnel(8080);
    console.log(`  ngrok URL: ${ngrok.url}`);

    // 4. Create codespace
    console.log(`Creating codespace in ${TEST_REPO}...`);
    codespaceName = await createCodespace(
      TEST_REPO,
      TEST_BRANCH,
      TEST_MACHINE,
      RETENTION_DAYS,
    );
    console.log(`  Created: ${codespaceName}`);

    // Wait for available
    console.log('Waiting for codespace to be available...');
    await waitForCodespaceAvailable(codespaceName);
    console.log('  Codespace is available');
  }, 600_000); // 10 min — docker + ngrok + codespace creation

  // ── Teardown ──

  afterAll(async () => {
    console.log('Tearing down...');

    // Delete codespace
    if (codespaceName) {
      try {
        await deleteCodespace(codespaceName);
        console.log(`  Deleted codespace: ${codespaceName}`);
      } catch (err) {
        console.log(`  Failed to delete codespace: ${err}`);
      }
    }

    // Stop ngrok
    if (ngrok) {
      ngrok.stop();
      console.log('  ngrok stopped');
    }

    // Stop Headscale
    shell(`docker compose -f ${COMPOSE_FILE} down -v`, 30_000);
    console.log('  Docker Compose stopped');
  }, 120_000);

  // ── Tests ──

  it('should install Tailscale in the codespace', async () => {
    console.log('Installing Tailscale...');

    // The standard install.sh can fail because codespace images ship with a
    // broken yarn apt repo (expired GPG key). Work around it by removing
    // the broken repo first, then running the install script.
    const installCmd = [
      // Remove broken third-party apt repos that block apt-get update
      'sudo rm -f /etc/apt/sources.list.d/yarn.list',
      'curl -fsSL https://tailscale.com/install.sh | sh',
    ].join(' && ');

    const result = await execInCodespace(
      codespaceName!,
      installCmd,
      { timeout: 120_000 },
    );

    console.log(`  Exit code: ${result.exitCode}`);
    if (result.stderr) console.log(`  stderr: ${result.stderr}`);

    expect(result.exitCode).toBe(0);

    // Verify the binary exists
    const which = await execInCodespace(codespaceName!, 'which tailscale');
    expect(which.exitCode).toBe(0);
    console.log(`  tailscale binary: ${which.stdout.trim()}`);
  }, 180_000);

  it('should start tailscaled in the codespace', async () => {
    console.log('Starting tailscaled...');

    // Check if /dev/net/tun exists — this determines our approach
    const tunCheck = await execInCodespace(
      codespaceName!,
      '[ -e /dev/net/tun ] && echo "tun-exists" || echo "no-tun"',
    );
    const hasTun = tunCheck.stdout.trim() === 'tun-exists';
    console.log(`  /dev/net/tun: ${hasTun ? 'exists' : 'missing'}`);

    // Start tailscaled — try kernel mode first, fall back to userspace
    const tailscaledFlags = [
      '--state=/var/lib/tailscale/tailscaled.state',
      '--socket=/var/run/tailscale/tailscaled.sock',
    ];
    if (!hasTun) {
      tailscaledFlags.push('--tun=userspace-networking');
    }

    // Create state directories and start daemon in background
    const startCmd = [
      'sudo mkdir -p /var/lib/tailscale /var/run/tailscale',
      `sudo tailscaled ${tailscaledFlags.join(' ')} &`,
      'sleep 3',
      // Verify daemon is running
      'pgrep tailscaled > /dev/null && echo "daemon-running" || echo "daemon-failed"',
    ].join(' && ');

    const startResult = await execInCodespace(codespaceName!, startCmd, {
      timeout: 30_000,
    });

    console.log(`  stdout: ${startResult.stdout.trim()}`);
    if (startResult.stderr) console.log(`  stderr: ${startResult.stderr}`);

    expect(startResult.stdout).toContain('daemon-running');
  }, 60_000);

  it('should join the Headscale tailnet', async () => {
    const ngrokUrl = ngrok!.url;
    console.log(`Joining tailnet via ${ngrokUrl}...`);

    const joinCmd = `sudo tailscale up --authkey=${preauthKey} --login-server=${ngrokUrl} --hostname=${TEST_HOSTNAME} --accept-dns=false`;

    const result = await execInCodespace(codespaceName!, joinCmd, {
      timeout: 30_000,
    });

    console.log(`  Exit code: ${result.exitCode}`);
    if (result.stderr) console.log(`  stderr: ${result.stderr}`);

    expect(result.exitCode).toBe(0);
  }, 60_000);

  it('should show the codespace node in Headscale', async () => {
    console.log('Checking Headscale for codespace node...');

    // Poll for the node to appear
    let nodes = await headscale.listNodes();
    for (let i = 0; i < 15 && !nodes.some((n) => n.givenName === TEST_HOSTNAME || n.name === TEST_HOSTNAME); i++) {
      await new Promise((r) => setTimeout(r, 2_000));
      nodes = await headscale.listNodes();
    }

    const csNode = nodes.find(
      (n) => n.givenName === TEST_HOSTNAME || n.name === TEST_HOSTNAME,
    );

    expect(csNode).toBeDefined();
    expect(csNode!.online).toBe(true);
    expect(csNode!.ipAddresses.length).toBeGreaterThan(0);
    expect(csNode!.ipAddresses[0]).toMatch(/^100\.64\./);

    console.log(`  Node: ${csNode!.givenName}`);
    console.log(`  IPs: ${csNode!.ipAddresses.join(', ')}`);
    console.log(`  Online: ${csNode!.online}`);
  }, 60_000);

  it('should show connected status from inside the codespace', async () => {
    console.log('Checking tailscale status from codespace...');

    const result = await execInCodespace(
      codespaceName!,
      'tailscale status --json',
      { timeout: 15_000 },
    );

    expect(result.exitCode).toBe(0);

    const status = JSON.parse(result.stdout);
    expect(status.Self).toBeDefined();
    expect(status.Self.DNSName).toBeTruthy();
    expect(status.Self.TailscaleIPs).toBeDefined();
    expect(status.Self.TailscaleIPs.length).toBeGreaterThan(0);

    console.log(`  DNS Name: ${status.Self.DNSName}`);
    console.log(`  IPs: ${status.Self.TailscaleIPs.join(', ')}`);
    console.log(`  Online: ${status.Self.Online}`);
  }, 30_000);
});
