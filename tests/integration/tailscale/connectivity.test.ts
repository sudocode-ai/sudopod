/**
 * Integration test: Cross-node connectivity via Tailscale
 *
 * Validates end-to-end connectivity between a Docker Tailscale container
 * (local side) and a GitHub Codespace (remote side), both joined to a
 * Headscale tailnet via ngrok.
 *
 * This is Phase 3 of the Tailscale integration test scaffold. It proves
 * that traffic actually flows between nodes over the Tailscale mesh.
 *
 * Test Flow:
 * 1. Start Headscale via Docker Compose
 * 2. Create API key, user, and two preauthkeys
 * 3. Start ngrok tunnel to Headscale
 * 4. Start Docker Tailscale container (joins tailnet via preauthkey)
 * 5. Create a codespace, install Tailscale, join the tailnet
 * 6. Start a simple HTTP server on the codespace (:9999)
 * 7. From the Docker container, curl the codespace's Tailscale IP
 * 8. Assert the response matches
 * 9. Teardown: delete codespace, docker compose down
 *
 * Prerequisites:
 * - Docker running locally
 * - ngrok installed and authenticated
 * - gh CLI authenticated with codespace access
 * - RUN_INTEGRATION_TESTS=1
 *
 * @see i-7oq8 - Docker Tailscale container for cross-node connectivity test
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
    '   To run: RUN_INTEGRATION_TESTS=1 npx vitest run tests/integration/tailscale/connectivity.test.ts --config vitest.integration.config.ts\n',
  );
  process.exit(0);
}

const COMPOSE_FILE = path.resolve(
  'tests/integration/tailscale/docker-compose.yml',
);
const TEST_REPO = 'sudocode-ai/sudocode';
const TEST_BRANCH = 'main';
const TEST_MACHINE = 'basicLinux32gb';
const RETENTION_DAYS = 1;
const TEST_USER = 'test-connectivity';
const DOCKER_HOSTNAME = 'docker-local';
const CODESPACE_HOSTNAME = 'sudopod-cs-conn';
const TEST_PORT = 9999;
const TEST_CONTENT = 'hello-from-tailscale';

function shell(cmd: string, opts?: { timeout?: number; env?: Record<string, string> }): string {
  return execSync(cmd, {
    timeout: opts?.timeout ?? 30_000,
    encoding: 'utf-8',
    env: opts?.env ? { ...process.env, ...opts.env } : undefined,
  }).trim();
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

describe('Cross-Node Connectivity (Integration)', () => {
  let headscale: HeadscaleClient;
  let ngrok: NgrokTunnel | null = null;
  let codespaceName: string | null = null;
  let codespaceIp: string;

  // ── Setup: Headscale + ngrok + Docker Tailscale + codespace ──

  beforeAll(async () => {
    // 1. Start Headscale
    console.log('Starting Headscale via Docker Compose...');
    shell(`docker compose -f ${COMPOSE_FILE} up -d headscale`, { timeout: 60_000 });

    // Wait for health
    console.log('Waiting for Headscale to be healthy...');
    for (let i = 0; i < 30; i++) {
      try {
        const health = shell('curl -sf http://localhost:8080/health');
        if (health.includes('"pass"')) break;
      } catch {
        // not ready
      }
      await new Promise((r) => setTimeout(r, 1_000));
    }

    // 2. Create API key + user + two preauthkeys
    console.log('Setting up Headscale user + preauthkeys...');
    const apiKey = shell(
      `docker compose -f ${COMPOSE_FILE} exec -T headscale headscale apikeys create -e 1h`,
    );
    headscale = new HeadscaleClient({
      baseUrl: 'http://localhost:8080',
      apiKey,
    });

    const user = await headscale.createUser(TEST_USER);
    const dockerPreauthKey = await headscale.createPreauthKey(user.id);
    const codespacePreauthKey = await headscale.createPreauthKey(user.id);
    console.log(`  Docker preauthkey: ${dockerPreauthKey.substring(0, 12)}...`);
    console.log(`  Codespace preauthkey: ${codespacePreauthKey.substring(0, 12)}...`);

    // 3. Start ngrok tunnel
    console.log('Starting ngrok tunnel...');
    ngrok = await startNgrokTunnel(8080);
    console.log(`  ngrok URL: ${ngrok.url}`);

    // 4. Start Docker Tailscale container
    console.log('Starting Docker Tailscale container...');
    shell(
      `docker compose -f ${COMPOSE_FILE} --profile connectivity up -d tailscale-client`,
      {
        timeout: 60_000,
        env: {
          TS_AUTHKEY: dockerPreauthKey,
          TS_LOGIN_SERVER: ngrok.url,
        },
      },
    );

    // Wait for the Docker Tailscale container to join the tailnet
    console.log('Waiting for Docker Tailscale to join tailnet...');
    for (let i = 0; i < 30; i++) {
      const nodes = await headscale.listNodes();
      const dockerNode = nodes.find(
        (n) => n.givenName === DOCKER_HOSTNAME || n.name === DOCKER_HOSTNAME,
      );
      if (dockerNode?.online) {
        console.log(`  Docker node online: ${dockerNode.ipAddresses[0]}`);
        break;
      }
      await new Promise((r) => setTimeout(r, 2_000));
    }

    // 5. Create codespace
    console.log(`Creating codespace in ${TEST_REPO}...`);
    codespaceName = await createCodespace(
      TEST_REPO,
      TEST_BRANCH,
      TEST_MACHINE,
      RETENTION_DAYS,
    );
    console.log(`  Created: ${codespaceName}`);

    await waitForCodespaceAvailable(codespaceName);
    console.log('  Codespace is available');

    // 6. Install Tailscale in the codespace
    console.log('Installing Tailscale in codespace...');
    const installCmd = [
      'sudo rm -f /etc/apt/sources.list.d/yarn.list',
      'curl -fsSL https://tailscale.com/install.sh | sh',
    ].join(' && ');

    const installResult = await execInCodespace(codespaceName, installCmd, {
      timeout: 120_000,
    });
    if (installResult.exitCode !== 0) {
      throw new Error(
        `Tailscale install failed: ${installResult.stderr}`,
      );
    }
    console.log('  Tailscale installed');

    // 7. Start tailscaled
    console.log('Starting tailscaled in codespace...');
    const daemonCmd = [
      'sudo mkdir -p /var/lib/tailscale /var/run/tailscale',
      'sudo tailscaled --state=/var/lib/tailscale/tailscaled.state --socket=/var/run/tailscale/tailscaled.sock &',
      'sleep 3',
      'pgrep tailscaled > /dev/null && echo "daemon-running" || echo "daemon-failed"',
    ].join(' && ');

    const daemonResult = await execInCodespace(codespaceName, daemonCmd, {
      timeout: 30_000,
    });
    if (!daemonResult.stdout.includes('daemon-running')) {
      throw new Error(
        `tailscaled failed to start: ${daemonResult.stdout} ${daemonResult.stderr}`,
      );
    }
    console.log('  tailscaled running');

    // 8. Join the tailnet
    console.log('Joining codespace to tailnet...');
    const joinCmd = `sudo tailscale up --authkey=${codespacePreauthKey} --login-server=${ngrok.url} --hostname=${CODESPACE_HOSTNAME} --accept-dns=false`;
    const joinResult = await execInCodespace(codespaceName, joinCmd, {
      timeout: 30_000,
    });
    if (joinResult.exitCode !== 0) {
      throw new Error(
        `tailscale up failed: ${joinResult.stderr}`,
      );
    }
    console.log('  Joined tailnet');

    // 9. Get codespace Tailscale IP from Headscale
    console.log('Looking up codespace Tailscale IP...');
    for (let i = 0; i < 15; i++) {
      const nodes = await headscale.listNodes();
      const csNode = nodes.find(
        (n) =>
          n.givenName === CODESPACE_HOSTNAME ||
          n.name === CODESPACE_HOSTNAME,
      );
      if (csNode?.online && csNode.ipAddresses.length > 0) {
        codespaceIp = csNode.ipAddresses[0];
        console.log(`  Codespace Tailscale IP: ${codespaceIp}`);
        break;
      }
      await new Promise((r) => setTimeout(r, 2_000));
    }

    if (!codespaceIp) {
      throw new Error('Codespace node did not appear in Headscale');
    }

    // 10. Start test HTTP server on codespace
    console.log('Starting test HTTP server on codespace...');
    const serverCmd = [
      `mkdir -p /tmp/test-server`,
      `echo '${TEST_CONTENT}' > /tmp/test-server/test.html`,
      `cd /tmp/test-server && nohup python3 -m http.server ${TEST_PORT} > /dev/null 2>&1`,
    ].join(' && ');

    await execInCodespace(codespaceName, serverCmd, { background: true });

    // Wait for the server to be listening
    await new Promise((r) => setTimeout(r, 3_000));

    // Verify locally within the codespace first
    const localCheck = await execInCodespace(
      codespaceName,
      `curl -sf http://localhost:${TEST_PORT}/test.html`,
      { timeout: 10_000 },
    );
    if (!localCheck.stdout.includes(TEST_CONTENT)) {
      throw new Error(
        `Test server not responding locally: ${localCheck.stdout} ${localCheck.stderr}`,
      );
    }
    console.log('  Test server running on codespace');
  }, 600_000); // 10 min — Docker + ngrok + codespace + install

  // ── Teardown ──

  afterAll(async () => {
    console.log('Tearing down...');

    if (codespaceName) {
      try {
        await deleteCodespace(codespaceName);
        console.log(`  Deleted codespace: ${codespaceName}`);
      } catch (err) {
        console.log(`  Failed to delete codespace: ${err}`);
      }
    }

    if (ngrok) {
      ngrok.stop();
      console.log('  ngrok stopped');
    }

    shell(
      `docker compose -f ${COMPOSE_FILE} --profile connectivity down -v`,
      { timeout: 30_000 },
    );
    console.log('  Docker Compose stopped');
  }, 120_000);

  // ── Tests ──

  it('should show both nodes in Headscale', async () => {
    const nodes = await headscale.listNodes();
    console.log(`  Total nodes: ${nodes.length}`);
    for (const n of nodes) {
      console.log(`    ${n.givenName}: ${n.ipAddresses.join(', ')} (online=${n.online})`);
    }

    const dockerNode = nodes.find(
      (n) => n.givenName === DOCKER_HOSTNAME || n.name === DOCKER_HOSTNAME,
    );
    const csNode = nodes.find(
      (n) =>
        n.givenName === CODESPACE_HOSTNAME || n.name === CODESPACE_HOSTNAME,
    );

    expect(dockerNode).toBeDefined();
    expect(dockerNode!.online).toBe(true);
    expect(csNode).toBeDefined();
    expect(csNode!.online).toBe(true);
  }, 30_000);

  it('should reach the codespace HTTP server from the Docker container via Tailscale IP', async () => {
    console.log(
      `Fetching http://${codespaceIp}:${TEST_PORT}/test.html from Docker container...`,
    );

    // Ping first to establish the DERP relay connection between peers.
    // Without this, the first wget may fail with "connection refused" because
    // the relay hasn't been set up yet.
    try {
      const ping = shell(
        `docker exec tailscale-client tailscale ping -c 3 ${codespaceIp}`,
        { timeout: 30_000 },
      );
      console.log(`  Ping: ${ping.split('\n')[0]}`);
    } catch {
      console.log('  Ping failed, continuing with wget retries...');
    }

    // The tailscale/tailscale image is Alpine-based — no curl, but wget is available.
    // Retry a few times — DERP relay establishment can take a moment.
    let output = '';
    for (let attempt = 0; attempt < 10; attempt++) {
      try {
        output = shell(
          `docker exec tailscale-client wget -qO- --timeout=10 http://${codespaceIp}:${TEST_PORT}/test.html`,
          { timeout: 20_000 },
        );
        if (output.includes(TEST_CONTENT)) break;
      } catch {
        console.log(`  Attempt ${attempt + 1} failed, retrying...`);
      }
      await new Promise((r) => setTimeout(r, 5_000));
    }

    console.log(`  Response: ${output}`);
    expect(output).toContain(TEST_CONTENT);
  }, 120_000);

  it('should also reach the Docker container from the codespace', async () => {
    // Get the Docker container's Tailscale IP
    const nodes = await headscale.listNodes();
    const dockerNode = nodes.find(
      (n) => n.givenName === DOCKER_HOSTNAME || n.name === DOCKER_HOSTNAME,
    );
    expect(dockerNode).toBeDefined();

    const dockerIp = dockerNode!.ipAddresses[0];
    console.log(`  Docker Tailscale IP: ${dockerIp}`);

    // Start a one-shot HTTP server in the Docker container using nc (BusyBox).
    // This writes a pre-baked HTTP response and listens for exactly one connection.
    const responseBody = `${TEST_CONTENT}-docker`;
    const ncCmd = [
      `sh -c "printf 'HTTP/1.1 200 OK\\r\\nContent-Length: ${responseBody.length}\\r\\n\\r\\n${responseBody}'`,
      `| nc -l -p 8888"`,
    ].join(' ');

    shell(`docker exec -d tailscale-client ${ncCmd}`, { timeout: 10_000 });
    await new Promise((r) => setTimeout(r, 2_000));

    // Curl from codespace to Docker container via Tailscale IP
    let output = '';
    for (let attempt = 0; attempt < 10; attempt++) {
      const result = await execInCodespace(
        codespaceName!,
        `curl -sf --max-time 10 http://${dockerIp}:8888/`,
        { timeout: 20_000 },
      );
      output = result.stdout;
      if (output.includes(`${TEST_CONTENT}-docker`)) break;
      console.log(`  Attempt ${attempt + 1} failed, retrying...`);

      // Re-start nc since it's one-shot
      try {
        shell(`docker exec -d tailscale-client ${ncCmd}`, { timeout: 10_000 });
      } catch {
        // ignore — nc may still be running
      }
      await new Promise((r) => setTimeout(r, 5_000));
    }

    console.log(`  Response: ${output}`);
    expect(output).toContain(`${TEST_CONTENT}-docker`);
  }, 120_000);
});
