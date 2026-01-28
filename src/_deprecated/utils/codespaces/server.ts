/**
 * Server management primitives
 * 
 * This module provides utilities for starting and managing the sudocode
 * server in a codespace.
 */

import { execInCodespace } from './execution.js';
import type { StartServerOptions } from './types.js';

/**
 * Start sudocode server in background
 * 
 * Starts the sudocode server in the background using nohup, ensuring it persists
 * after SSH disconnection. Logs are written to /tmp/sudocode-<port>.log which is
 * monitored by the idle timeout daemon for keepalive functionality.
 * 
 * Uses login shell (bash -l -c) which runs from the workspace directory by default,
 * ensuring proper environment setup and working directory.
 * 
 * IMPORTANT CHANGES from previous implementation:
 * - Removed `--keep-alive` flag (keepalive is now handled by the daemon)
 * - Removed `workspaceDir` parameter (login shell runs from workspace by default)
 * - Logs ALWAYS go to /tmp/sudocode-<port>.log in ALL cases
 * - Uses nohup for proper SSH backgrounding
 * - Returns immediately (doesn't wait for server ready)
 * 
 * The nohup pattern ensures the process persists after the SSH connection closes.
 * 
 * @param name - Codespace name
 * @param port - Port number for the server
 * @param options - Optional configuration
 * @param options.claudeAuthToken - Optional Claude Code OAuth token (sk-ant-oat01-...) to pass via CLAUDE_CODE_OAUTH_TOKEN env var
 * @returns Promise that resolves when the start command completes (not when server is ready)
 * @throws Error if the start command fails to execute
 * 
 * @example
 * ```typescript
 * // Start server on default port (runs in /workspaces/<repo> automatically)
 * await startSudocodeServer('mycodespace', 3000);
 * 
 * // Start server with Claude Code OAuth token
 * await startSudocodeServer('mycodespace', 3000, {
 *   claudeAuthToken: 'sk-ant-oat01-...'
 * });
 * 
 * // Logs will be written to: /tmp/sudocode-3000.log
 * // Server will continue running after SSH disconnects
 * 
 * // To verify server started, use waitForPortListening from ports.ts
 * import { waitForPortListening } from './ports.js';
 * await waitForPortListening('mycodespace', 3000);
 * ```
 */
export async function startSudocodeServer(
  name: string,
  port: number,
  options?: StartServerOptions
): Promise<void> {
  // Use nohup for background process persistence
  // - Login shell runs from workspace directory by default
  // - Start server in background with nohup
  // - Redirect stdout and stderr to log file
  // - Redirect stdin from /dev/null (prevents hanging)
  // 
  // Note: We do NOT use --keep-alive flag (removed per spec)
  // Keepalive is now handled by the idle timeout daemon
  //
  // IMPORTANT: Uses background: true to add outer & for proper SSH backgrounding
  // Pattern: gh codespace ssh -- "bash -l -c 'nohup ... &' &"
  
  // Build the command with optional CLAUDE_CODE_OAUTH_TOKEN environment variable
  const envPrefix = options?.claudeAuthToken 
    ? `CLAUDE_CODE_OAUTH_TOKEN=${options.claudeAuthToken} `
    : '';
  
  await execInCodespace(
    name,
    `${envPrefix}nohup sudocode server --port ${port} > /tmp/sudocode-${port}.log 2>&1 </dev/null &`,
    {
      streamOutput: false,
      timeout: 10000, // 10 seconds should be plenty for start command
      background: true // Adds outer & for proper SSH backgrounding
    }
  );
}
