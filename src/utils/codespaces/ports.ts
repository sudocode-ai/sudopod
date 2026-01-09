/**
 * Port forwarding and checking primitives
 * 
 * This module provides utilities for managing port forwarding,
 * checking port availability, and retrieving public URLs for
 * codespace ports.
 * 
 * NOTE: This module uses child_process.exec() for gh CLI operations because:
 * 1. The gh CLI requires shell execution for proper command parsing
 * 2. We need to handle port forwarding process management (spawn, kill)
 * 3. All inputs are controlled (codespace names from GitHub, ports are numbers)
 * 4. Port forwarding requires background process management
 */

import { exec } from 'child_process';
import { promisify } from 'util';
import { execInCodespace } from './execution.js';

const execPromise = promisify(exec);

/**
 * Check if a port is listening in the codespace
 * 
 * Uses curl to verify the server is actually accepting connections.
 * Tries both the root path and /health endpoint to maximize compatibility.
 * 
 * @param name - Codespace name
 * @param port - Port number to check
 * @returns True if port is listening and accepting connections, false otherwise
 * 
 * @example
 * ```typescript
 * // Check if server is running on port 3000
 * const isListening = await checkPortListening('my-codespace', 3000);
 * if (isListening) {
 *   console.log('Server is ready');
 * }
 * ```
 */
export async function checkPortListening(
  name: string,
  port: number
): Promise<boolean> {
  try {
    // Try to connect to the port using curl
    // -s: silent mode (no progress bars)
    // -f: fail silently on HTTP errors
    // --max-time 2: timeout after 2 seconds
    // -o /dev/null: discard output
    // Try both root path and /health endpoint
    await execInCodespace(
      name,
      `curl -sf --max-time 2 -o /dev/null http://localhost:${port}/ || curl -sf --max-time 2 -o /dev/null http://localhost:${port}/health`,
      { streamOutput: false, timeout: 5000 }
    );
    return true;
  } catch {
    return false;
  }
}

/**
 * Wait for a port to be listening in the codespace
 * 
 * Polls the port using checkPortListening() at 2-second intervals
 * until the port is accepting connections or the maximum retries is reached.
 * 
 * @param name - Codespace name
 * @param port - Port number to wait for
 * @param maxRetries - Maximum number of retries (default: 15, total wait time: 30 seconds)
 * @throws Error if port is not listening after timeout
 * 
 * @example
 * ```typescript
 * // Wait up to 30 seconds for server to start
 * await waitForPortListening('my-codespace', 3000);
 * console.log('Server is ready!');
 * 
 * // Custom timeout (20 seconds)
 * await waitForPortListening('my-codespace', 3000, 10);
 * ```
 */
export async function waitForPortListening(
  name: string,
  port: number,
  maxRetries: number = 15
): Promise<void> {
  for (let i = 0; i < maxRetries; i++) {
    if (await checkPortListening(name, port)) {
      return;
    }
    // Wait 2 seconds before next check
    await new Promise(resolve => setTimeout(resolve, 2000));
  }
  
  throw new Error(`Port ${port} not listening after ${maxRetries * 2}s`);
}

/**
 * Forward a codespace port to local machine and register with GitHub
 * 
 * This registers the port with GitHub's forwarding system by starting
 * a port forward, waiting briefly, then killing the process. The port
 * remains registered after the forward process exits.
 * 
 * Handles local port conflicts by incrementing the local port automatically
 * until an available port is found (tries up to 20 ports).
 * 
 * @param name - Codespace name
 * @param codespacePort - Port in the codespace to forward
 * @param initialLocalPort - Initial local port to try (defaults to codespacePort)
 * @returns The local port that was successfully bound
 * @throws Error if no available local port found after 20 attempts
 * 
 * @example
 * ```typescript
 * // Forward port 3000 to local port 3000 (or next available)
 * const localPort = await forwardPort('my-codespace', 3000);
 * console.log(`Port forwarded to localhost:${localPort}`);
 * 
 * // Try specific local port first
 * const localPort = await forwardPort('my-codespace', 3000, 8080);
 * // Will use 8080 if available, otherwise tries 8081, 8082, etc.
 * ```
 */
export async function forwardPort(
  name: string,
  codespacePort: number,
  initialLocalPort?: number
): Promise<number> {
  let localPort = initialLocalPort || codespacePort;
  const maxAttempts = 20;
  
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    try {
      // Start port forward process
      const forwardProcess = exec(
        `gh codespace ports forward ${codespacePort}:${localPort} --codespace ${name}`
      );
      
      // Collect stderr to detect port conflicts
      let stderr = '';
      if (forwardProcess.stderr) {
        forwardProcess.stderr.on('data', (data) => {
          stderr += data.toString();
        });
      }
      
      // Wait briefly for process to start and port to register
      await new Promise(resolve => setTimeout(resolve, 2000));
      
      // Check if we hit a port conflict
      if (stderr.includes('bind: address already in use')) {
        // Kill the failed process
        if (forwardProcess.pid) {
          try {
            process.kill(forwardProcess.pid);
          } catch {
            // Process might already be dead
          }
        }
        // Try next port
        localPort++;
        continue;
      }
      
      // Port forward started successfully, now kill it (port stays registered)
      if (forwardProcess.pid) {
        try {
          process.kill(forwardProcess.pid);
        } catch {
          // Process might already be dead
        }
      }
      
      return localPort;
      
    } catch (error: any) {
      // Handle errors during exec
      if (error.message?.includes('bind: address already in use')) {
        localPort++;
        continue;
      }
      throw error;
    }
  }
  
  throw new Error(`Failed to find available local port after ${maxAttempts} attempts`);
}

/**
 * Get the public URL for a forwarded codespace port
 * 
 * Retrieves the GitHub-hosted public URL (*.github.dev) for accessing
 * a forwarded port from outside the codespace.
 * 
 * @param name - Codespace name
 * @param port - Port number
 * @returns Public URL for accessing the port (e.g., https://xyz-3000.app.github.dev)
 * @throws Error if port is not found or not forwarded
 * 
 * @example
 * ```typescript
 * // Get public URL for port 3000
 * const url = await getCodespacePortUrl('my-codespace', 3000);
 * console.log(`Access server at: ${url}`);
 * // Output: Access server at: https://xyz-3000.app.github.dev
 * ```
 */
export async function getCodespacePortUrl(
  name: string,
  port: number
): Promise<string> {
  const { stdout } = await execPromise(
    `gh codespace ports --codespace ${name} --json sourcePort,browseUrl`
  );
  
  const ports = JSON.parse(stdout) as Array<{ sourcePort: number; browseUrl: string }>;
  const portInfo = ports.find(p => p.sourcePort === port);
  
  if (!portInfo) {
    throw new Error(`Port ${port} not found in codespace ${name}`);
  }
  
  return portInfo.browseUrl;
}

/**
 * Set port visibility (public or private)
 * 
 * Controls whether a forwarded port is accessible publicly (anyone with the URL)
 * or privately (requires GitHub authentication).
 * 
 * @param name - Codespace name
 * @param port - Port number
 * @param visibility - Visibility setting ('public' or 'private')
 * 
 * @example
 * ```typescript
 * // Make port publicly accessible
 * await setPortVisibility('my-codespace', 3000, 'public');
 * 
 * // Restrict to authenticated users only
 * await setPortVisibility('my-codespace', 3000, 'private');
 * ```
 */
export async function setPortVisibility(
  name: string,
  port: number,
  visibility: 'public' | 'private'
): Promise<void> {
  await execPromise(
    `gh codespace ports visibility ${port}:${visibility} --codespace ${name}`
  );
}
