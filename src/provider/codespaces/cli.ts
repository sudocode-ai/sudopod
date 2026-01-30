/**
 * GitHub Codespaces CLI Wrapper
 *
 * Low-level `gh` CLI wrapper for codespace lifecycle management,
 * remote command execution, and port forwarding.
 *
 * All functions shell out to the `gh` CLI via child_process.exec.
 * The consuming Provider class handles mapping these results to
 * the unified Workspace type.
 *
 * @see i-1f59 - Port Codespaces CLI utilities from deprecated code
 * @see s-84xz - Codespaces Provider Implementation specification
 */

import { exec } from 'node:child_process';
import { promisify } from 'node:util';

// All functions use execAsync — the promisified form of exec.
const execAsync = promisify(exec);

// ============================================================================
// Types
// ============================================================================

/**
 * Result of executing a command in a codespace via SSH.
 */
export interface ExecResult {
  exitCode: number;
  stdout: string;
  stderr: string;
}

/**
 * Codespace info as returned by the gh CLI (JSON output).
 */
export interface GhCodespace {
  name: string;
  state: string;
  repository: string;
  createdAt: string;
  lastUsedAt?: string;
}

/**
 * Port info as returned by `gh codespace ports --json`.
 */
export interface GhPort {
  sourcePort: number;
  browseUrl: string;
}

// ============================================================================
// Remote Execution
// ============================================================================

/**
 * Execute a command in a codespace via SSH using a login shell.
 *
 * Uses base64 encoding to avoid all quoting/escaping issues when passing
 * commands through SSH. The command is decoded and executed inside a
 * `bash -l -c` login shell for proper environment setup.
 *
 * @param name - Codespace name
 * @param command - Command to execute
 * @param options - Execution options
 * @returns ExecResult with exitCode, stdout, stderr
 */
export async function execInCodespace(
  name: string,
  command: string,
  options?: { background?: boolean }
): Promise<ExecResult> {
  const background = options?.background ?? false;

  // Base64 encode to avoid all quoting issues (quotes, dollars, backticks, etc.)
  const encoded = Buffer.from(command).toString('base64');

  // For background commands, the & goes OUTSIDE the SSH quotes so the entire
  // SSH session returns immediately. The inner command should use nohup to
  // persist after SSH disconnects. Pattern from deprecated codespaces code:
  //   gh codespace ssh -- "bash -l -c \"...\" &"
  const sshCommand = background
    ? `gh codespace ssh -c ${name} -- "bash -l -c \\"echo ${encoded} | base64 -d | bash\\" &"`
    : `gh codespace ssh -c ${name} -- "bash -l -c \\"echo ${encoded} | base64 -d | bash\\""`;

  try {
    const { stdout, stderr } = await execAsync(sshCommand, {
      timeout: background ? 10_000 : 120_000,
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

// ============================================================================
// Lifecycle
// ============================================================================

/**
 * Create a new GitHub Codespace.
 *
 * @returns The codespace name (string output from gh CLI).
 */
export async function createCodespace(
  repo: string,
  branch: string,
  machine: string,
  retentionDays: number
): Promise<string> {
  // gh CLI expects Go duration format (e.g. "24h"), not "1d"
  const retentionHours = retentionDays * 24;
  const { stdout } = await execAsync(
    `gh codespace create --repo ${repo} --branch ${branch} --machine ${machine} --retention-period ${retentionHours}h`,
    { timeout: 300_000 }
  );
  return stdout.trim();
}

/**
 * Start a stopped codespace.
 */
export async function startCodespace(name: string): Promise<void> {
  await execAsync(`gh codespace start -c ${name}`, { timeout: 120_000 });
}

/**
 * Stop a running codespace.
 */
export async function stopCodespace(name: string): Promise<void> {
  await execAsync(`gh codespace stop -c ${name}`, { timeout: 60_000 });
}

/**
 * Delete a codespace (force).
 */
export async function deleteCodespace(name: string): Promise<void> {
  await execAsync(`gh codespace delete -c ${name} --force`, {
    timeout: 60_000,
  });
}

// ============================================================================
// Query
// ============================================================================

/**
 * Get info about a specific codespace.
 *
 * @returns Codespace info, or null if not found.
 */
export async function getCodespace(
  name: string
): Promise<GhCodespace | null> {
  try {
    const { stdout } = await execAsync(
      `gh codespace view -c ${name} --json name,state,repository,createdAt,lastUsedAt`,
      { timeout: 30_000 }
    );
    return JSON.parse(stdout) as GhCodespace;
  } catch {
    return null;
  }
}

/**
 * List all codespaces for the authenticated user.
 */
export async function listCodespaces(): Promise<GhCodespace[]> {
  const { stdout } = await execAsync(
    'gh codespace list --json name,state,repository,createdAt,lastUsedAt',
    { timeout: 30_000 }
  );
  return JSON.parse(stdout) as GhCodespace[];
}

// ============================================================================
// Port Forwarding
// ============================================================================

/**
 * Register a codespace port with GitHub's forwarding system.
 *
 * Spawns a `gh codespace ports forward` process, waits briefly for the port
 * to register, then kills the process. The port remains registered with
 * GitHub after the forward process exits.
 *
 * Handles local port conflicts by incrementing the local port until an
 * available one is found (tries up to 20 ports). The local port doesn't
 * matter for registration — only the remote codespace port matters.
 *
 * @param name - Codespace name
 * @param port - Remote codespace port to register
 */
export async function forwardPort(
  name: string,
  port: number
): Promise<void> {
  let localPort = port;
  const maxAttempts = 20;

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const forwardProcess = exec(
      `gh codespace ports forward ${port}:${localPort} -c ${name}`
    );

    // Collect stderr to detect local port conflicts
    let stderr = '';
    if (forwardProcess.stderr) {
      forwardProcess.stderr.on('data', (data: Buffer) => {
        stderr += data.toString();
      });
    }

    // Wait for the port to register with GitHub's forwarding system
    await new Promise((resolve) => setTimeout(resolve, 2_000));

    // Check if we hit a local port conflict
    if (stderr.includes('address already in use')) {
      if (forwardProcess.pid) {
        try { process.kill(forwardProcess.pid); } catch { /* already dead */ }
      }
      localPort++;
      continue;
    }

    // Success — kill the forward process (port stays registered)
    if (forwardProcess.pid) {
      try { process.kill(forwardProcess.pid); } catch { /* already dead */ }
    }
    return;
  }

  throw new Error(
    `Failed to forward port ${port}: no available local port after ${maxAttempts} attempts`
  );
}

/**
 * Get the public browse URL for a forwarded codespace port.
 *
 * Queries GitHub's port forwarding system for the public URL. The port
 * must have been registered via `forwardPort` first.
 *
 * @param name - Codespace name
 * @param port - Remote codespace port
 * @returns The public browse URL (e.g. https://name-3000.app.github.dev)
 */
export async function getPortUrl(
  name: string,
  port: number
): Promise<string> {
  const ports = await getPorts(name);
  const match = ports.find((p) => p.sourcePort === port);
  if (!match) {
    throw new Error(`Port ${port} not found in codespace ${name}`);
  }
  return match.browseUrl;
}

/**
 * Get all forwarded ports for a codespace.
 */
export async function getPorts(name: string): Promise<GhPort[]> {
  const { stdout } = await execAsync(
    `gh codespace ports -c ${name} --json sourcePort,browseUrl`,
    { timeout: 30_000 }
  );
  return JSON.parse(stdout) as GhPort[];
}
