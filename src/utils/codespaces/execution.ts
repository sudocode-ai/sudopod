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
 * Escape shell argument for safe inclusion in command string
 * 
 * This properly escapes double quotes and backslashes to prevent
 * shell injection when passing commands via SSH.
 * 
 * @param arg - Argument to escape
 * @returns Escaped argument safe for shell execution
 * 
 * @example
 * ```typescript
 * escapeShellArg('echo "hello"') // Returns: echo \\"hello\\"
 * escapeShellArg('path\\to\\file') // Returns: path\\\\to\\\\file
 * ```
 */
function escapeShellArg(arg: string): string {
  return arg.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
}

/**
 * Execute a command in the codespace via SSH
 * 
 * Uses `gh codespace ssh` to execute commands remotely. Supports:
 * - Working directory changes via `cwd` option
 * - Configurable timeout
 * - Real-time output streaming
 * - Proper shell argument escaping
 * 
 * @param name - Codespace name (from GitHub API)
 * @param command - Command to execute (should be from trusted source)
 * @param options - Execution options
 * @returns Command output (stdout)
 * @throws Error if command execution fails, with context about the failure
 * 
 * @example
 * ```typescript
 * // Simple command
 * const output = await execInCodespace(name, 'pwd');
 * console.log('Current directory:', output);
 * 
 * // With working directory
 * await execInCodespace(name, 'npm install', { 
 *   cwd: '/workspaces/myrepo',
 *   timeout: 300000 // 5 minutes
 * });
 * 
 * // Silent execution (no streaming)
 * const result = await execInCodespace(name, 'cat package.json', { 
 *   streamOutput: false 
 * });
 * 
 * // With custom timeout
 * await execInCodespace(name, 'npm run build', {
 *   timeout: 600000, // 10 minutes
 *   cwd: '/workspaces/myrepo',
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
    streamOutput = true
  } = options;

  // Wrap command to cd to correct directory if specified
  const wrappedCommand = cwd
    ? `cd ${cwd} && ${command}`
    : command;

  // Properly escape the command for SSH execution
  const escapedCommand = escapeShellArg(wrappedCommand);
  const sshCommand = `gh codespace ssh --codespace ${name} -- "${escapedCommand}"`;

  return new Promise((resolve, reject) => {
    const child = exec(sshCommand, { timeout }, (error, stdout, stderr) => {
      if (error) {
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
