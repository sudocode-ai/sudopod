/**
 * Helper to start an ngrok tunnel for integration tests.
 * Makes a local port (e.g. Headscale on 8080) reachable from remote codespaces.
 */

import { spawn, ChildProcess } from 'node:child_process';

export interface NgrokTunnel {
  /** Public HTTPS URL, e.g. "https://abc123.ngrok-free.app" */
  url: string;
  /** Kill the ngrok process */
  stop(): void;
}

interface NgrokTunnelEntry {
  public_url: string;
  proto: string;
}

interface NgrokApiResponse {
  tunnels: NgrokTunnelEntry[];
}

/**
 * Starts an ngrok tunnel to the given local port.
 *
 * Requires `ngrok` CLI installed and authenticated:
 *   ngrok config add-authtoken <token>
 *
 * @param port - Local port to tunnel (e.g. 8080 for Headscale)
 * @param timeoutMs - Max time to wait for ngrok to start (default 15s)
 */
export async function startNgrokTunnel(
  port: number,
  timeoutMs = 15_000,
): Promise<NgrokTunnel> {
  const proc = spawn('ngrok', ['http', String(port)], {
    stdio: 'ignore',
    detached: false,
  });

  let stopped = false;
  const stop = () => {
    if (stopped) return;
    stopped = true;
    proc.kill('SIGTERM');
  };

  // If the process exits early, we want to know
  const exitPromise = new Promise<never>((_, reject) => {
    proc.on('error', (err) => {
      reject(new Error(`ngrok failed to start: ${err.message}`));
    });
    proc.on('exit', (code) => {
      if (!stopped) {
        reject(new Error(`ngrok exited unexpectedly with code ${code}`));
      }
    });
  });

  try {
    const url = await Promise.race([
      pollForTunnel(port, timeoutMs),
      exitPromise,
    ]);
    return { url, stop };
  } catch (err) {
    stop();
    throw err;
  }
}

/**
 * Poll the ngrok local API for the tunnel URL.
 * ngrok exposes a local API at http://127.0.0.1:4040/api/tunnels.
 */
async function pollForTunnel(
  port: number,
  timeoutMs: number,
): Promise<string> {
  const deadline = Date.now() + timeoutMs;
  const apiUrl = 'http://127.0.0.1:4040/api/tunnels';
  const pollInterval = 500;

  while (Date.now() < deadline) {
    try {
      const res = await fetch(apiUrl);
      if (res.ok) {
        const data = (await res.json()) as NgrokApiResponse;
        const tunnel = data.tunnels.find(
          (t) =>
            t.proto === 'https' &&
            t.public_url.startsWith('https://'),
        );
        if (tunnel) return tunnel.public_url;
      }
    } catch {
      // ngrok not ready yet, keep polling
    }
    await sleep(pollInterval);
  }

  throw new Error(
    `ngrok tunnel not ready after ${timeoutMs}ms — is ngrok installed and authenticated?`,
  );
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
