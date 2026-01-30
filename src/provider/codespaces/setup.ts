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
  options?: { background?: boolean }
) => Promise<ExecResult>;

/**
 * Execute a command and throw if it fails.
 */
async function execOrThrow(
  exec: ExecFn,
  name: string,
  command: string
): Promise<ExecResult> {
  const result = await exec(name, command);
  if (result.exitCode !== 0) {
    throw new ExecutionError('codespaces', command, result.exitCode, result.stderr);
  }
  return result;
}

/**
 * Install sudocode globally and initialize it.
 *
 * This is an unconditional prerequisite for every codespace — it runs
 * during create() regardless of whether SetupConfig is provided.
 * The runtime flow (sudocode server, keepalive, port forwarding) depends
 * on sudocode being installed.
 *
 * Switches to Node 22 LTS first because sudocode depends on better-sqlite3,
 * which requires prebuilt native bindings that may not be available on
 * newer Node versions (e.g., Node 24 ships with codespaces by default).
 *
 * @param codespaceName - The codespace name
 * @param exec - Function to execute commands in the codespace
 */
export async function installSudocode(
  codespaceName: string,
  exec: ExecFn
): Promise<void> {
  // Run all install steps in a SINGLE SSH session to avoid nvm/PATH issues.
  // Each execInCodespace call opens a new SSH session. nvm state (alias, PATH)
  // set in one session may not be available in the next, causing "command not
  // found" errors. By chaining everything, we ensure the Node 22 environment
  // is active for both npm install and sudocode init.
  await execOrThrow(
    exec,
    codespaceName,
    [
      // Pin to Node 22 LTS — better-sqlite3 native bindings need it
      'source /usr/local/share/nvm/nvm.sh',
      'nvm alias default 22',
      'nvm use 22',
      'npm install -g sudocode',
      'sudocode init',
    ].join(' && ')
  );
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
    await exec(
      codespaceName,
      'curl -fsSL https://tailscale.com/install.sh | sh'
    );
    const args = ['tailscale up', `--authkey=${setup.tailscale.authKey}`];
    if (setup.tailscale.controlServer) {
      args.push(`--login-server=${setup.tailscale.controlServer}`);
    }
    await exec(codespaceName, args.join(' '));
  }

  // 4. Run user setup script
  if (setup.setupScript) {
    await exec(codespaceName, setup.setupScript);
  }
}
