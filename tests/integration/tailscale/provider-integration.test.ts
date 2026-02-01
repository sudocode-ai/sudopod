/**
 * Integration test: Provider-driven Tailscale setup + bidirectional connectivity
 *
 * Validates the actual production code path for Tailscale in codespaces:
 * - installSudocode() installs the sudocode CLI and server
 * - setupTailscale() installs Tailscale and joins the tailnet
 * - sudocode server starts and its /health endpoint is reachable via Tailscale IP
 *
 * This exercises the full provider setup flow, not manual shell commands.
 * The key validation: a local Docker Tailscale container can reach the
 * sudocode server running in the codespace over the Tailscale mesh, and
 * the codespace can reach back to the Docker container.
 *
 * Prerequisites:
 * - Docker running locally
 * - ngrok installed and authenticated
 * - gh CLI authenticated with codespace access
 * - RUN_INTEGRATION_TESTS=1
 *
 * @see i-2m9s - End-to-end Tailscale setup via provider + bidirectional connectivity test
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
import {
  installSudocode,
  setupTailscale,
} from '../../../src/provider/codespaces/setup.js';

if (!process.env.RUN_INTEGRATION_TESTS) {
  console.log(
    '\n  Skipping integration tests: RUN_INTEGRATION_TESTS not set',
  );
  console.log(
    '   To run: RUN_INTEGRATION_TESTS=1 npx vitest run tests/integration/tailscale/provider-integration.test.ts --config vitest.integration.tailscale.config.ts\n',
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
const TEST_USER = `test-e2e-${Date.now()}`;
const DOCKER_HOSTNAME = 'docker-local';
const SUDOCODE_PORT = 3000;

function shell(
  cmd: string,
  opts?: { timeout?: number; env?: Record<string, string> },
): string {
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

describe('Provider E2E: setupTailscale + Bidirectional Connectivity', () => {
  let headscale: HeadscaleClient;
  let ngrok: NgrokTunnel | null = null;
  let codespaceName: string | null = null;
  let codespaceIp: string;
  let dockerIp: string;
  let csNodeName: string;

  // ── Setup ──

  beforeAll(async () => {
    // 1. Clean slate + start Headscale
    console.log('Cleaning up any leftover Docker state...');
    try {
      shell(
        `docker compose -f ${COMPOSE_FILE} --profile connectivity down -v`,
        { timeout: 30_000 },
      );
    } catch {
      // nothing to clean — fine
    }
    await new Promise((r) => setTimeout(r, 2_000));

    console.log('Starting Headscale via Docker Compose...');
    shell(`docker compose -f ${COMPOSE_FILE} up -d headscale`, {
      timeout: 60_000,
    });

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
    //    Retry: HTTP /health may return OK before gRPC socket is ready for CLI
    console.log('Setting up Headscale user + preauthkeys...');
    let apiKey = '';
    for (let i = 0; i < 10; i++) {
      try {
        apiKey = shell(
          `docker compose -f ${COMPOSE_FILE} exec -T headscale headscale apikeys create -e 1h`,
          { timeout: 15_000 },
        );
        if (apiKey) break;
      } catch {
        console.log(`  API key attempt ${i + 1} failed, retrying...`);
        await new Promise((r) => setTimeout(r, 3_000));
      }
    }
    if (!apiKey) {
      throw new Error('Failed to create Headscale API key after retries');
    }
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

    console.log('Waiting for Docker Tailscale to join tailnet...');
    for (let i = 0; i < 30; i++) {
      const nodes = await headscale.listNodes();
      const dockerNode = nodes.find(
        (n) => n.givenName === DOCKER_HOSTNAME || n.name === DOCKER_HOSTNAME,
      );
      if (dockerNode?.online) {
        dockerIp = dockerNode.ipAddresses[0];
        console.log(`  Docker node online: ${dockerIp}`);
        break;
      }
      await new Promise((r) => setTimeout(r, 2_000));
    }
    if (!dockerIp) {
      throw new Error('Docker Tailscale node did not appear in Headscale');
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

    // 6. Install sudocode — production code path
    console.log('Running installSudocode()...');
    await installSudocode(codespaceName, execInCodespace);
    console.log('  sudocode installed');

    // 7. Setup Tailscale — production code path
    console.log('Running setupTailscale()...');
    const tsResult = await setupTailscale(codespaceName, execInCodespace, {
      authKey: codespacePreauthKey,
      controlServer: ngrok.url,
    });
    console.log(`  tier=${tsResult.tier}, hostname=${tsResult.hostname}`);

    // 8. Lookup codespace Tailscale IP
    console.log('Looking up codespace Tailscale IP...');
    const tsHostname = tsResult.hostname;
    for (let i = 0; i < 15; i++) {
      const nodes = await headscale.listNodes();
      const csNode =
        nodes.find((n) => n.givenName === tsHostname || n.name === tsHostname) ??
        nodes.find((n) => n.givenName !== DOCKER_HOSTNAME && n.name !== DOCKER_HOSTNAME);
      if (csNode?.online && csNode.ipAddresses.length > 0) {
        codespaceIp = csNode.ipAddresses[0];
        csNodeName = csNode.givenName;
        console.log(`  Codespace node: ${csNodeName} (${codespaceIp})`);
        break;
      }
      await new Promise((r) => setTimeout(r, 2_000));
    }
    if (!codespaceIp) {
      throw new Error('Codespace node did not appear in Headscale');
    }

    // 9. Start sudocode server — mirrors applyRuntimeConfig
    //    Must source nvm to get Node 20 (default codespace image has Node 16)
    console.log('Starting sudocode server...');
    const nvmPrefix = 'export NVM_DIR="$HOME/.nvm"; [ -s "$NVM_DIR/nvm.sh" ] && . "$NVM_DIR/nvm.sh"; nvm use 20 2>/dev/null;';
    await execInCodespace(
      codespaceName,
      `${nvmPrefix} nohup sudocode server --port ${SUDOCODE_PORT} > /tmp/sudocode-${SUDOCODE_PORT}.log 2>&1`,
      { background: true },
    );

    console.log('  Waiting for sudocode server /health...');
    let serverReady = false;
    for (let i = 0; i < 20; i++) {
      await new Promise((r) => setTimeout(r, 3_000));
      const check = await execInCodespace(
        codespaceName,
        `curl -sf --max-time 2 http://localhost:${SUDOCODE_PORT}/health`,
        { timeout: 10_000 },
      );
      if (check.exitCode === 0 && check.stdout.includes('"ok"')) {
        serverReady = true;
        break;
      }
      console.log(`  Not ready yet (attempt ${i + 1})...`);
    }
    if (!serverReady) {
      const debug = await execInCodespace(
        codespaceName,
        `pgrep -a sudocode; ss -tlnp | grep ${SUDOCODE_PORT}; echo "---"; tail -30 /tmp/sudocode-${SUDOCODE_PORT}.log`,
        { timeout: 10_000 },
      );
      throw new Error(`Sudocode server not responding.\n${debug.stdout}\n${debug.stderr}`);
    }
    console.log('  sudocode server healthy');
  }, 600_000);

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

  it('setupTailscale() should join the codespace to the tailnet', async () => {
    const nodes = await headscale.listNodes();
    const csNode = nodes.find(
      (n) => n.givenName === csNodeName || n.name === csNodeName,
    );
    expect(csNode).toBeDefined();
    expect(csNode!.online).toBe(true);
    expect(csNode!.ipAddresses.length).toBeGreaterThan(0);
  }, 30_000);

  it('should show both nodes online in Headscale', async () => {
    const nodes = await headscale.listNodes();
    console.log(`  Total nodes: ${nodes.length}`);
    for (const n of nodes) {
      console.log(`    ${n.givenName}: ${n.ipAddresses.join(', ')} (online=${n.online})`);
    }

    const dockerNode = nodes.find(
      (n) => n.givenName === DOCKER_HOSTNAME || n.name === DOCKER_HOSTNAME,
    );
    const csNode = nodes.find(
      (n) => n.givenName === csNodeName || n.name === csNodeName,
    );

    expect(dockerNode).toBeDefined();
    expect(dockerNode!.online).toBe(true);
    expect(csNode).toBeDefined();
    expect(csNode!.online).toBe(true);
  }, 30_000);

  it('local→codespace: Docker container reaches sudocode /health via Tailscale IP', async () => {
    console.log(
      `  Fetching http://${codespaceIp}:${SUDOCODE_PORT}/health from Docker container...`,
    );

    // Warm up DERP relay
    try {
      shell(
        `docker exec tailscale-client tailscale ping -c 3 ${codespaceIp}`,
        { timeout: 30_000 },
      );
    } catch {
      console.log('  Ping exited non-zero (expected for DERP), continuing...');
    }

    // Alpine image: wget not curl. Retry for DERP relay warmup.
    let output = '';
    for (let attempt = 0; attempt < 10; attempt++) {
      try {
        output = shell(
          `docker exec tailscale-client wget -qO- --timeout=10 http://${codespaceIp}:${SUDOCODE_PORT}/health`,
          { timeout: 20_000 },
        );
        if (output.includes('"ok"')) break;
      } catch {
        console.log(`  Attempt ${attempt + 1} failed, retrying...`);
      }
      await new Promise((r) => setTimeout(r, 5_000));
    }

    console.log(`  Response: ${output.substring(0, 200)}`);
    const health = JSON.parse(output);
    expect(health.status).toBe('ok');
    expect(health.uptime).toBeGreaterThan(0);
  }, 120_000);

  it('codespace→local: codespace reaches Docker container via Tailscale IP', async () => {
    console.log(`  Reaching Docker container at ${dockerIp}:8888 from codespace...`);

    // One-shot HTTP server in Docker via BusyBox nc
    const responseBody = 'hello-from-docker';
    const ncCmd = [
      `sh -c "printf 'HTTP/1.1 200 OK\\r\\nContent-Length: ${responseBody.length}\\r\\n\\r\\n${responseBody}'`,
      `| nc -l -p 8888"`,
    ].join(' ');

    shell(`docker exec -d tailscale-client ${ncCmd}`, { timeout: 10_000 });
    await new Promise((r) => setTimeout(r, 2_000));

    let output = '';
    for (let attempt = 0; attempt < 10; attempt++) {
      const result = await execInCodespace(
        codespaceName!,
        `curl -sf --max-time 10 http://${dockerIp}:8888/`,
        { timeout: 20_000 },
      );
      output = result.stdout;
      if (output.includes(responseBody)) break;
      console.log(`  Attempt ${attempt + 1} failed, retrying...`);

      // Re-start nc since it's one-shot
      try {
        shell(`docker exec -d tailscale-client ${ncCmd}`, { timeout: 10_000 });
      } catch {
        // nc may still be running
      }
      await new Promise((r) => setTimeout(r, 5_000));
    }

    console.log(`  Response: ${output}`);
    expect(output).toContain(responseBody);
  }, 120_000);
});
