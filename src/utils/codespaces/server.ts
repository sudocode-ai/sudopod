/**
 * Server management primitives
 * 
 * This module provides utilities for starting and managing the sudocode
 * server in a codespace.
 */

import { execInCodespace } from './execution.js';

/**
 * Start sudocode server in background
 * 
 * Starts the sudocode server in the background using nohup, ensuring it persists
 * after SSH disconnection. Logs are written to /tmp/sudocode-<port>.log which is
 * monitored by the traffic monitor daemon for keepalive functionality.
 * 
 * IMPORTANT CHANGES from previous implementation:
 * - Removed `--keep-alive` flag (keepalive is now handled by the daemon)
 * - Logs ALWAYS go to /tmp/sudocode-<port>.log in ALL cases
 * - Uses bash subshell with nohup for proper SSH backgrounding
 * - Returns immediately (doesn't wait for server ready)
 * 
 * The command uses a bash subshell pattern to ensure the process starts in the
 * background and persists after the SSH connection closes:
 * `bash -c '(nohup command > logfile 2>&1 </dev/null &) && sleep 1'`
 * 
 * The `sleep 1` ensures the parent process waits briefly for the background
 * process to start before the SSH session exits.
 * 
 * @param name - Codespace name
 * @param port - Port number for the server
 * @param workspaceDir - Workspace directory path where server should run
 * @returns Promise that resolves when the start command completes (not when server is ready)
 * @throws Error if the start command fails to execute
 * 
 * @example
 * ```typescript
 * // Start server on default port
 * await startSudocodeServer('mycodespace', 3000, '/workspaces/myrepo');
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
  workspaceDir: string
): Promise<void> {
  // Use bash subshell with nohup for background process persistence
  // - cd to workspace directory
  // - Start server in background with nohup
  // - Redirect stdout and stderr to log file
  // - Redirect stdin from /dev/null (prevents hanging)
  // - Sleep briefly to ensure background process starts
  // 
  // Note: We do NOT use --keep-alive flag (removed per spec)
  // Keepalive is now handled by the traffic monitor daemon
  await execInCodespace(
    name,
    `bash -c 'cd ${workspaceDir} && (nohup sudocode server --port ${port} > /tmp/sudocode-${port}.log 2>&1 </dev/null &) && sleep 1'`,
    {
      streamOutput: false,
      timeout: 10000 // 10 seconds should be plenty for start command
    }
  );
}
