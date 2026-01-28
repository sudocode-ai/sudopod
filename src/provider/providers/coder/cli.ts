/**
 * Coder CLI Wrapper
 *
 * Wraps the `coder` CLI for SSH and execution operations.
 *
 * @see s-6q31 - Coder Provider Implementation specification
 * @see i-4dbf - Implement Coder CLI wrapper issue
 */

import { exec } from 'node:child_process';
import { promisify } from 'node:util';

const execAsync = promisify(exec);

// ============================================================================
// Types
// ============================================================================

/**
 * Result of executing a command in a workspace.
 */
export interface ExecResult {
  exitCode: number;
  stdout: string;
  stderr: string;
}

/**
 * Options for executing commands in a workspace.
 */
export interface ExecOptions {
  /**
   * Run the command in the background (detached).
   * Uses nohup and redirects output to /dev/null.
   */
  background?: boolean;

  /**
   * Timeout for the command in milliseconds.
   * Default: 60000 (1 minute)
   */
  timeoutMs?: number;

  /**
   * Working directory for the command.
   */
  cwd?: string;
}

// ============================================================================
// CLI Functions
// ============================================================================

/**
 * Configure the `coder` CLI to use a specific Coder instance.
 *
 * Runs `coder login {url} --token {token}` to configure the CLI.
 * This stores the session in the CLI's config file (~/.config/coderv2).
 *
 * @param url - Coder instance URL
 * @param token - Coder session token
 * @throws Error if CLI configuration fails
 */
export async function configureCli(url: string, token: string): Promise<void> {
  try {
    await execAsync(`coder login ${url} --token ${token}`, {
      timeout: 30000,
    });
  } catch (error: unknown) {
    const execError = error as { message?: string; stderr?: string };
    throw new Error(
      `Failed to configure coder CLI: ${execError.stderr ?? execError.message}`
    );
  }
}

/**
 * Execute a command inside a Coder workspace via SSH.
 *
 * Uses `coder ssh {workspace} -- {command}` for simple commands or
 * `coder ssh {workspace} -- bash -c "{command}"` for complex commands.
 * For background commands, uses nohup and output redirection.
 *
 * @param workspaceName - Name of the workspace (not the ID)
 * @param command - Command to execute
 * @param options - Execution options
 * @returns ExecResult with exitCode, stdout, and stderr
 */
export async function execInWorkspace(
  workspaceName: string,
  command: string,
  options: ExecOptions = {}
): Promise<ExecResult> {
  const { background = false, timeoutMs = 60000, cwd } = options;

  // Build the full command with optional cwd prefix
  // Note: We don't use escapeShellArg here because the full command will be
  // passed to bash -c which handles its own escaping
  let fullCommand: string;
  if (cwd) {
    // For cwd, we use double quotes which work better inside bash -c
    fullCommand = `cd "${cwd}" && ${command}`;
  } else {
    fullCommand = command;
  }

  // Build the SSH command
  // For complex commands (with pipes, redirects, &&, ||, etc.) or background,
  // we need to wrap in bash -c. The entire bash -c '...' is passed as a single
  // argument to SSH.
  let sshCommand: string;
  const needsBashWrapper =
    background ||
    cwd ||
    /[|&;<>()]/.test(fullCommand) ||
    fullCommand.includes('&&') ||
    fullCommand.includes('||');

  if (needsBashWrapper) {
    // Escape single quotes for bash -c '...'
    const escapedCommand = fullCommand.replace(/'/g, "'\"'\"'");
    if (background) {
      sshCommand = `coder ssh ${workspaceName} -- "bash -c 'nohup ${escapedCommand} > /dev/null 2>&1 &'"`;
    } else {
      sshCommand = `coder ssh ${workspaceName} -- "bash -c '${escapedCommand}'"`;
    }
  } else {
    // Simple command - pass directly
    sshCommand = `coder ssh ${workspaceName} -- ${fullCommand}`;
  }

  try {
    const { stdout, stderr } = await execAsync(sshCommand, {
      timeout: timeoutMs,
      maxBuffer: 10 * 1024 * 1024, // 10MB buffer
    });

    return {
      exitCode: 0,
      stdout,
      stderr,
    };
  } catch (error: unknown) {
    const execError = error as {
      code?: number;
      stdout?: string;
      stderr?: string;
      message?: string;
    };

    return {
      exitCode: execError.code ?? 1,
      stdout: execError.stdout ?? '',
      stderr: execError.stderr ?? execError.message ?? 'Unknown error',
    };
  }
}

/**
 * Bump (extend) a workspace deadline using the coder CLI.
 *
 * Uses `coder bump {workspace} {hours}h` to extend the workspace deadline.
 * This is typically called from within the workspace itself where
 * $CODER_WORKSPACE_NAME is available.
 *
 * @param workspaceName - Name of the workspace
 * @param hours - Hours to extend (e.g., 2 for 2 hours)
 * @throws Error if bump command fails
 */
export async function bumpWorkspace(
  workspaceName: string,
  hours: number
): Promise<void> {
  try {
    await execAsync(`coder bump ${workspaceName} ${hours}h`, {
      timeout: 30000,
    });
  } catch (error: unknown) {
    const execError = error as { message?: string; stderr?: string };
    throw new Error(
      `Failed to bump workspace ${workspaceName}: ${execError.stderr ?? execError.message}`
    );
  }
}

/**
 * Check if a process is running in the workspace.
 *
 * @param workspaceName - Name of the workspace
 * @param pattern - Pattern to search for (passed to pgrep -f)
 * @returns true if process is running, false otherwise
 */
export async function isProcessRunning(
  workspaceName: string,
  pattern: string
): Promise<boolean> {
  // Escape double quotes in the pattern for use in the command
  const escapedPattern = pattern.replace(/"/g, '\\"');
  // Use grep -v to exclude the grep/pgrep process itself
  const result = await execInWorkspace(
    workspaceName,
    `ps aux | grep -F "${escapedPattern}" | grep -v grep | grep -v "bash -c" | head -1 | wc -l | tr -d ' '`
  );

  const count = parseInt(result.stdout.trim(), 10);
  return count > 0;
}

/**
 * Write content to a file in the workspace.
 *
 * Uses base64 encoding to safely transfer the content.
 *
 * @param workspaceName - Name of the workspace
 * @param filePath - Path to write the file
 * @param content - Content to write
 * @param options - Additional options
 */
export async function writeFile(
  workspaceName: string,
  filePath: string,
  content: string,
  options: { executable?: boolean } = {}
): Promise<void> {
  const encoded = Buffer.from(content).toString('base64');

  // Ensure directory exists
  const dir = filePath.substring(0, filePath.lastIndexOf('/'));
  if (dir) {
    await execInWorkspace(workspaceName, `mkdir -p ${escapeShellArg(dir)}`);
  }

  // Write file using base64 decode
  const result = await execInWorkspace(
    workspaceName,
    `echo "${encoded}" | base64 -d > ${escapeShellArg(filePath)}`
  );

  if (result.exitCode !== 0) {
    throw new Error(`Failed to write file ${filePath}: ${result.stderr}`);
  }

  // Make executable if requested
  if (options.executable) {
    await execInWorkspace(workspaceName, `chmod +x ${escapeShellArg(filePath)}`);
  }
}

/**
 * Read a file from the workspace.
 *
 * @param workspaceName - Name of the workspace
 * @param filePath - Path to read
 * @returns File content, or null if file doesn't exist
 */
export async function readFile(
  workspaceName: string,
  filePath: string
): Promise<string | null> {
  const result = await execInWorkspace(
    workspaceName,
    `cat ${escapeShellArg(filePath)} 2>/dev/null || echo "__FILE_NOT_FOUND__"`
  );

  if (result.stdout.trim() === '__FILE_NOT_FOUND__') {
    return null;
  }

  return result.stdout;
}

/**
 * Wait for a port to be listening in the workspace.
 *
 * @param workspaceName - Name of the workspace
 * @param port - Port to wait for
 * @param timeoutMs - Timeout in milliseconds (default: 30000)
 * @param pollIntervalMs - Poll interval in milliseconds (default: 1000)
 */
export async function waitForPort(
  workspaceName: string,
  port: number,
  timeoutMs = 30000,
  pollIntervalMs = 1000
): Promise<void> {
  const startTime = Date.now();

  while (Date.now() - startTime < timeoutMs) {
    const result = await execInWorkspace(
      workspaceName,
      `nc -z localhost ${port} 2>/dev/null && echo "open" || echo "closed"`
    );

    if (result.stdout.trim() === 'open') {
      return;
    }

    await new Promise((resolve) => setTimeout(resolve, pollIntervalMs));
  }

  throw new Error(`Timeout waiting for port ${port} in workspace ${workspaceName}`);
}

// ============================================================================
// Helpers
// ============================================================================

/**
 * Escape a string for use in a shell command.
 */
function escapeShellArg(arg: string): string {
  // Use single quotes and escape any single quotes within
  return `'${arg.replace(/'/g, "'\\''")}'`;
}
