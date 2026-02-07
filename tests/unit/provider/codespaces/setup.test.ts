/**
 * Codespaces Setup Utilities Unit Tests
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  installSudocode,
  applySetupConfig,
  setupTailscale,
  startServices,
} from '../../../../src/provider/codespaces/setup.js';
import type { ExecFn } from '../../../../src/provider/types.js';
import type { SetupConfig } from '../../../../src/provider/types.js';
import type { ResolvedService } from '../../../../src/services/registry.js';
import { ExecutionError } from '../../../../src/provider/errors.js';

describe('installSudocode', () => {
  let mockExec: ExecFn;
  let execCalls: Array<{ name: string; command: string; options?: { timeout?: number } }>;

  beforeEach(() => {
    execCalls = [];
    mockExec = vi.fn(async (name: string, command: string, options?: { timeout?: number }) => {
      execCalls.push({ name, command, options });
      return { exitCode: 0, stdout: '', stderr: '' };
    });
  });

  it('should install sudocode with nvm setup in a single command', async () => {
    await installSudocode('my-cs', mockExec);

    expect(execCalls).toHaveLength(1);
    expect(execCalls[0].command).toContain('npm install -g sudocode');
    expect(execCalls[0].command).toContain('sudocode init');
    expect(execCalls[0].options).toEqual({ timeout: 300_000 });
  });

  it('should pass the codespace name to exec', async () => {
    await installSudocode('specific-name', mockExec);

    for (const call of execCalls) {
      expect(call.name).toBe('specific-name');
    }
  });
});

describe('applySetupConfig', () => {
  let mockExec: ExecFn;
  let execCalls: Array<{ name: string; command: string }>;

  beforeEach(() => {
    execCalls = [];
    mockExec = vi.fn(async (name: string, command: string) => {
      execCalls.push({ name, command });
      return { exitCode: 0, stdout: '', stderr: '' };
    });
  });

  it('should be a no-op with empty config', async () => {
    await applySetupConfig('my-cs', mockExec, {});

    expect(execCalls).toHaveLength(0);
  });

  it('should configure Claude credentials when claudeLtt is provided', async () => {
    const setup: SetupConfig = {
      credentials: { claudeLtt: 'test-token-123' },
    };

    await applySetupConfig('my-cs', mockExec, setup);

    expect(execCalls[0].command).toBe(
      'mkdir -p ~/.claude ~/.config/claude'
    );
    expect(execCalls[1].command).toContain('base64 -d > ~/.claude/.credentials.json');

    // Verify the base64-encoded payload contains the token
    const encoded = execCalls[1].command.match(/echo "([^"]+)"/)?.[1];
    expect(encoded).toBeTruthy();
    const decoded = JSON.parse(Buffer.from(encoded!, 'base64').toString());
    expect(decoded.claudeAiOauth.accessToken).toBe('test-token-123');
    expect(decoded.claudeAiOauth.refreshToken).toBe('test-token-123');
    expect(decoded.claudeAiOauth.expiresAt).toBe(9999999999999);
    expect(decoded.claudeAiOauth.scopes).toEqual([
      'user:inference',
      'user:profile',
    ]);
  });

  it('should skip credentials when no claudeLtt', async () => {
    await applySetupConfig('my-cs', mockExec, {});

    expect(
      execCalls.every((c) => !c.command.includes('.credentials.json'))
    ).toBe(true);
  });

  it('should install services using registry install commands', async () => {
    const setup: SetupConfig = {
      services: [
        { name: 'claude-code' },
        { name: 'aider' },
      ],
    };

    await applySetupConfig('my-cs', mockExec, setup);

    expect(execCalls[0]).toEqual({
      name: 'my-cs',
      command: 'npm install -g @anthropic-ai/claude-code',
    });
    expect(execCalls[1]).toEqual({
      name: 'my-cs',
      command: 'pip install aider-chat',
    });
  });

  it('should install sudocode when explicitly listed in services', async () => {
    const setup: SetupConfig = {
      services: [
        { name: 'sudocode' },
        { name: 'claude-code' },
      ],
    };

    await applySetupConfig('my-cs', mockExec, setup);

    // Both sudocode and claude-code should be installed
    expect(execCalls).toHaveLength(2);
    expect(execCalls[0].command).toContain('npm install -g sudocode');
    expect(execCalls[1].command).toContain('@anthropic-ai/claude-code');
  });

  it('should skip services when none specified', async () => {
    await applySetupConfig('my-cs', mockExec, {});

    expect(
      execCalls.every((c) => !c.command.includes('install'))
    ).toBe(true);
  });

  it('should throw for unknown service name', async () => {
    const setup: SetupConfig = {
      services: [{ name: 'nonexistent-tool' }],
    };

    await expect(
      applySetupConfig('my-cs', mockExec, setup)
    ).rejects.toThrow(ExecutionError);
  });

  it('should configure Tailscale with auth key and new flags', async () => {
    const setup: SetupConfig = {
      tailscale: { authKey: 'tskey-auth-abc123' },
    };

    await applySetupConfig('my-cs', mockExec, setup);

    // Default mock returns exitCode 0 for everything → tier 1 (already-running)
    // Probe: which tailscale, then tailscale status, then tailscale up
    const upCmd = execCalls.map((c) => c.command).find((c) => c.includes('tailscale up'));
    expect(upCmd).toBeDefined();
    expect(upCmd).toContain('--authkey=tskey-auth-abc123');
    expect(upCmd).toContain('--accept-dns=false');
    expect(upCmd).toContain('--hostname=my-cs');
  });

  it('should include control server for self-hosted Headscale', async () => {
    const setup: SetupConfig = {
      tailscale: {
        authKey: 'tskey-auth-abc123',
        controlServer: 'https://headscale.company.com',
      },
    };

    await applySetupConfig('my-cs', mockExec, setup);

    const upCmd = execCalls.map((c) => c.command).find((c) => c.includes('tailscale up'));
    expect(upCmd).toContain('--login-server=https://headscale.company.com');
  });

  it('should skip Tailscale when not configured', async () => {
    await applySetupConfig('my-cs', mockExec, {});

    expect(
      execCalls.every((c) => !c.command.includes('tailscale'))
    ).toBe(true);
  });

  it('should run user setup script', async () => {
    const setup: SetupConfig = {
      setupScript: 'npm install && npm run build',
    };

    await applySetupConfig('my-cs', mockExec, setup);

    expect(execCalls[0]).toEqual({
      name: 'my-cs',
      command: 'npm install && npm run build',
    });
  });

  it('should skip setup script when not provided', async () => {
    await applySetupConfig('my-cs', mockExec, {});

    expect(execCalls).toHaveLength(0);
  });

  it('should execute all steps in the correct order', async () => {
    const setup: SetupConfig = {
      credentials: { claudeLtt: 'token-123' },
      services: [{ name: 'claude-code' }],
      tailscale: { authKey: 'tskey-abc' },
      setupScript: 'echo done',
    };

    await applySetupConfig('my-cs', mockExec, setup);

    const commands = execCalls.map((c) => c.command);

    // 1. Credentials
    expect(commands[0]).toContain('mkdir -p ~/.claude');
    expect(commands[1]).toContain('.credentials.json');

    // 2. Services (claude-code via registry)
    expect(commands[2]).toContain('@anthropic-ai/claude-code');

    // 3. Tailscale (tier 1 path: which → status → tailscale up)
    expect(commands[3]).toBe('which tailscale');
    expect(commands[4]).toContain('tailscale status');
    expect(commands[5]).toContain('tailscale up');

    // 4. User script (comes after tailscale)
    expect(commands[commands.length - 1]).toBe('echo done');
  });

  it('should pass the codespace name to all exec calls', async () => {
    const setup: SetupConfig = {
      credentials: { claudeLtt: 'tok' },
      services: [{ name: 'claude-code' }],
      setupScript: 'echo hi',
    };

    await applySetupConfig('specific-cs-name', mockExec, setup);

    for (const call of execCalls) {
      expect(call.name).toBe('specific-cs-name');
    }
  });
});

// ============================================================================
// startServices
// ============================================================================

describe('startServices', () => {
  let execCalls: Array<{ name: string; command: string; options?: object }>;

  function createMockExec(
    responses: Record<string, Partial<{ exitCode: number; stdout: string; stderr: string }>> = {},
  ): ExecFn {
    return vi.fn(async (name: string, command: string, options?: object) => {
      execCalls.push({ name, command, options });
      for (const [pattern, result] of Object.entries(responses)) {
        if (command.includes(pattern)) {
          return { exitCode: 0, stdout: '', stderr: '', ...result };
        }
      }
      return { exitCode: 0, stdout: '', stderr: '' };
    });
  }

  beforeEach(() => {
    execCalls = [];
  });

  it('should start services that are not running', async () => {
    const mockExec = createMockExec({
      'pgrep': { exitCode: 0, stdout: '' }, // not running
    });

    const services: ResolvedService[] = [
      {
        name: 'sudocode',
        type: 'service',
        install: '',
        start: 'nohup sudocode server --port 3000 > /tmp/sudocode-3000.log 2>&1',
        check: 'pgrep -f "sudocode server.*--port 3000" || true',
        port: 3000,
      },
    ];

    const ports = await startServices('my-cs', mockExec, services);

    expect(ports).toEqual([3000]);
    // Should have called check then start
    const commands = execCalls.map(c => c.command);
    expect(commands).toContainEqual(expect.stringContaining('pgrep'));
    expect(commands).toContainEqual(expect.stringContaining('nohup sudocode server'));
  });

  it('should skip services that are already running', async () => {
    const mockExec = createMockExec({
      'pgrep': { exitCode: 0, stdout: '12345' }, // already running
    });

    const services: ResolvedService[] = [
      {
        name: 'sudocode',
        type: 'service',
        install: '',
        start: 'nohup sudocode server --port 3000 > /tmp/sudocode-3000.log 2>&1',
        check: 'pgrep -f "sudocode server.*--port 3000" || true',
        port: 3000,
      },
    ];

    const ports = await startServices('my-cs', mockExec, services);

    expect(ports).toEqual([3000]);
    // Should have called check but NOT start
    const commands = execCalls.map(c => c.command);
    expect(commands).toContainEqual(expect.stringContaining('pgrep'));
    expect(commands).not.toContainEqual(expect.stringContaining('nohup'));
  });

  it('should skip tools (no start command)', async () => {
    const mockExec = createMockExec();

    const services: ResolvedService[] = [
      {
        name: 'claude-code',
        type: 'tool',
        install: 'npm install -g @anthropic-ai/claude-code',
      },
    ];

    const ports = await startServices('my-cs', mockExec, services);

    expect(ports).toEqual([]);
    expect(execCalls).toHaveLength(0);
  });

  it('should return ports for all startable services', async () => {
    const mockExec = createMockExec();

    const services: ResolvedService[] = [
      {
        name: 'sudocode',
        type: 'service',
        install: '',
        start: 'nohup sudocode server --port 3000',
        port: 3000,
      },
      {
        name: 'claude-code',
        type: 'tool',
        install: 'npm install -g @anthropic-ai/claude-code',
      },
    ];

    const ports = await startServices('my-cs', mockExec, services);

    // Only sudocode has start + port
    expect(ports).toEqual([3000]);
  });
});

// ============================================================================
// setupTailscale
// ============================================================================

describe('setupTailscale', () => {
  let execCalls: Array<{ name: string; command: string; options?: object }>;

  /**
   * Create a mock exec that returns specific responses based on command substrings.
   * Commands not matching any pattern return exitCode 0.
   */
  function createMockExec(
    responses: Record<string, Partial<{ exitCode: number; stdout: string; stderr: string }>> = {},
  ): ExecFn {
    return vi.fn(async (name: string, command: string, options?: object) => {
      execCalls.push({ name, command, options });
      for (const [pattern, result] of Object.entries(responses)) {
        if (command.includes(pattern)) {
          return { exitCode: 0, stdout: '', stderr: '', ...result };
        }
      }
      return { exitCode: 0, stdout: '', stderr: '' };
    });
  }

  beforeEach(() => {
    execCalls = [];
  });

  // ── Tier 3: Not installed ──

  it('tier 3: should install, start daemon, and join when tailscale is not installed', async () => {
    const mockExec = createMockExec({
      'which tailscale': { exitCode: 1, stderr: 'tailscale not found' },
    });

    const result = await setupTailscale('my-cs', mockExec, {
      authKey: 'tskey-auth-abc123',
    });

    expect(result.tier).toBe('installed');
    expect(result.hostname).toBe('my-cs');

    const commands = execCalls.map((c) => c.command);

    // Probe
    expect(commands[0]).toBe('which tailscale');

    // Remove broken apt repos
    expect(commands).toContainEqual(
      expect.stringContaining('rm -f /etc/apt/sources.list.d/yarn.list'),
    );

    // Install
    expect(commands).toContainEqual(
      expect.stringContaining('tailscale.com/install.sh'),
    );

    // Start daemon (state dir defaults to /workspaces/.tailscale)
    expect(commands).toContainEqual(
      expect.stringContaining('sudo mkdir -p /workspaces/.tailscale'),
    );
    expect(commands).toContainEqual(
      expect.stringContaining('sudo tailscaled'),
    );

    // Join
    const upCmd = commands.find((c) => c.includes('tailscale up'));
    expect(upCmd).toContain('--authkey=tskey-auth-abc123');
    expect(upCmd).toContain('--accept-dns=false');
    expect(upCmd).toContain('--hostname=my-cs');
  });

  it('tier 3: should use 120s timeout for install', async () => {
    const mockExec = createMockExec({
      'which tailscale': { exitCode: 1 },
    });

    await setupTailscale('my-cs', mockExec, { authKey: 'tskey-abc' });

    const installCall = execCalls.find((c) => c.command.includes('install.sh'));
    expect(installCall?.options).toEqual(expect.objectContaining({ timeout: 120_000 }));
  });

  // ── Tier 2: Installed but daemon not running ──

  it('tier 2: should start daemon and join when daemon is not running', async () => {
    const mockExec = createMockExec({
      'which tailscale': { exitCode: 0, stdout: '/usr/bin/tailscale\n' },
      'tailscale status': { exitCode: 1, stderr: 'failed to connect to local tailscaled' },
    });

    const result = await setupTailscale('my-cs', mockExec, {
      authKey: 'tskey-auth-abc123',
    });

    expect(result.tier).toBe('started-daemon');

    const commands = execCalls.map((c) => c.command);

    // Should NOT install
    expect(commands.every((c) => !c.includes('install.sh'))).toBe(true);
    expect(commands.every((c) => !c.includes('yarn.list'))).toBe(true);

    // Should start daemon
    expect(commands).toContainEqual(
      expect.stringContaining('sudo tailscaled'),
    );

    // Should join
    const upCmd = commands.find((c) => c.includes('tailscale up'));
    expect(upCmd).toContain('--authkey=tskey-auth-abc123');
  });

  // ── Tier 1: Already installed and running ──

  it('tier 1: should only run tailscale up when already running', async () => {
    const mockExec = createMockExec({
      'which tailscale': { exitCode: 0, stdout: '/usr/bin/tailscale\n' },
      'tailscale status': { exitCode: 0, stdout: '100.64.0.1 my-cs ...\n' },
    });

    const result = await setupTailscale('my-cs', mockExec, {
      authKey: 'tskey-auth-abc123',
    });

    expect(result.tier).toBe('already-running');

    const commands = execCalls.map((c) => c.command);

    // Should NOT install or start daemon
    expect(commands.every((c) => !c.includes('install.sh'))).toBe(true);
    expect(commands.every((c) => !c.includes('sudo tailscaled'))).toBe(true);
    expect(commands.every((c) => !c.includes('sudo mkdir'))).toBe(true);

    // Should have: which, status, tailscale up
    expect(commands).toHaveLength(3);
    expect(commands[0]).toBe('which tailscale');
    expect(commands[1]).toContain('tailscale status');
    expect(commands[2]).toContain('sudo tailscale up');
  });

  it('tier 1: should treat NeedsLogin as daemon-running', async () => {
    const mockExec = createMockExec({
      'which tailscale': { exitCode: 0 },
      'tailscale status': { exitCode: 1, stderr: 'NeedsLogin' },
    });

    const result = await setupTailscale('my-cs', mockExec, {
      authKey: 'tskey-abc',
    });

    expect(result.tier).toBe('already-running');
  });

  it('tier 1: should treat Stopped as daemon-running', async () => {
    const mockExec = createMockExec({
      'which tailscale': { exitCode: 0 },
      'tailscale status': { exitCode: 1, stdout: 'Stopped' },
    });

    const result = await setupTailscale('my-cs', mockExec, {
      authKey: 'tskey-abc',
    });

    expect(result.tier).toBe('already-running');
  });

  // ── Control server ──

  it('should include --login-server when controlServer is provided', async () => {
    const mockExec = createMockExec({
      'which tailscale': { exitCode: 0 },
      'tailscale status': { exitCode: 0 },
    });

    await setupTailscale('my-cs', mockExec, {
      authKey: 'tskey-abc',
      controlServer: 'https://headscale.company.com',
    });

    const upCmd = execCalls.map((c) => c.command).find((c) => c.includes('tailscale up'));
    expect(upCmd).toContain('--login-server=https://headscale.company.com');
  });

  it('should NOT include --login-server when controlServer is omitted', async () => {
    const mockExec = createMockExec({
      'which tailscale': { exitCode: 0 },
      'tailscale status': { exitCode: 0 },
    });

    await setupTailscale('my-cs', mockExec, { authKey: 'tskey-abc' });

    const upCmd = execCalls.map((c) => c.command).find((c) => c.includes('tailscale up'));
    expect(upCmd).not.toContain('--login-server');
  });

  // ── Hostname ──

  it('should use the codespace name as the tailnet hostname', async () => {
    const mockExec = createMockExec({
      'which tailscale': { exitCode: 0 },
      'tailscale status': { exitCode: 0 },
    });

    await setupTailscale('my-specific-codespace', mockExec, { authKey: 'tskey-abc' });

    const upCmd = execCalls.map((c) => c.command).find((c) => c.includes('tailscale up'));
    expect(upCmd).toContain('--hostname=my-specific-codespace');
  });

  // ── Error handling ──

  it('should throw ExecutionError when install script fails', async () => {
    const mockExec = createMockExec({
      'which tailscale': { exitCode: 1 },
      'install.sh': { exitCode: 1, stderr: 'curl failed' },
    });

    await expect(
      setupTailscale('my-cs', mockExec, { authKey: 'tskey-abc' }),
    ).rejects.toThrow(ExecutionError);
  });

  it('should throw ExecutionError when tailscale up fails', async () => {
    const mockExec = createMockExec({
      'which tailscale': { exitCode: 0 },
      'tailscale status': { exitCode: 0 },
      'tailscale up': { exitCode: 1, stderr: 'auth key expired' },
    });

    await expect(
      setupTailscale('my-cs', mockExec, { authKey: 'tskey-expired' }),
    ).rejects.toThrow(ExecutionError);
  });

  // ── Codespace name passthrough ──

  it('should pass the codespace name to all exec calls', async () => {
    const mockExec = createMockExec({
      'which tailscale': { exitCode: 1 },
    });

    await setupTailscale('specific-cs', mockExec, { authKey: 'tskey-abc' });

    for (const call of execCalls) {
      expect(call.name).toBe('specific-cs');
    }
  });
});
