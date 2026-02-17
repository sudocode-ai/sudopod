/**
 * Investigation: VS Code Remote-SSH via Tailscale SSH (i-tikl)
 *
 * Builds on i-19y4 findings to validate end-to-end VS Code IDE connectivity:
 *  - SSH via ProxyCommand from local machine (the actual path VS Code uses)
 *  - Architecture compatibility for vscode-server (aarch64 on t4g instances)
 *  - Generate SSH config + `code --remote` connection string
 *  - Optional manual test: pause for user to connect VS Code
 *
 * Key findings from i-19y4:
 *  - `--statedir` (not `--state`) required for SSH host keys
 *  - Two-phase install via `coder ssh` for tunnel survival
 *  - Tailscale SSH uses "none" auth (tailnet identity)
 *  - Coder agent coexists with Tailscale SSH
 *
 * Prerequisites:
 *  - Docker running locally
 *  - ngrok installed and authenticated
 *  - CODER_URL and CODER_TOKEN set (staging)
 *  - RUN_INTEGRATION_TESTS=1
 *  - Optional: MANUAL_VSCODE_TEST=1 to enable 30-min pause for manual VS Code testing
 */

import { describe, it, beforeAll, afterAll, expect } from 'vitest';
import { execSync } from 'node:child_process';
import { writeFileSync, mkdirSync, rmSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { tmpdir } from 'node:os';
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
    '  To run: RUN_INTEGRATION_TESTS=1 npx vitest run tests/integration/provider/coder/vscode-ssh-investigation.test.ts --config vitest.integration.coder.config.ts\n',
  );
  process.exit(0);
}

const COMPOSE_FILE = resolve(
  'tests/integration/tailscale/docker-compose.yml',
);
const DOCKER_HOSTNAME = 'docker-local';
const SSH_CONFIG_DIR = join(tmpdir(), 'sudopod-vscode-test');
const SSH_CONFIG_PATH = join(SSH_CONFIG_DIR, 'config');

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

describe('Investigation: VS Code Remote-SSH via Tailscale SSH (i-tikl)', () => {
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
  let localPreauthKey: string;

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

    // 2. Create API key + user + preauthkeys (3: docker, workspace, local machine)
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
    const testUser = `vscode-test-${Date.now()}`;
    const user = await headscale.createUser(testUser);
    const dockerPreauthKey = await headscale.createPreauthKey(user.id);
    const workspacePreauthKey = await headscale.createPreauthKey(user.id);
    localPreauthKey = await headscale.createPreauthKey(user.id);

    // 3. Start ngrok tunnel
    console.log('Starting ngrok tunnel...');
    ngrok = await startNgrokTunnel(8080);
    console.log(`  ngrok URL: ${ngrok.url}`);

    // 4. Start Docker Tailscale client (with openssh-client for ssh binary)
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

    shell('docker exec tailscale-client apk add --no-cache openssh-client', { timeout: 30_000 });

    // 5. Create workspace
    console.log('Creating workspace on staging...');
    workspace = await provider.create({
      name: `vscode-test-${Date.now()}`,
      repository: {
        owner: 'sudocode-ai',
        repo: 'sudocode',
        branch: 'main',
      },
      retentionDays: 1,
    });
    workspaceName = workspace.name;
    console.log(`  Workspace created: ${workspace.id} / ${workspaceName}`);

    // 6. Install Tailscale with kernel networking + --ssh (two-phase)
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
      console.log('  Phase 1 failed (tunnel may have died). Waiting for agent reconnect...');
      await new Promise((r) => setTimeout(r, 15_000));
    }

    console.log('Phase 2: Starting Tailscale daemon + joining tailnet...');
    const phase2Cmd = [
      `setsid sudo tailscaled --statedir=/workspaces/.tailscale --socket=/var/run/tailscale/tailscaled.sock > /tmp/tailscaled.log 2>&1 & for i in $(seq 1 20); do [ -S /var/run/tailscale/tailscaled.sock ] && break; sleep 0.5; done`,
      `sudo tailscale up --ssh --authkey=${workspacePreauthKey} --login-server=${ngrok.url} --hostname=${workspaceName} --accept-dns=false`,
    ].join(' && ');

    let phase2Success = false;
    for (let attempt = 0; attempt < 3; attempt++) {
      const phase2 = await exec(workspaceName, phase2Cmd, { timeout: 60_000 });
      console.log(`  Phase 2 attempt ${attempt + 1}: exit code ${phase2.exitCode}`);
      if (phase2.exitCode === 0) {
        phase2Success = true;
        break;
      }
      console.log('  Waiting for agent reconnect...');
      await new Promise((r) => setTimeout(r, 15_000));
    }

    // 7. Wait for workspace to appear in Headscale
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
        console.log('  Could not retrieve logs');
      }
      throw new Error('Workspace node did not appear in Headscale');
    }
  }, 600_000);

  // ── Teardown ──

  afterAll(async () => {
    console.log('Tearing down...');
    // Clean up SSH config
    try {
      rmSync(SSH_CONFIG_DIR, { recursive: true, force: true });
    } catch { /* ok */ }

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

  it('SSH from Docker client works', async () => {
    // Quick sanity — same as i-19y4
    const output = shell(
      `docker exec tailscale-client ssh -o StrictHostKeyChecking=no -o UserKnownHostsFile=/dev/null -o ConnectTimeout=30 root@${workspaceIp} whoami`,
      { timeout: 45_000 },
    );
    expect(output).toContain('root');
    console.log(`  Docker client SSH whoami: ${output}`);
  }, 60_000);

  it('workspace architecture is compatible with vscode-server', async () => {
    const arch = shell(
      `docker exec tailscale-client ssh -o StrictHostKeyChecking=no -o UserKnownHostsFile=/dev/null -o ConnectTimeout=30 root@${workspaceIp} uname -m`,
      { timeout: 30_000 },
    );
    console.log(`  Workspace architecture: ${arch}`);
    // vscode-server supports x86_64 and aarch64/arm64
    expect(['x86_64', 'aarch64', 'arm64']).toContain(arch);

    // Also check available resources
    const resources = shell(
      `docker exec tailscale-client ssh -o StrictHostKeyChecking=no -o UserKnownHostsFile=/dev/null -o ConnectTimeout=30 root@${workspaceIp} "free -h | head -2 && nproc"`,
      { timeout: 30_000 },
    );
    console.log(`  Resources:\n${resources}`);
  }, 60_000);

  it('SSH via ProxyCommand from local machine (VS Code path)', async () => {
    // This validates the exact SSH path VS Code Remote-SSH would use:
    // local ssh → docker exec tailscale nc → tailscale network → workspace port 22
    const output = shell(
      `ssh -o ProxyCommand="docker exec -i tailscale-client tailscale nc ${workspaceIp} 22" -o StrictHostKeyChecking=no -o UserKnownHostsFile=/dev/null -o ConnectTimeout=30 root@${workspaceIp} whoami`,
      { timeout: 45_000 },
    );
    expect(output).toContain('root');
    console.log(`  Local SSH via ProxyCommand: ${output}`);

    // Verify more complex operations (VS Code runs these during setup)
    const setupCheck = shell(
      `ssh -o ProxyCommand="docker exec -i tailscale-client tailscale nc ${workspaceIp} 22" -o StrictHostKeyChecking=no -o UserKnownHostsFile=/dev/null -o ConnectTimeout=30 root@${workspaceIp} "echo OK && cat /etc/os-release | head -1 && which bash && which tar && which gzip"`,
      { timeout: 30_000 },
    );
    console.log(`  VS Code prerequisites check:\n${setupCheck}`);
    expect(setupCheck).toContain('OK');
    expect(setupCheck).toContain('bash');
  }, 90_000);

  it('write SSH config and print VS Code connection instructions', async () => {
    // Write SSH config for VS Code
    mkdirSync(SSH_CONFIG_DIR, { recursive: true });

    const sshConfig = [
      `Host sudopod-test`,
      `  HostName ${workspaceIp}`,
      `  User root`,
      `  ProxyCommand docker exec -i tailscale-client tailscale nc %h 22`,
      `  StrictHostKeyChecking no`,
      `  UserKnownHostsFile /dev/null`,
      ``,
    ].join('\n');

    writeFileSync(SSH_CONFIG_PATH, sshConfig);
    console.log(`  SSH config written to: ${SSH_CONFIG_PATH}`);
    console.log(`  Config contents:\n${sshConfig}`);

    console.log('\n  ══════════════════════════════════════════════════════════');
    console.log('  VS Code Connection Instructions');
    console.log('  ══════════════════════════════════════════════════════════');
    console.log('');
    console.log('  Option 1: ProxyCommand (no tailnet join required)');
    console.log('  ───────────────────────────────────────────────────────');
    console.log(`  1. Add to your SSH config (~/.ssh/config):\n`);
    console.log(`     Host sudopod-test`);
    console.log(`       HostName ${workspaceIp}`);
    console.log(`       User root`);
    console.log(`       ProxyCommand docker exec -i tailscale-client tailscale nc %h 22`);
    console.log(`       StrictHostKeyChecking no`);
    console.log(`       UserKnownHostsFile /dev/null\n`);
    console.log(`  2. Open VS Code:`);
    console.log(`     code --remote ssh-remote+sudopod-test /workspaces/sudocode\n`);
    console.log(`  Or with the temp SSH config:`);
    console.log(`     SSH_CONFIG=${SSH_CONFIG_PATH} code --remote ssh-remote+sudopod-test /workspaces/sudocode\n`);
    console.log('');
    console.log('  Option 2: Join test tailnet directly');
    console.log('  ───────────────────────────────────────────────────────');
    console.log(`  1. Join the test tailnet:`);
    console.log(`     sudo tailscale up --login-server=${ngrok!.url} --authkey=${localPreauthKey} --accept-dns=false\n`);
    console.log(`  2. Open VS Code:`);
    console.log(`     code --remote ssh-remote+root@${workspaceIp} /workspaces/sudocode\n`);
    console.log(`  3. When done, reconnect to your normal tailnet:`);
    console.log(`     sudo tailscale up --login-server=https://controlplane.tailscale.com --reset\n`);
    console.log('  ══════════════════════════════════════════════════════════\n');

    expect(true).toBe(true);
  }, 30_000);

  it('vscode-server persists on EBS via symlink', async () => {
    const ssh = (cmd: string, timeout = 30_000) => shell(
      `docker exec tailscale-client ssh -o StrictHostKeyChecking=no -o UserKnownHostsFile=/dev/null -o ConnectTimeout=30 root@${workspaceIp} "${cmd}"`,
      { timeout },
    );

    // 1. Set up symlink: /root/.vscode-server -> /workspaces/.vscode-server
    //    Must remove existing dir first — ln -sf creates inside dirs, not over them
    console.log('  Setting up symlink...');
    const symlinkResult = ssh(
      'mkdir -p /workspaces/.vscode-server && rm -rf /root/.vscode-server && ln -s /workspaces/.vscode-server /root/.vscode-server && readlink /root/.vscode-server',
    );
    console.log(`  Symlink: ${symlinkResult}`);
    expect(symlinkResult).toContain('/workspaces/.vscode-server');

    // 2. Determine architecture + download URL
    const arch = ssh('uname -m');
    const vsCodeArch = arch === 'aarch64' || arch === 'arm64' ? 'arm64' : 'x64';
    console.log(`  Architecture: ${arch} -> vscode-server ${vsCodeArch}`);

    let localCommit = '';
    try {
      const versionOutput = shell('code --version 2>/dev/null', { timeout: 5_000 });
      const lines = versionOutput.split('\n');
      if (lines.length >= 2) {
        localCommit = lines[1].trim();
        console.log(`  Local VS Code commit: ${localCommit}`);
      }
    } catch {
      console.log('  VS Code CLI not available locally');
    }

    const downloadUrl = localCommit
      ? `https://update.code.visualstudio.com/commit:${localCommit}/server-linux-${vsCodeArch}/stable`
      : `https://update.code.visualstudio.com/latest/server-linux-${vsCodeArch}/stable`;

    // 3. Download + extract vscode-server
    console.log(`  Downloading vscode-server (${vsCodeArch})...`);
    const downloadResult = ssh(
      `curl -sL '${downloadUrl}' -o /tmp/vscode-server.tar.gz && ls -la /tmp/vscode-server.tar.gz`,
      120_000,
    );
    console.log(`  Download: ${downloadResult}`);
    const sizeMatch = downloadResult.match(/root\s+(\d+)\s/);
    if (sizeMatch) {
      const sizeBytes = parseInt(sizeMatch[1], 10);
      console.log(`  Size: ${(sizeBytes / 1024 / 1024).toFixed(1)} MB`);
      expect(sizeBytes).toBeGreaterThan(10 * 1024 * 1024);
    }

    console.log('  Extracting...');
    const extractResult = ssh(
      'cd /root/.vscode-server && tar xzf /tmp/vscode-server.tar.gz && ls -la /root/.vscode-server/',
      120_000,
    );
    console.log(`  Extract:\n${extractResult}`);
    expect(extractResult).toContain('vscode-server-linux');

    // Verify node binary exists at known location
    const nodeCheck = ssh('ls -la /root/.vscode-server/vscode-server-linux-*/node');
    console.log(`  Node binary: ${nodeCheck}`);
    expect(nodeCheck).toContain('node');

    // 4. Verify it landed on EBS (via the symlink)
    const persistence = ssh('df -h /workspaces/.vscode-server && echo --- && du -sh /workspaces/.vscode-server');
    console.log(`  Persistence (should be on /dev/nvme*):\n${persistence}`);
    expect(persistence).toContain('/dev/nvme');
  }, 300_000);

  // Optional manual test — only runs with MANUAL_VSCODE_TEST=1
  const manualTestFn = process.env.MANUAL_VSCODE_TEST ? it : it.skip;
  manualTestFn('MANUAL: VS Code connection test (30 min window)', async () => {
    console.log('\n');
    console.log('  ╔══════════════════════════════════════════════════════╗');
    console.log('  ║  MANUAL VS CODE TEST — WORKSPACE IS READY           ║');
    console.log('  ║  Connect with VS Code using instructions above.     ║');
    console.log('  ║  Test will auto-cleanup after 30 minutes.           ║');
    console.log('  ║  Press Ctrl+C when done testing.                    ║');
    console.log('  ╚══════════════════════════════════════════════════════╝');
    console.log('');
    console.log(`  Workspace: ${workspaceName}`);
    console.log(`  Tailscale IP: ${workspaceIp}`);
    console.log(`  SSH config: ${SSH_CONFIG_PATH}`);
    console.log(`  ngrok URL: ${ngrok!.url}`);
    console.log(`  Local preauth key: ${localPreauthKey}`);
    console.log('');
    console.log('  Quick test: ssh sudopod-test -F ' + SSH_CONFIG_PATH);
    console.log('');

    // Wait 30 minutes for manual testing
    await new Promise((r) => setTimeout(r, 30 * 60 * 1_000));
    expect(true).toBe(true);
  }, 35 * 60 * 1_000);
});
