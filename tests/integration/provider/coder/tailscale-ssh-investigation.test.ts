/**
 * Investigation: Tailscale SSH for IDE Connectivity (i-19y4)
 *
 * Validates that Tailscale with kernel networking + --ssh enables
 * direct SSH access to Coder workspaces, eliminating the need for
 * the Coder agent as a connectivity layer.
 *
 * Test flow:
 * 1. Boot workspace with Coder agent (existing template)
 * 2. Install Tailscale with kernel networking + --ssh via coder ssh
 * 3. Verify SSH connectivity via Tailscale from another tailnet node
 * 4. Verify workspace stop/start lifecycle works without agent
 *
 * Prerequisites:
 * - Docker running locally
 * - ngrok installed and authenticated
 * - CODER_URL and CODER_TOKEN set
 * - RUN_INTEGRATION_TESTS=1
 */

import { describe, it, beforeAll, afterAll, expect } from 'vitest';
import { execSync } from 'node:child_process';
import path from 'node:path';
import { HeadscaleClient } from '../../tailscale/headscale-client.js';
import { startNgrokTunnel, type NgrokTunnel } from '../../tailscale/ngrok-tunnel.js';
import { createProvider } from '../../../../src/provider/factory.js';
import type { Provider, Workspace, ExecFn } from '../../../../src/provider/types.js';
import { createCoderExecFn } from '../../../../src/provider/coder/cli.js';

if (!process.env.RUN_INTEGRATION_TESTS) {
  console.log(
    '\n  Skipping: RUN_INTEGRATION_TESTS not set',
  );
  console.log(
    '  To run: RUN_INTEGRATION_TESTS=1 npx vitest run tests/integration/provider/coder/tailscale-ssh-investigation.test.ts --config vitest.integration.coder.config.ts\n',
  );
  process.exit(0);
}

const COMPOSE_FILE = path.resolve(
  'tests/integration/tailscale/docker-compose.yml',
);
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

describe('Investigation: Tailscale SSH for IDE Connectivity (i-19y4)', () => {
  const testEnv = getTestEnv();
  if (!testEnv) {
    it.skip('CODER_URL and CODER_TOKEN not set', () => {});
    return;
  }

  let provider: Provider;
  let exec: ExecFn;
  let headscale: HeadscaleClient;
  let ngrok: NgrokTunnel | null = null;
  let workspace: Workspace;
  let workspaceName: string;
  let workspaceIp: string;
  let dockerIp: string;

  // ── Setup ──

  beforeAll(async () => {
    provider = createProvider('coder', {
      url: testEnv.url,
      authToken: testEnv.token,
    });
    exec = createCoderExecFn({
      coderUrl: testEnv.url,
      coderToken: testEnv.token,
    });

    // 1. Start Headscale
    console.log('Starting Headscale...');
    try {
      shell(`docker compose -f ${COMPOSE_FILE} --profile connectivity down -v`, { timeout: 30_000 });
    } catch { /* clean slate */ }
    await new Promise((r) => setTimeout(r, 2_000));

    shell(`docker compose -f ${COMPOSE_FILE} up -d headscale`, { timeout: 60_000 });

    for (let i = 0; i < 30; i++) {
      try {
        const health = shell('curl -sf http://localhost:8080/health');
        if (health.includes('"pass"')) break;
      } catch { /* not ready */ }
      await new Promise((r) => setTimeout(r, 1_000));
    }

    // 2. Create API key + user + preauthkeys
    console.log('Setting up Headscale...');
    let apiKey = '';
    for (let i = 0; i < 10; i++) {
      try {
        apiKey = shell(
          `docker compose -f ${COMPOSE_FILE} exec -T headscale headscale apikeys create -e 1h`,
          { timeout: 15_000 },
        );
        if (apiKey) break;
      } catch {
        await new Promise((r) => setTimeout(r, 3_000));
      }
    }
    if (!apiKey) throw new Error('Failed to create Headscale API key');

    headscale = new HeadscaleClient({ baseUrl: 'http://localhost:8080', apiKey });
    const testUser = `ssh-test-${Date.now()}`;
    const user = await headscale.createUser(testUser);
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
    if (!dockerIp) throw new Error('Docker Tailscale node did not appear');

    // Install openssh-client in the tailscale container — tailscale ssh
    // is a wrapper around the system ssh command which isn't included by default
    shell('docker exec tailscale-client apk add --no-cache openssh-client', { timeout: 30_000 });

    // 5. Create workspace (NO tailscale in setup — we install manually)
    console.log('Creating workspace on staging...');
    workspace = await provider.create({
      name: `ssh-test-${Date.now()}`,
      repository: {
        owner: 'sudocode-ai',
        repo: 'sudocode',
        branch: 'main',
      },
      retentionDays: 1,
    });
    workspaceName = workspace.name;
    console.log(`  Workspace created: ${workspace.id} / ${workspaceName}`);

    // 6. Install Tailscale with KERNEL networking + --ssh via coder ssh
    //    Split into two phases because iptables packages during install can
    //    disrupt the coder ssh tunnel ~50% of the time.
    //
    //    Phase 1: apt install (may fail if tunnel dies, but install usually completes)
    //    Phase 2: start daemon + join tailnet (retry with delays for agent reconnection)

    // Phase 1: Install tailscale binary
    console.log('Phase 1: Installing Tailscale...');
    const phase1Cmd = [
      'sudo mkdir -p /workspaces/.tailscale /var/run/tailscale',
      'printf "#!/bin/sh\\nexit 101\\n" | sudo tee /usr/sbin/policy-rc.d > /dev/null && sudo chmod +x /usr/sbin/policy-rc.d',
      'curl -fsSL https://tailscale.com/install.sh | sh',
      'sudo rm -f /usr/sbin/policy-rc.d',
    ].join(' && ');

    const phase1 = await exec(workspaceName, phase1Cmd, { timeout: 180_000 });
    console.log(`  Phase 1 exit code: ${phase1.exitCode}`);
    if (phase1.exitCode !== 0) {
      console.log(`  Phase 1 failed (tunnel may have died). Waiting for agent reconnect...`);
      await new Promise((r) => setTimeout(r, 15_000));
    }

    // Phase 2: Start daemon + join tailnet (with retries)
    console.log('Phase 2: Starting Tailscale daemon + joining tailnet...');
    const phase2Cmd = [
      // setsid creates a new session so daemon survives SIGHUP from tunnel death
      `setsid sudo tailscaled --statedir=/workspaces/.tailscale --socket=/var/run/tailscale/tailscaled.sock > /tmp/tailscaled.log 2>&1 & for i in $(seq 1 20); do [ -S /var/run/tailscale/tailscaled.sock ] && break; sleep 0.5; done`,
      `sudo tailscale up --ssh --authkey=${workspacePreauthKey} --login-server=${ngrok.url} --hostname=${workspaceName} --accept-dns=false`,
    ].join(' && ');

    let phase2Success = false;
    for (let attempt = 0; attempt < 3; attempt++) {
      const phase2 = await exec(workspaceName, phase2Cmd, { timeout: 60_000 });
      console.log(`  Phase 2 attempt ${attempt + 1}: exit code ${phase2.exitCode}`);
      if (phase2.stdout) console.log(`    stdout (last 300): ${phase2.stdout.slice(-300)}`);
      if (phase2.stderr) console.log(`    stderr (last 300): ${phase2.stderr.slice(-300)}`);
      if (phase2.exitCode === 0) {
        phase2Success = true;
        break;
      }
      console.log('  Waiting for agent reconnect...');
      await new Promise((r) => setTimeout(r, 15_000));
    }

    // 7. Wait for workspace to appear in Headscale
    // Give the backgrounded setup time to start + join
    console.log('Waiting for workspace in Headscale...');
    for (let i = 0; i < 60; i++) {
      const nodes = await headscale.listNodes();
      const wsNode = nodes.find(
        (n) => n.givenName !== DOCKER_HOSTNAME && n.name !== DOCKER_HOSTNAME,
      );
      if (wsNode?.online && wsNode.ipAddresses.length > 0) {
        workspaceIp = wsNode.ipAddresses[0];
        console.log(`  Workspace node: ${wsNode.givenName} (${workspaceIp})`);
        break;
      }
      await new Promise((r) => setTimeout(r, 2_000));
    }
    if (!workspaceIp) {
      try {
        const logs = await exec(workspaceName, 'cat /tmp/tailscaled.log 2>/dev/null || echo "no logs"', { timeout: 10_000 });
        console.log(`  tailscaled logs: ${logs.stdout.slice(-1000)}`);
      } catch {
        console.log('  Could not retrieve logs (agent may be dead)');
      }
      throw new Error('Workspace node did not appear in Headscale');
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
    if (ngrok) ngrok.stop();
    shell(`docker compose -f ${COMPOSE_FILE} --profile connectivity down -v`, { timeout: 30_000 });
    console.log('  Cleanup complete');
  }, 120_000);

  // ── Tests ──

  it('workspace is online in Headscale', async () => {
    const nodes = await headscale.listNodes();
    const wsNode = nodes.find(
      (n) => n.givenName !== DOCKER_HOSTNAME && n.name !== DOCKER_HOSTNAME,
    );
    expect(wsNode).toBeDefined();
    expect(wsNode!.online).toBe(true);
    console.log(`  Workspace Tailscale IP: ${workspaceIp}`);
  }, 30_000);

  it('SSH: can execute command via tailscale ssh', async () => {
    // Debug: comprehensive workspace-side diagnostics
    try {
      const wsStatus = await exec(workspaceName, [
        'echo "=== tailscale status ==="',
        'tailscale status --self',
        'echo "=== tailscale debug prefs (ssh) ==="',
        'tailscale debug prefs | grep -i ssh',
        'echo "=== tailscale0 interface ==="',
        'ip addr show tailscale0 2>/dev/null || echo "NO tailscale0 interface"',
        'echo "=== port 22 listeners ==="',
        'ss -tlnp sport = :22',
        'echo "=== iptables FILTER table (ts-input) ==="',
        'sudo iptables -t filter -L ts-input -n -v 2>/dev/null || echo "NO ts-input chain in filter table"',
        'echo "=== iptables FILTER INPUT chain ==="',
        'sudo iptables -t filter -L INPUT -n -v 2>/dev/null | head -20',
        'echo "=== iptables NAT table ==="',
        'sudo iptables -t nat -L -n 2>/dev/null | head -20',
        'echo "=== tailscaled logs (ssh-related) ==="',
        'grep -i ssh /tmp/tailscaled.log 2>/dev/null | tail -20 || echo "no ssh entries in log"',
        'echo "=== tailscaled logs (last 30 lines) ==="',
        'tail -30 /tmp/tailscaled.log 2>/dev/null || echo "no log file"',
      ].join(' && '), { timeout: 30_000 });
      console.log(`  Workspace diagnostics:\n${wsStatus.stdout}`);
    } catch (e) { console.log(`  Workspace diagnostics failed (tunnel may be dead): ${e instanceof Error ? e.message.substring(0, 200) : e}`); }

    // Debug: check client-side tailscale status and connectivity
    try {
      const status = shell(`docker exec tailscale-client tailscale status`, { timeout: 15_000 });
      console.log(`  tailscale status:\n${status}`);
    } catch (e) { console.log(`  status failed: ${e}`); }

    // Warm up DERP relay with longer timeout
    try {
      const ping = shell(`docker exec tailscale-client tailscale ping --timeout=30s -c 3 ${workspaceIp}`, { timeout: 45_000 });
      console.log(`  ping result: ${ping}`);
    } catch (e) {
      console.log(`  ping failed: ${e instanceof Error ? e.message.substring(0, 300) : e}`);
    }

    // Wait for DERP path to stabilize
    await new Promise((r) => setTimeout(r, 5_000));

    let sshOutput = '';
    let sshSuccess = false;
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        // Use ssh directly with ConnectTimeout — tailscale ssh wraps system ssh
        // On first attempt, try with verbose output for debugging
        const verbose = attempt === 0 ? '-v' : '';
        sshOutput = shell(
          `docker exec tailscale-client ssh ${verbose} -o StrictHostKeyChecking=no -o UserKnownHostsFile=/dev/null -o ConnectTimeout=45 root@${workspaceIp} whoami`,
          { timeout: 60_000 },
        );
        if (sshOutput.includes('root')) {
          sshSuccess = true;
          break;
        }
        console.log(`  Attempt ${attempt + 1} output: ${sshOutput.substring(0, 300)}`);
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        console.log(`  Attempt ${attempt + 1}: ${msg.substring(0, 500)}`);
      }
      await new Promise((r) => setTimeout(r, 10_000));
    }

    // If direct ssh failed, also try tailscale ssh
    if (!sshSuccess) {
      console.log('  Trying tailscale ssh as fallback...');
      try {
        sshOutput = shell(
          `docker exec tailscale-client tailscale ssh root@${workspaceIp} -- whoami`,
          { timeout: 60_000 },
        );
        if (sshOutput.includes('root')) sshSuccess = true;
        console.log(`  tailscale ssh output: ${sshOutput}`);
      } catch (e) {
        console.log(`  tailscale ssh failed: ${e instanceof Error ? e.message.substring(0, 300) : e}`);
      }
    }

    console.log(`  SSH whoami output: ${sshOutput}`);
    expect(sshSuccess).toBe(true);
  }, 300_000);

  it('SSH: can read workspace filesystem', async () => {
    const output = shell(
      `docker exec tailscale-client tailscale ssh root@${workspaceIp} -- ls /workspaces/`,
      { timeout: 30_000 },
    );
    console.log(`  /workspaces/: ${output}`);
    expect(output.length).toBeGreaterThan(0);
  }, 60_000);

  it('SSH: can run complex commands', async () => {
    const output = shell(
      `docker exec tailscale-client tailscale ssh root@${workspaceIp} -- "uname -a && cat /etc/os-release | head -3"`,
      { timeout: 30_000 },
    );
    console.log(`  System: ${output.substring(0, 300)}`);
    expect(output).toContain('Linux');
  }, 60_000);

  it('Coder API: workspace still manageable', async () => {
    const ws = await provider.get(workspace.id);
    console.log(`  Status via API: ${ws.status}`);
    expect(ws.status).toBe('running');
  }, 30_000);

  it('lifecycle: stop works without agent', async () => {
    await provider.stop(workspace.id);
    const stopped = await provider.get(workspace.id);
    console.log(`  Status after stop: ${stopped.status}`);
    expect(stopped.status).toBe('stopped');
  }, 300_000);

  it('lifecycle: start works after stop', async () => {
    const resumed = await provider.resume(workspace.id);
    console.log(`  Status after resume: ${resumed.status}`);
    expect(resumed.status).toBe('running');
  }, 600_000);
});
