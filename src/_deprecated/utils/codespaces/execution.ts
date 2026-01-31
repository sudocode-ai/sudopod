/**
 * Remote command execution primitives
 * 
 * This module provides utilities for executing commands in a codespace
 * via SSH using the gh CLI.
 * 
 * NOTE: This module uses child_process.exec() because:
 * 1. We need to execute complex shell commands via SSH
 * 2. We need real-time output streaming
 * 3. The gh CLI requires shell-style command composition
 * 4. All inputs are controlled (Codespace names from GitHub, commands from our code)
 */

import { exec } from 'child_process';
import type { ExecOptions } from './types.js';

/**
 * Escape command for bash -l -c execution
 * 
 * This properly escapes single quotes for the login shell pattern:
 * gh codespace ssh -- "bash -l -c 'command'"
 * 
 * Single quotes inside the command need to be escaped as '\''
 * (end quote, escaped quote, start quote).
 * 
 * @param command - Command to escape
 * @returns Escaped command safe for bash -l -c execution
 * 
 * @example
 * ```typescript
 * escapeForLoginShell("echo 'hello'") // Returns: echo '\''hello'\''
 * escapeForLoginShell('echo "world"') // Returns: echo "world" (double quotes are safe)
 * ```
 */
function escapeForLoginShell(command: string): string {
  return command.replace(/'/g, "'\\''");
}

/**
 * Execute a command in the codespace via SSH using login shell
 * 
 * Uses `gh codespace ssh` with `bash -l -c` to execute commands remotely.
 * The login shell pattern ensures:
 * - Commands run from workspace directory (/workspaces/<repo>) by default
 * - All environment variables are properly set (PATH includes installed tools)
 * - Consistent execution environment for all commands
 * 
 * Features:
 * - Optional working directory override via `cwd` option
 * - Configurable timeout
 * - Real-time output streaming
 * - Proper single-quote escaping for login shell
 * 
 * @param name - Codespace name (from GitHub API)
 * @param command - Command to execute (should be from trusted source)
 * @param options - Execution options
 * @returns Command output (stdout)
 * @throws Error if command execution fails, with context about the failure
 * 
 * @example
 * ```typescript
 * // Simple command (runs in /workspaces/<repo> by default)
 * const output = await execInCodespace(name, 'pwd');
 * console.log('Current directory:', output); // /workspaces/<repo>
 * 
 * // Install packages (runs in workspace root automatically)
 * await execInCodespace(name, 'npm install', { 
 *   timeout: 300000 // 5 minutes
 * });
 * 
 * // Override working directory for specific cases
 * await execInCodespace(name, 'ls -la', { 
 *   cwd: '/tmp',
 *   streamOutput: false 
 * });
 * 
 * // Long-running build
 * await execInCodespace(name, 'npm run build', {
 *   timeout: 600000, // 10 minutes
 *   streamOutput: true
 * });
 * ```
 */
export async function execInCodespace(
  name: string,
  command: string,
  options: ExecOptions = {}
): Promise<string> {
  const {
    timeout = 120000, // 2 minutes default
    cwd,
    streamOutput = true,
    background = false
  } = options;

  // If cwd is specified, wrap command to cd first
  const wrappedCommand = cwd
    ? `cd ${cwd} && ${command}`
    : command;

  // Use base64 encoding to avoid all quoting issues
  // This is robust against any characters in the command (quotes, dollars, backticks, etc.)
  const encodedCommand = Buffer.from(wrappedCommand).toString('base64');
  
  // Use login shell pattern for proper environment setup
  // Decode and execute the command using base64
  // For background processes, we rely on the command itself to have & for backgrounding
  // The outer & after the quotes ensures the SSH command returns immediately
  const sshCommand = background
    ? `gh codespace ssh --codespace ${name} -- "bash -l -c \\"echo ${encodedCommand} | base64 -d | bash\\" &"`
    : `gh codespace ssh --codespace ${name} -- "bash -l -c \\"echo ${encodedCommand} | base64 -d | bash\\""`;


  return new Promise((resolve, reject) => {
    const child = exec(sshCommand, { timeout }, (error, stdout, stderr) => {
      // For background processes, the outer & causes immediate return
      // We only care that the SSH command itself succeeded, not the backgrounded process
      if (background) {
        // For background processes, resolve immediately
        // The process will continue running after SSH disconnects
        resolve(stdout);
      } else if (error) {
        reject(new Error(
          `Failed to execute in codespace ${name}: ${command}\n${error.message}\n${stderr}`
        ));
      } else {
        resolve(stdout);
      }
    });

    // Stream output in real-time if requested
    if (streamOutput && child.stdout && child.stderr) {
      child.stdout.on('data', (data) => process.stdout.write(data));
      child.stderr.on('data', (data) => process.stderr.write(data));
    }
  });
}
