/**
 * VS Code Remote-SSH via Tailscale E2E Test
 *
 * End-to-end validation of the VS Code IDE connection flow:
 * 1. provider.create() with Tailscale kernel mode + headscaleApiKey
 * 2. Verify workspace.connection.tailscale has IP, sshCommand, vscodeCommand
 * 3. Verify Tailscale SSH works (via Docker ProxyCommand)
 * 4. Verify .vscode-server symlink persists on EBS
 * 5. Print VS Code connection instructions
 * 6. Optional MANUAL_VSCODE_TEST=1 pause for manual VS Code testing
 *
 * Infrastructure: Headscale (Docker) + ngrok tunnel + Docker Tailscale client.
 *
 * Prerequisites:
 * - Docker running locally
 * - ngrok installed and authenticated
 * - CODER_URL and CODER_TOKEN set (auto-provisioned by vitest setup)
 * - RUN_INTEGRATION_TESTS=1
 *
 * @see i-2gee - E2E test issue
 * @see i-5uc0 - Kernel mode implementation
 * @see i-88ck - IP discovery implementation
 * @see i-867f - Connection info in Workspace type
 */

import { describe, it, beforeAll, afterAll, expect } from 'vitest';
import { execSync } from 'node:child_process';
import path from 'node:path';
import { HeadscaleClient } from '../../tailscale/headscale-client.js';
import { startNgrokTunnel, type NgrokTunnel } from '../../tailscale/ngrok-tunnel.js';
import { createProvider } from '../../../../src/provider/factory.js';
import type { Provider, Workspace } from '../../../../src/provider/types.js';

if (!process.env.RUN_INTEGRATION_TESTS) {
  console.log(
    '\n  Skipping integration tests: RUN_INTEGRATION_TESTS not set',
  );
  console.log(
    '   To run: RUN_INTEGRATION_TESTS=1 npx vitest run tests/integration/provider/coder/vscode-e2e.test.ts --config vitest.integration.coder.config.ts\n',
  );
  process.exit(0);
}

const COMPOSE_FILE = path.resolve(
  'tests/integration/tailscale/docker-compose.yml',
);
const TEST_REPO_OWNER = 'sudocode-ai';
const TEST_REPO_NAME = 'sudocode';
const TEST_BRANCH = 'main';
const DOCKER_HOSTNAME = 'docker-local';

function getTestEnv(): { url: string; token: string } | undefined {
  const url = process.env.CODER_URL;
  const token = process.env.CODER_TOKEN;
  if (!url || !token) return undefined;
  return { url, token };
}

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

describe('VS Code Remote-SSH via Tailscale (E2E)', () => {
  const testEnv = getTestEnv();
  if (!testEnv) {
    it.skip('CODER_URL and CODER_TOKEN not set — skipping', () => {});
    return;
  }

  let provider: Provider;
  let headscale: HeadscaleClient;
  let headscaleApiKey: string;
  let ngrok: NgrokTunnel | null = null;
  let workspace: Workspace;
  let workspaceIp: string;

  // ── Setup ──

  beforeAll(async () => {
    provider = createProvider('coder', {
      url: testEnv.url,
      authToken: testEnv.token,
    });

    // 1. Clean slate + start Headscale
    console.log('Cleaning up any leftover Docker state...');
    try {
      shell(
        `docker compose -f ${COMPOSE_FILE} --profile connectivity down -v`,
        { timeout: 30_000 },
      );
    } catch {
      // nothing to clean
    }
    await new Promise((r) => setTimeout(r, 2_000));

    console.log('Starting Headscale...');
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

    // 2. Create API key + user + preauthkeys
    console.log('Setting up Headscale...');
    headscaleApiKey = '';
    for (let i = 0; i < 10; i++) {
      try {
        headscaleApiKey = shell(
          `docker compose -f ${COMPOSE_FILE} exec -T headscale headscale apikeys create -e 1h`,
          { timeout: 15_000 },
        );
        if (headscaleApiKey) break;
      } catch {
        await new Promise((r) => setTimeout(r, 3_000));
      }
    }
    if (!headscaleApiKey) throw new Error('Failed to create Headscale API key');

    headscale = new HeadscaleClient({
      baseUrl: 'http://localhost:8080',
      apiKey: headscaleApiKey,
    });

    const user = await headscale.createUser(`vscode-e2e-${Date.now()}`);
    const dockerPreauthKey = await headscale.createPreauthKey(user.id);
    const workspacePreauthKey = await headscale.createPreauthKey(user.id);

    // 3. Start ngrok tunnel
    console.log('Starting ngrok tunnel...');
    ngrok = await startNgrokTunnel(8080);
    console.log(`  ngrok URL: ${ngrok.url}`);

    // 4. Start Docker Tailscale client
    console.log('Starting Docker Tailscale client...');
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

    // Install openssh-client in the tailscale container (Alpine-based, no ssh by default)
    console.log('Installing openssh-client in Docker Tailscale container...');
    shell('docker exec tailscale-client apk add --no-cache openssh-client', {
      timeout: 30_000,
    });

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

    // 5. Create workspace using provider.create() with kernel mode + headscaleApiKey
    // This is the production path — the provider handles:
    //   - Tailscale install + daemon start with --statedir (kernel mode)
    //   - tailscale up --ssh (enables Tailscale SSH)
    //   - Headscale IP discovery via headscaleApiKey
    //   - .vscode-server symlink creation
    console.log('Creating workspace via provider.create() with kernel mode...');
    workspace = await provider.create({
      name: `vscode-e2e-${Date.now()}`,
      repository: {
        owner: TEST_REPO_OWNER,
        repo: TEST_REPO_NAME,
        branch: TEST_BRANCH,
      },
      retentionDays: 1,
      setup: {
        tailscale: {
          authKey: workspacePreauthKey,
          controlServer: ngrok.url,
          headscaleApiKey,
          mode: 'kernel',
        },
      },
    });
    console.log(`  Workspace created: ${workspace.id} / ${workspace.name}`);
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
    }

    shell(
      `docker compose -f ${COMPOSE_FILE} --profile connectivity down -v`,
      { timeout: 30_000 },
    );
    console.log('  Cleanup complete');
  }, 120_000);

  // ── Tests ──

  it('workspace.connection.tailscale should have IP and connection commands', () => {
    expect(workspace.connection.tailscale).toBeDefined();
    const ts = workspace.connection.tailscale!;

    expect(ts.ip).toMatch(/^100\.64\.\d+\.\d+$/);
    expect(ts.nodeId).toBeTruthy();
    expect(ts.nodeName).toBe(workspace.name);
    expect(ts.sshCommand).toBe(`ssh root@${ts.ip}`);
    expect(ts.vscodeCommand).toContain(`code --remote ssh-remote+root@${ts.ip}`);
    expect(ts.vscodeCommand).toContain(`/workspaces/${TEST_REPO_NAME}`);

    workspaceIp = ts.ip;
    console.log(`  Tailscale IP: ${workspaceIp}`);
    console.log(`  SSH: ${ts.sshCommand}`);
    console.log(`  VS Code: ${ts.vscodeCommand}`);
  }, 10_000);

  it('SSH via Tailscale (ProxyCommand through Docker client) works', () => {
    const whoami = shell(
      `docker exec tailscale-client ssh -o StrictHostKeyChecking=no -o UserKnownHostsFile=/dev/null -o ConnectTimeout=30 root@${workspaceIp} "whoami"`,
      { timeout: 60_000 },
    );
    console.log(`  SSH whoami: ${whoami}`);
    expect(whoami).toBe('root');
  }, 60_000);

  it('Tailscale SSH banner shows remote software version Tailscale', () => {
    // Tailscale SSH intercepts port 22 and handles auth via tailnet identity.
    // The banner should show "remote software version Tailscale" confirming
    // Tailscale SSH is active (not regular OpenSSH).
    const sshOutput = shell(
      `docker exec tailscale-client ssh -v -o StrictHostKeyChecking=no -o UserKnownHostsFile=/dev/null -o ConnectTimeout=30 root@${workspaceIp} "exit" 2>&1 || true`,
      { timeout: 60_000 },
    );
    expect(sshOutput).toContain('Tailscale');
  }, 60_000);

  it('.vscode-server symlink exists and points to /workspaces/', () => {
    const result = shell(
      `docker exec tailscale-client ssh -o StrictHostKeyChecking=no -o UserKnownHostsFile=/dev/null -o ConnectTimeout=30 root@${workspaceIp} "readlink /root/.vscode-server"`,
      { timeout: 60_000 },
    );
    console.log(`  Symlink: ${result}`);
    expect(result).toBe('/workspaces/.vscode-server');
  }, 60_000);

  it('SSH via ProxyCommand from local machine works', () => {
    // This is the actual VS Code Remote-SSH path — SSH from the Mac host
    // through the Docker Tailscale client via tailscale nc.
    const whoami = shell(
      `ssh -o StrictHostKeyChecking=no -o UserKnownHostsFile=/dev/null -o ConnectTimeout=30 -o "ProxyCommand docker exec -i tailscale-client tailscale nc %h 22" root@${workspaceIp} "whoami"`,
      { timeout: 60_000 },
    );
    console.log(`  Local SSH via ProxyCommand: ${whoami}`);
    expect(whoami).toBe('root');
  }, 60_000);

  it('workspace has VS Code prerequisites (bash, tar, gzip)', () => {
    const result = shell(
      `docker exec tailscale-client ssh -o StrictHostKeyChecking=no -o UserKnownHostsFile=/dev/null -o ConnectTimeout=30 root@${workspaceIp} "which bash && which tar && which gzip && echo OK"`,
      { timeout: 60_000 },
    );
    console.log(`  Prerequisites: ${result}`);
    expect(result).toContain('OK');
  }, 60_000);

  it('print VS Code connection instructions', () => {
    const ts = workspace.connection.tailscale!;
    console.log(`
  ══════════════════════════════════════════════════════════
  VS Code Connection Instructions
  ══════════════════════════════════════════════════════════

  Option 1: ProxyCommand (no tailnet join required)
  ───────────────────────────────────────────────────────
  1. Add to your SSH config (~/.ssh/config):

     Host sudopod-${workspace.name}
       HostName ${ts.ip}
       User root
       ProxyCommand docker exec -i tailscale-client tailscale nc %h 22
       StrictHostKeyChecking no
       UserKnownHostsFile /dev/null

  2. Open VS Code:
     code --remote ssh-remote+sudopod-${workspace.name} /workspaces/${TEST_REPO_NAME}


  Option 2: Join test tailnet directly (full Tailscale SSH)
  ───────────────────────────────────────────────────────
  1. Join the test tailnet:
     sudo tailscale up --login-server=${ngrok!.url} --accept-dns=false

  2. Open VS Code:
     ${ts.vscodeCommand}

  3. When done, reconnect to your normal tailnet:
     sudo tailscale up --login-server=https://controlplane.tailscale.com --reset

  ══════════════════════════════════════════════════════════
`);
    expect(true).toBe(true);
  }, 10_000);

  it('manual VS Code test (MANUAL_VSCODE_TEST=1)', async () => {
    if (!process.env.MANUAL_VSCODE_TEST) {
      console.log('  Skipped: set MANUAL_VSCODE_TEST=1 to enable 30-minute pause');
      return;
    }

    console.log('\n  Manual testing mode enabled. Workspace will stay up for 30 minutes.');
    console.log('  Connect VS Code using the instructions above.');
    console.log('  Press Ctrl+C when done.\n');

    await new Promise((r) => setTimeout(r, 30 * 60 * 1000));
  }, 1_800_000);
});
