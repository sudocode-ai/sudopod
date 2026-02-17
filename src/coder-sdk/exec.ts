/**
 * Coder Remote Execution
 *
 * ExecFn implementation using `coder ssh` for remote command execution.
 * Follows the same base64-encoding pattern as codespaces/cli.ts to avoid
 * quoting/escaping issues when passing commands through SSH.
 *
 * @see s-9uap - sudopod-coder-sdk specification
 */

import { exec } from 'node:child_process';
import { promisify } from 'node:util';
import type { ExecResult, ExecFn } from '../provider/types.js';

const execAsync = promisify(exec);

// ============================================================================
// Types
// ============================================================================

export interface CoderExecConfig {
  coderUrl: string;
  coderToken: string;
}

// ============================================================================
// Public API
// ============================================================================

/**
 * Create an ExecFn bound to a specific Coder instance.
 * The returned function is compatible with all shared setup/manifest functions.
 */
export function createCoderExecFn(config: CoderExecConfig): ExecFn {
  return (name, command, options) =>
    execInCoderWorkspace(name, command, config, options);
}

// ============================================================================
// Internal
// ============================================================================

/**
 * Execute a command in a Coder workspace via `coder ssh`.
 *
 * Uses base64 encoding to avoid all quoting issues (same pattern as
 * codespaces/cli.ts). CODER_URL and CODER_SESSION_TOKEN are passed as env vars
 * so the coder CLI authenticates without requiring a session file.
 */
async function execInCoderWorkspace(
  name: string,
  command: string,
  config: CoderExecConfig,
  options?: { background?: boolean; timeout?: number },
): Promise<ExecResult> {
  const background = options?.background ?? false;
  const encoded = Buffer.from(command).toString('base64');

  const env = {
    ...process.env,
    CODER_URL: config.coderUrl,
    CODER_SESSION_TOKEN: config.coderToken,
  };

  // The remote command must be wrapped in outer quotes so shell pipes inside
  // the -c argument aren't interpreted by the local shell. Inner quotes are
  // escaped so they survive to the remote shell.
  // For background commands, the & goes INSIDE the outer quotes so the remote
  // shell backgrounds the process and the SSH session returns immediately.
  const sshCommand = background
    ? `coder ssh ${name} -- "bash -l -c \\"echo ${encoded} | base64 -d | bash\\" &"`
    : `coder ssh ${name} -- "bash -l -c \\"echo ${encoded} | base64 -d | bash\\""`;


  const defaultTimeout = background ? 10_000 : 120_000;

  try {
    const { stdout, stderr } = await execAsync(sshCommand, {
      timeout: options?.timeout ?? defaultTimeout,
      env,
    });
    return { exitCode: 0, stdout, stderr };
  } catch (error: unknown) {
    // child_process.exec rejects on non-zero exit codes — extract details
    const err = error as {
      code?: number;
      stdout?: string;
      stderr?: string;
      message?: string;
    };

    // For background commands, a non-zero exit is expected (SSH session
    // exits before the background process completes). Treat as success.
    if (background) {
      return { exitCode: 0, stdout: err.stdout ?? '', stderr: err.stderr ?? '' };
    }

    return {
      exitCode: err.code ?? 1,
      stdout: err.stdout ?? '',
      stderr: err.stderr ?? err.message ?? '',
    };
  }
}
