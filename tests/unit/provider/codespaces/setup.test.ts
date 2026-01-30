/**
 * Codespaces Setup Utilities Unit Tests
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  installSudocode,
  applySetupConfig,
} from '../../../../src/provider/codespaces/setup.js';
import type { ExecFn } from '../../../../src/provider/codespaces/setup.js';
import type { SetupConfig } from '../../../../src/provider/types.js';

describe('installSudocode', () => {
  let mockExec: ExecFn;
  let execCalls: Array<{ name: string; command: string }>;

  beforeEach(() => {
    execCalls = [];
    mockExec = vi.fn(async (name: string, command: string) => {
      execCalls.push({ name, command });
      return { exitCode: 0, stdout: '', stderr: '' };
    });
  });

  it('should run nvm setup, install, and init in a single chained command', async () => {
    await installSudocode('my-cs', mockExec);

    // All steps chained in one exec call to avoid cross-session PATH issues
    expect(execCalls).toHaveLength(1);
    const cmd = execCalls[0].command;
    expect(cmd).toContain('source /usr/local/share/nvm/nvm.sh');
    expect(cmd).toContain('nvm alias default 22');
    expect(cmd).toContain('nvm use 22');
    expect(cmd).toContain('npm install -g sudocode');
    expect(cmd).toContain('sudocode init');
    // All chained with &&
    expect(cmd.split(' && ')).toHaveLength(5);
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
      models: { claudeLtt: 'test-token-123' },
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

  it('should install agents in order', async () => {
    const setup: SetupConfig = {
      agents: { install: ['claude', 'cursor'] },
    };

    await applySetupConfig('my-cs', mockExec, setup);

    expect(execCalls[0]).toEqual({
      name: 'my-cs',
      command: 'sudocode agent install claude',
    });
    expect(execCalls[1]).toEqual({
      name: 'my-cs',
      command: 'sudocode agent install cursor',
    });
  });

  it('should skip agents when none specified', async () => {
    await applySetupConfig('my-cs', mockExec, {});

    expect(
      execCalls.every((c) => !c.command.includes('agent install'))
    ).toBe(true);
  });

  it('should skip agents when install array is empty', async () => {
    const setup: SetupConfig = {
      agents: { install: [] },
    };

    await applySetupConfig('my-cs', mockExec, setup);

    expect(
      execCalls.every((c) => !c.command.includes('agent install'))
    ).toBe(true);
  });

  it('should configure Tailscale with auth key', async () => {
    const setup: SetupConfig = {
      tailscale: { authKey: 'tskey-auth-abc123' },
    };

    await applySetupConfig('my-cs', mockExec, setup);

    expect(execCalls[0].command).toBe(
      'curl -fsSL https://tailscale.com/install.sh | sh'
    );
    expect(execCalls[1].command).toBe(
      'tailscale up --authkey=tskey-auth-abc123'
    );
  });

  it('should include control server for self-hosted Headscale', async () => {
    const setup: SetupConfig = {
      tailscale: {
        authKey: 'tskey-auth-abc123',
        controlServer: 'https://headscale.company.com',
      },
    };

    await applySetupConfig('my-cs', mockExec, setup);

    expect(execCalls[1].command).toBe(
      'tailscale up --authkey=tskey-auth-abc123 --login-server=https://headscale.company.com'
    );
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
      models: { claudeLtt: 'token-123' },
      agents: { install: ['claude'] },
      tailscale: { authKey: 'tskey-abc' },
      setupScript: 'echo done',
    };

    await applySetupConfig('my-cs', mockExec, setup);

    const commands = execCalls.map((c) => c.command);

    // 1. Model credentials
    expect(commands[0]).toContain('mkdir -p ~/.claude');
    expect(commands[1]).toContain('.credentials.json');

    // 2. Agents
    expect(commands[2]).toBe('sudocode agent install claude');

    // 3. Tailscale
    expect(commands[3]).toContain('tailscale.com/install.sh');
    expect(commands[4]).toContain('tailscale up');

    // 4. User script
    expect(commands[5]).toBe('echo done');
  });

  it('should pass the codespace name to all exec calls', async () => {
    const setup: SetupConfig = {
      models: { claudeLtt: 'tok' },
      agents: { install: ['claude'] },
      setupScript: 'echo hi',
    };

    await applySetupConfig('specific-cs-name', mockExec, setup);

    for (const call of execCalls) {
      expect(call.name).toBe('specific-cs-name');
    }
  });
});
