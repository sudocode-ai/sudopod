/**
 * ngrok tunnel management for making local services reachable from remote workspaces.
 *
 * Used by `sudopod headscale start` to expose local Headscale to Coder workspaces on AWS.
 * Spawns ngrok as a detached process so it survives after the CLI command exits.
 */

import { spawn } from 'node:child_process';

export interface NgrokTunnelResult {
  /** Public HTTPS URL, e.g. "https://abc123.ngrok-free.app" */
  url: string;
  /** PID of the ngrok process (for cleanup via stopNgrokTunnel) */
  pid: number;
}

interface NgrokTunnelEntry {
  public_url: string;
  proto: string;
}

interface NgrokApiResponse {
  tunnels: NgrokTunnelEntry[];
}

/**
 * Start an ngrok tunnel to the given local port.
 *
 * Spawns ngrok as a **detached** process so it survives after the CLI exits.
 * Polls the ngrok local API for the public HTTPS URL.
 *
 * Requires `ngrok` CLI installed and authenticated:
 *   ngrok config add-authtoken <token>
 */
export async function startNgrokTunnel(
  port: number,
  timeoutMs = 15_000,
): Promise<NgrokTunnelResult> {
  const proc = spawn('ngrok', ['http', String(port)], {
    detached: true,
    stdio: 'ignore',
  });

  proc.unref();

  const pid = proc.pid;
  if (!pid) {
    throw new Error('Failed to start ngrok — no PID returned');
  }

  try {
    const url = await pollForTunnel(timeoutMs);
    return { url, pid };
  } catch (err) {
    // Clean up on failure
    stopNgrokTunnel(pid);
    throw err;
  }
}

/**
 * Stop an ngrok tunnel by killing its process.
 */
export function stopNgrokTunnel(pid: number): void {
  try {
    process.kill(pid, 'SIGTERM');
  } catch {
    // Process already dead — that's fine
  }
}

/**
 * Poll the ngrok local API for the tunnel URL.
 * ngrok exposes a local API at http://127.0.0.1:4040/api/tunnels.
 */
async function pollForTunnel(timeoutMs: number): Promise<string> {
  const deadline = Date.now() + timeoutMs;
  const apiUrl = 'http://127.0.0.1:4040/api/tunnels';
  const pollInterval = 500;

  while (Date.now() < deadline) {
    try {
      const res = await fetch(apiUrl);
      if (res.ok) {
        const data = (await res.json()) as NgrokApiResponse;
        const tunnel = data.tunnels.find(
          (t) => t.proto === 'https' && t.public_url.startsWith('https://'),
        );
        if (tunnel) return tunnel.public_url;
      }
    } catch {
      // ngrok not ready yet, keep polling
    }
    await new Promise((resolve) => setTimeout(resolve, pollInterval));
  }

  throw new Error(
    `ngrok tunnel not ready after ${timeoutMs}ms — is ngrok installed and authenticated?`,
  );
}
