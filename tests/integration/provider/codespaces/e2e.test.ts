/**
 * Codespaces Provider E2E Test
 *
 * End-to-end validation of the codespaces provider through the top-level
 * Provider API — the same interface a real consumer uses:
 *
 * 1. provider.create() with setup.tailscale — provisions codespace, installs
 *    sudocode, sets up Tailscale, starts server, forwards port
 * 2. Verify bidirectional connectivity over Tailscale mesh
 * 3. provider.stop() — stops the codespace
 * 4. provider.resume() with tailscale config — restarts, re-joins tailnet
 *    with a fresh preauth key, re-applies runtime config
 * 5. Verify connectivity still works after stop/start cycle
 *
 * Infrastructure: Headscale (Docker) + ngrok tunnel + Docker Tailscale client.
 * Use scripts/tailscale-infra-setup.sh to bring up infra manually for iteration.
 *
 * Prerequisites:
 * - Docker running locally
 * - ngrok installed and authenticated
 * - gh CLI authenticated with codespace access
 * - RUN_INTEGRATION_TESTS=1
 *
 * @see i-9u5u - Implement Tailscale re-join on resume in CodespacesProvider
 * @see s-k316 - Codespaces Tailscale Integration
 */

import { describe, it, beforeAll, afterAll, expect } from 'vitest';
import { execSync } from 'node:child_process';
import path from 'node:path';
import { HeadscaleClient } from '../../tailscale/headscale-client.js';
import { startNgrokTunnel, type NgrokTunnel } from '../../tailscale/ngrok-tunnel.js';
import { createProvider } from '../../../../src/provider/factory.js';
import type { Provider, Workspace } from '../../../../src/provider/types.js';
import {
  execInCodespace,
  getCodespace,
} from '../../../../src/provider/codespaces/cli.js';

if (!process.env.RUN_INTEGRATION_TESTS) {
  console.log(
    '\n  Skipping integration tests: RUN_INTEGRATION_TESTS not set',
  );
  console.log(
    '   To run: RUN_INTEGRATION_TESTS=1 npx vitest run tests/integration/provider/codespaces/e2e.test.ts --config vitest.integration.codespaces.config.ts\n',
  );
  process.exit(0);
}

const COMPOSE_FILE = path.resolve(
  'tests/integration/tailscale/docker-compose.yml',
);
const TEST_REPO_OWNER = 'sudocode-ai';
const TEST_REPO_NAME = 'sudocode';
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

describe('Codespaces Provider E2E: Create + Connectivity + Resume', () => {
  let provider: Provider;
  let headscale: HeadscaleClient;
  let headscaleUserId: string;
  let ngrok: NgrokTunnel | null = null;
  let workspace: Workspace;
  let codespaceIp: string;
  let dockerIp: string;
  let csNodeName: string;

  // ── Setup: test infrastructure (Headscale + ngrok + Docker Tailscale) ──

  beforeAll(async () => {
    // 0. Create the provider (same as a real consumer would)
    const authToken = shell('gh auth token');
    provider = createProvider('codespaces', { authToken });

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
    headscaleUserId = user.id;
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

    // 5. Create workspace via top-level Provider API
    console.log('Creating workspace via provider.create()...');
    workspace = await provider.create({
      name: `e2e-${Date.now()}`,
      repository: {
        owner: TEST_REPO_OWNER,
        repo: TEST_REPO_NAME,
        branch: TEST_BRANCH,
      },
      retentionDays: RETENTION_DAYS,
      machineType: TEST_MACHINE,
      setup: {
        tailscale: {
          authKey: codespacePreauthKey,
          controlServer: ngrok.url,
        },
      },
      runtime: {
        port: SUDOCODE_PORT,
      },
    });
    console.log(`  Workspace created: ${workspace.id} (status=${workspace.status})`);

    // 6. Look up codespace Tailscale IP from Headscale
    //    The provider used the codespace name as the Tailscale hostname
    console.log('Looking up codespace Tailscale IP...');
    for (let i = 0; i < 15; i++) {
      const nodes = await headscale.listNodes();
      const csNode = nodes.find(
        (n) => n.givenName !== DOCKER_HOSTNAME && n.name !== DOCKER_HOSTNAME,
      );
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
  }, 600_000);

  // ── Teardown ──

  afterAll(async () => {
    console.log('Tearing down...');

    if (workspace) {
      try {
        await provider.delete(workspace.id);
        console.log(`  Deleted workspace: ${workspace.id}`);
      } catch (err) {
        console.log(`  Failed to delete workspace: ${err}`);
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

  // ── Create validation ──

  it('provider.create() should return a running workspace', () => {
    expect(workspace).toBeDefined();
    expect(workspace.status).toBe('running');
    expect(workspace.id).toBeTruthy();
    expect(workspace.connection.ssh.command).toContain(workspace.id);
  }, 10_000);

  it('codespace should be joined to the tailnet', async () => {
    const nodes = await headscale.listNodes();
    const csNode = nodes.find(
      (n) => n.givenName === csNodeName || n.name === csNodeName,
    );
    expect(csNode).toBeDefined();
    expect(csNode!.online).toBe(true);
    expect(csNode!.ipAddresses.length).toBeGreaterThan(0);
  }, 30_000);

  it('both nodes should be online in Headscale', async () => {
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

  // ── Bidirectional connectivity ──

  it('local->codespace: Docker container reaches sudocode /health via Tailscale IP', async () => {
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

  it('codespace->local: codespace reaches Docker container via Tailscale IP', async () => {
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
        workspace.id,
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

  // ── Stop + Resume cycle ── (@see i-9u5u)

  it('provider.stop() + provider.resume(): Tailscale re-joins with fresh preauth key', async () => {
    // 1. Stop via provider API
    console.log('Stopping workspace via provider.stop()...');
    await provider.stop(workspace.id);

    // Wait for it to actually be stopped
    for (let i = 0; i < 30; i++) {
      const cs = await getCodespace(workspace.id);
      if (cs?.state === 'Shutdown') {
        console.log('  Codespace stopped');
        break;
      }
      console.log(`  State: ${cs?.state ?? 'unknown'}`);
      await new Promise((r) => setTimeout(r, 5_000));
    }

    // 2. Generate a fresh preauth key for resume
    //    Codespaces wipes /var/lib/tailscale/ on stop/start, so the provider
    //    needs a new key to re-join the tailnet.
    console.log('Generating fresh preauth key for resume...');
    const resumePreauthKey = await headscale.createPreauthKey(headscaleUserId);
    console.log(`  Resume preauthkey: ${resumePreauthKey.substring(0, 12)}...`);

    // 3. Resume via provider API — starts the codespace, re-joins Tailscale
    //    with the fresh key, then applies runtime config
    console.log('Resuming workspace via provider.resume()...');
    workspace = await provider.resume(workspace.id, {
      runtime: { port: SUDOCODE_PORT },
      tailscale: {
        authKey: resumePreauthKey,
        controlServer: ngrok!.url,
      },
    });
    console.log(`  Workspace resumed: status=${workspace.status}`);
    expect(workspace.status).toBe('running');

    // 4. Verify node is back online in Headscale
    console.log('Verifying node online in Headscale...');
    let nodeOnline = false;
    for (let i = 0; i < 15; i++) {
      const nodes = await headscale.listNodes();
      // After re-join, the node may have a new name/ID — find any non-Docker node
      const csNode = nodes.find(
        (n) => n.givenName !== DOCKER_HOSTNAME && n.name !== DOCKER_HOSTNAME && n.online,
      );
      if (csNode) {
        nodeOnline = true;
        codespaceIp = csNode.ipAddresses[0];
        csNodeName = csNode.givenName;
        console.log(`  Node online: ${csNodeName} (${codespaceIp})`);
        break;
      }
      await new Promise((r) => setTimeout(r, 3_000));
    }
    expect(nodeOnline).toBe(true);
  }, 600_000);

  it('post-resume: Docker container reaches codespace over Tailscale IP', async () => {
    // Warm up DERP relay after resume
    console.log(`  Pinging ${codespaceIp} from Docker container...`);
    try {
      shell(
        `docker exec tailscale-client tailscale ping -c 3 ${codespaceIp}`,
        { timeout: 30_000 },
      );
    } catch {
      console.log('  Ping exited non-zero (expected for DERP), continuing...');
    }

    // provider.resume() already started the sudocode server — verify it's
    // reachable from the Docker container over Tailscale
    console.log(`  Fetching http://${codespaceIp}:${SUDOCODE_PORT}/health from Docker...`);
    let output = '';
    let reachable = false;
    for (let attempt = 0; attempt < 10; attempt++) {
      try {
        output = shell(
          `docker exec tailscale-client wget -qO- --timeout=10 http://${codespaceIp}:${SUDOCODE_PORT}/health`,
          { timeout: 20_000 },
        );
        if (output.includes('"ok"')) {
          reachable = true;
          break;
        }
      } catch {
        console.log(`  Attempt ${attempt + 1} failed, retrying...`);
      }
      await new Promise((r) => setTimeout(r, 5_000));
    }

    console.log(`  Response: ${output.substring(0, 200)}`);
    expect(reachable).toBe(true);
  }, 180_000);
});
