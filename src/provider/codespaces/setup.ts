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
import type { ResolvedService } from '../../services/registry.js';
import { getServiceDefinition, resolveService } from '../../services/registry.js';
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
  authKey?: string;
  controlServer?: string;
  stateDir?: string;
}

/**
 * Execute a command and throw if it fails.
 * Includes both stdout and stderr in the error for better diagnostics.
 */
async function execOrThrow(
  exec: ExecFn,
  name: string,
  command: string,
  options?: { timeout?: number }
): Promise<ExecResult> {
  const result = await exec(name, command, options);
  if (result.exitCode !== 0) {
    // Include stdout in error — many CLI tools (like tailscale) print
    // errors to stdout, and execInCodespace may not capture inner stderr.
    const details = [result.stderr, result.stdout].filter(Boolean).join('\n');
    throw new ExecutionError('codespaces', command, result.exitCode, details);
  }
  return result;
}

/**
 * Install sudocode globally and initialize it.
 *
 * Unconditional prerequisite for every codespace — runs during create()
 * regardless of whether SetupConfig is provided.
 *
 * Ensures Node.js >= 18 is available first, since default codespace
 * images may ship with an older version.
 *
 * @param codespaceName - The codespace name
 * @param exec - Function to execute commands in the codespace
 */
export async function installSudocode(
  codespaceName: string,
  exec: ExecFn
): Promise<void> {
  // Default codespace images ship Node 16 via nvm. Sudocode requires >=18.
  // nvm state doesn't reliably persist across separate SSH sessions
  // (bash -l -c invocations), so we chain everything in a single command.
  //
  // The nvm source step uses semicolons (not &&) so failure to find nvm
  // doesn't abort the chain — some images may have Node 20+ without nvm.
  const cmd =
    'export NVM_DIR="$HOME/.nvm"; ' +
    '[ -s "$NVM_DIR/nvm.sh" ] && . "$NVM_DIR/nvm.sh"; ' +
    'nvm install 20 2>/dev/null; nvm use 20 2>/dev/null; ' +
    'node --version && npm install -g sudocode && sudocode init';

  await execOrThrow(exec, codespaceName, cmd, {
    timeout: 300_000, // 5 minutes — npm install with native deps can be slow
  });
}

/**
 * Apply optional one-time setup configuration to a newly created codespace.
 *
 * Executes the following steps in order:
 * 1. Configure credentials (Anthropic/Claude)
 * 2. Install services from registry
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
  // 1. Configure credentials
  if (setup.credentials?.claudeLtt) {
    await exec(codespaceName, 'mkdir -p ~/.claude ~/.config/claude');
    const creds = JSON.stringify({
      claudeAiOauth: {
        accessToken: setup.credentials.claudeLtt,
        refreshToken: setup.credentials.claudeLtt,
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

  // 2. Install services from registry
  if (setup.services?.length) {
    for (const svc of setup.services) {
      const def = getServiceDefinition(svc.name);
      if (!def) {
        throw new ExecutionError('codespaces', `Unknown service: ${svc.name}`, 1, '');
      }
      // Skip services with empty install commands
      if (!def.install) continue;
      await exec(codespaceName, def.install);
    }
  }

  // 3. Configure Tailscale
  if (setup.tailscale) {
    await setupTailscale(codespaceName, exec, {
      authKey: setup.tailscale.authKey,
      controlServer: setup.tailscale.controlServer,
      stateDir: setup.tailscale.stateDir,
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
 * When authKey is omitted (reconnection from persisted state), --authkey is not included.
 */
function buildTailscaleUpArgs(
  codespaceName: string,
  config: TailscaleConfig,
): string {
  const args = [
    'sudo tailscale up',
    '--accept-dns=false',
    `--hostname=${codespaceName}`,
  ];
  if (config.authKey) {
    args.splice(1, 0, `--authkey=${config.authKey}`);
  } else {
    // Reconnection from persisted state — use --reset to avoid
    // "changing settings requires mentioning all non-default flags" error
    args.push('--reset');
  }
  if (config.controlServer) {
    args.push(`--login-server=${config.controlServer}`);
  }
  return args.join(' ');
}

/**
 * Join the tailnet with retry logic.
 *
 * `tailscale up` can fail transiently — the control server may not be
 * reachable immediately (especially with ngrok tunnels), or the daemon
 * may need a moment after socket creation before accepting commands.
 */
async function joinTailnet(
  exec: ExecFn,
  codespaceName: string,
  upCmd: string,
  maxRetries = 3,
): Promise<void> {
  let lastError: Error | undefined;
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      await execOrThrow(exec, codespaceName, upCmd, { timeout: 30_000 });
      return;
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err));
      if (attempt < maxRetries) {
        // Wait before retrying — gives daemon and network time to settle
        await exec(codespaceName, 'sleep 3');
      }
    }
  }
  throw lastError;
}

/** Default state directory — on a volume that persists across codespace stop/start. */
export const DEFAULT_STATE_DIR = '/workspaces/.tailscale';

/**
 * Start the tailscaled daemon manually (codespaces lack systemd).
 * Creates state/socket directories, starts the daemon in background,
 * and waits for the socket to appear (confirming the daemon is ready).
 *
 * @param stateDir - Directory for persisting daemon state. Defaults to /workspaces/.tailscale.
 */
async function startTailscaleDaemon(
  codespaceName: string,
  exec: ExecFn,
  stateDir: string = DEFAULT_STATE_DIR,
): Promise<void> {
  await execOrThrow(
    exec,
    codespaceName,
    `sudo mkdir -p ${stateDir} /var/run/tailscale`,
  );

  // Start daemon in background with output redirected to a log file.
  // Without redirection, tailscaled's stderr keeps the SSH pipe open and
  // prevents the session from returning.
  await exec(
    codespaceName,
    `sudo tailscaled --state=${stateDir}/tailscaled.state --socket=/var/run/tailscale/tailscaled.sock > /tmp/tailscaled.log 2>&1 &`,
  );

  // Wait for the socket to appear — confirms the daemon is ready for commands.
  const waitCmd =
    'for i in $(seq 1 20); do [ -S /var/run/tailscale/tailscaled.sock ] && break; sleep 0.5; done; ' +
    '[ -S /var/run/tailscale/tailscaled.sock ] || { echo "tailscaled socket did not appear after 10s" >&2; cat /tmp/tailscaled.log >&2; exit 1; }';

  await execOrThrow(exec, codespaceName, waitCmd, { timeout: 30_000 });
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
  const stateDir = config.stateDir ?? DEFAULT_STATE_DIR;
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

    await startTailscaleDaemon(codespaceName, exec, stateDir);
    await joinTailnet(exec, codespaceName, upCmd);

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
    await startTailscaleDaemon(codespaceName, exec, stateDir);
    await joinTailnet(exec, codespaceName, upCmd);

    return { tier: 'started-daemon', hostname: codespaceName };
  }

  // === TIER 1: Already installed and running ===
  await joinTailnet(exec, codespaceName, upCmd);

  return { tier: 'already-running', hostname: codespaceName };
}

// ============================================================================
// Service Management
// ============================================================================

/**
 * Start resolved services that are not already running.
 * Checks each service using its `check` command, starts if not running.
 * Only services with a `start` command are started (tools are install-only).
 *
 * @returns List of ports for services that were started (newly or already running).
 */
export async function startServices(
  name: string,
  exec: ExecFn,
  services: ResolvedService[],
): Promise<number[]> {
  const startedPorts: number[] = [];

  for (const svc of services) {
    if (!svc.start || !svc.port) continue;

    // Check if already running
    if (svc.check) {
      const checkResult = await exec(name, svc.check);
      if (checkResult.stdout.trim()) {
        startedPorts.push(svc.port);
        continue;
      }
    }

    // Start the service
    await exec(name, svc.start, { background: true });
    startedPorts.push(svc.port);
  }

  return startedPorts;
}
