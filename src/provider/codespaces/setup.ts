/**
 * Codespaces Setup Utilities
 *
 * One-time setup operations applied during workspace creation.
 * Handles installing sudocode, configuring model credentials,
 * installing agents, setting up Tailscale, and running user setup scripts.
 *
 * @see i-3rzw - Port and update codespace setup utilities
 * @see s-84xz - Codespaces Provider Implementation specification
 */

import type { SetupConfig } from '../types.js';
import type { ExecResult } from './cli.js';
import { ExecutionError } from '../errors.js';

/**
 * Function signature for executing commands in a codespace.
 * Decoupled from the CLI module for testability.
 */
export type ExecFn = (
  name: string,
  command: string,
  options?: { background?: boolean; timeout?: number }
) => Promise<ExecResult>;

/**
 * Which setup path was taken by setupTailscale.
 * - 'already-running': Tailscale binary exists and daemon is running (tier 1)
 * - 'started-daemon': Tailscale binary exists but daemon was not running (tier 2)
 * - 'installed': Tailscale was not installed; full install performed (tier 3)
 */
export type TailscaleTier = 'already-running' | 'started-daemon' | 'installed';

export interface TailscaleSetupResult {
  tier: TailscaleTier;
  hostname: string;
}

interface TailscaleConfig {
  authKey: string;
  controlServer?: string;
}

/**
 * Execute a command and throw if it fails.
 */
async function execOrThrow(
  exec: ExecFn,
  name: string,
  command: string,
  options?: { timeout?: number }
): Promise<ExecResult> {
  const result = await exec(name, command, options);
  if (result.exitCode !== 0) {
    throw new ExecutionError('codespaces', command, result.exitCode, result.stderr);
  }
  return result;
}

/**
 * Install sudocode globally and initialize it.
 *
 * Unconditional prerequisite for every codespace — runs during create()
 * regardless of whether SetupConfig is provided.
 *
 * @param codespaceName - The codespace name
 * @param exec - Function to execute commands in the codespace
 */
export async function installSudocode(
  codespaceName: string,
  exec: ExecFn
): Promise<void> {
  await execOrThrow(exec, codespaceName, 'npm install -g sudocode', {
    timeout: 300_000, // 5 minutes — npm install with native deps can be slow
  });
  await execOrThrow(exec, codespaceName, 'sudocode init');
}

/**
 * Apply optional one-time setup configuration to a newly created codespace.
 *
 * Called after installSudocode(). Executes the following steps in order:
 * 1. Configure model credentials (Anthropic/Claude)
 * 2. Install agents
 * 3. Configure Tailscale (if specified)
 * 4. Run user setup script
 *
 * @param codespaceName - The codespace name
 * @param exec - Function to execute commands in the codespace
 * @param setup - Setup configuration
 */
export async function applySetupConfig(
  codespaceName: string,
  exec: ExecFn,
  setup: SetupConfig
): Promise<void> {
  // 1. Configure model credentials
  if (setup.models?.claudeLtt) {
    await exec(codespaceName, 'mkdir -p ~/.claude ~/.config/claude');
    const creds = JSON.stringify({
      claudeAiOauth: {
        accessToken: setup.models.claudeLtt,
        refreshToken: setup.models.claudeLtt,
        expiresAt: 9999999999999,
        scopes: ['user:inference', 'user:profile'],
      },
    });
    const encoded = Buffer.from(creds).toString('base64');
    await exec(
      codespaceName,
      `echo "${encoded}" | base64 -d > ~/.claude/.credentials.json`
    );
  }

  // 2. Install agents
  if (setup.agents?.install?.length) {
    for (const agent of setup.agents.install) {
      await exec(codespaceName, `sudocode agent install ${agent}`);
    }
  }

  // 3. Configure Tailscale
  if (setup.tailscale) {
    await setupTailscale(codespaceName, exec, {
      authKey: setup.tailscale.authKey,
      controlServer: setup.tailscale.controlServer,
    });
  }

  // 4. Run user setup script
  if (setup.setupScript) {
    await exec(codespaceName, setup.setupScript);
  }
}

// ============================================================================
// Tailscale Setup
// ============================================================================

/**
 * Build the `tailscale up` command string with all required flags.
 */
function buildTailscaleUpArgs(
  codespaceName: string,
  config: TailscaleConfig,
): string {
  const args = [
    'sudo tailscale up',
    `--authkey=${config.authKey}`,
    '--accept-dns=false',
    `--hostname=${codespaceName}`,
  ];
  if (config.controlServer) {
    args.push(`--login-server=${config.controlServer}`);
  }
  return args.join(' ');
}

/**
 * Start the tailscaled daemon manually (codespaces lack systemd).
 * Creates state/socket directories, starts the daemon in background,
 * and waits for it to be ready.
 */
async function startTailscaleDaemon(
  codespaceName: string,
  exec: ExecFn,
): Promise<void> {
  await execOrThrow(
    exec,
    codespaceName,
    'sudo mkdir -p /var/lib/tailscale /var/run/tailscale',
  );

  // Start daemon in background — use raw exec since backgrounded
  // processes may return unusual exit codes
  await exec(
    codespaceName,
    'sudo tailscaled --state=/var/lib/tailscale/tailscaled.state --socket=/var/run/tailscale/tailscaled.sock &',
  );

  // Wait for daemon to be ready (validated: 3s is sufficient on default images)
  await exec(codespaceName, 'sleep 3');
}

/**
 * Set up Tailscale in a codespace using progressive detection.
 *
 * Tier 1 (already-running): Binary exists and daemon is running — just `tailscale up`.
 * Tier 2 (started-daemon): Binary exists but daemon not running — start daemon, then join.
 * Tier 3 (installed): Not installed — remove broken apt repos, install, start daemon, join.
 *
 * Users who bake Tailscale into their devcontainer image get the fastest path (tier 1 or 2).
 * The default codespace image gets the full install (tier 3).
 *
 * @param codespaceName - Codespace name (also used as tailnet hostname)
 * @param exec - Function to execute commands in the codespace
 * @param config - Tailscale auth key and optional control server URL
 */
export async function setupTailscale(
  codespaceName: string,
  exec: ExecFn,
  config: TailscaleConfig,
): Promise<TailscaleSetupResult> {
  const upCmd = buildTailscaleUpArgs(codespaceName, config);

  // Probe 1: Is tailscale installed?
  const whichResult = await exec(codespaceName, 'which tailscale');

  if (whichResult.exitCode !== 0) {
    // === TIER 3: Not installed ===
    // Remove broken apt repos that block apt-get update (idempotent)
    await exec(codespaceName, 'sudo rm -f /etc/apt/sources.list.d/yarn.list');

    await execOrThrow(
      exec,
      codespaceName,
      'curl -fsSL https://tailscale.com/install.sh | sh',
      { timeout: 120_000 },
    );

    await startTailscaleDaemon(codespaceName, exec);
    await execOrThrow(exec, codespaceName, upCmd, { timeout: 30_000 });

    return { tier: 'installed', hostname: codespaceName };
  }

  // Probe 2: Is the daemon running?
  const statusResult = await exec(codespaceName, 'sudo tailscale status 2>&1', {
    timeout: 10_000,
  });
  const output = statusResult.stdout + statusResult.stderr;
  const daemonIsRunning =
    statusResult.exitCode === 0 ||
    output.includes('NeedsLogin') ||
    output.includes('Stopped');

  if (!daemonIsRunning) {
    // === TIER 2: Installed but daemon not running ===
    await startTailscaleDaemon(codespaceName, exec);
    await execOrThrow(exec, codespaceName, upCmd, { timeout: 30_000 });

    return { tier: 'started-daemon', hostname: codespaceName };
  }

  // === TIER 1: Already installed and running ===
  await execOrThrow(exec, codespaceName, upCmd, { timeout: 30_000 });

  return { tier: 'already-running', hostname: codespaceName };
}
