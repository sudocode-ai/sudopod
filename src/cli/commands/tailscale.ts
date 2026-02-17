/**
 * CLI commands for Tailscale networking.
 *
 * - `sudopod tailscale connect` — join a tailnet and store admin credentials
 * - `sudopod tailscale create-key` — generate a preauthkey from stored credentials
 *
 * @see s-5dat - Sudopod Tailscale CLI Support
 */

import { execSync } from 'node:child_process';
import { loadConfig, saveConfig } from '../config.js';
import { HeadscaleClient } from '../../headscale/client.js';
import { printError, printSuccess, printJson } from '../output.js';

// ============================================================================
// tailscale connect
// ============================================================================

export interface TailscaleConnectOptions {
  controlServer?: string;
  authKey?: string;
  apiKey?: string;
}

export async function handleTailscaleConnect(
  opts: TailscaleConnectOptions,
  jsonOutput: boolean,
): Promise<void> {
  try {
    // Resolve control server and API key — flags override stored config
    const config = loadConfig();
    const controlServer = opts.controlServer ?? config.tailscale?.controlServer;
    const apiKey = opts.apiKey ?? config.tailscale?.apiKey;

    if (!controlServer) {
      throw new Error(
        'No control server configured. Either:\n' +
        '  - Run `sudopod headscale start` first, or\n' +
        '  - Pass --control-server <url>'
      );
    }

    // Resolve auth key — auto-generate if not provided
    let authKey = opts.authKey;
    if (!authKey) {
      if (!apiKey) {
        throw new Error(
          'No API key available to auto-generate preauthkey. Either:\n' +
          '  - Run `sudopod headscale start` first, or\n' +
          '  - Pass --auth-key <key>'
        );
      }
      const client = new HeadscaleClient({ baseUrl: controlServer, apiKey });
      const users = await client.listUsers();
      if (users.length === 0) {
        throw new Error('No users found on Headscale. Create one first.');
      }
      authKey = await client.createPreauthKey(users[0].id, {
        ephemeral: false,
        reusable: false,
        expiry: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
      });
    }

    // Validate that tailscale binary is available
    try {
      execSync('which tailscale', { stdio: 'pipe' });
    } catch {
      throw new Error(
        'Tailscale binary not found. Install Tailscale first: https://tailscale.com/download'
      );
    }

    // Check if tailscaled is running
    const statusResult = execSync('tailscale status 2>&1 || true', {
      encoding: 'utf-8',
    });
    const daemonRunning =
      statusResult.includes('NeedsLogin') ||
      statusResult.includes('Stopped') ||
      statusResult.includes('Logged out') ||
      (!statusResult.includes('is tailscaled running') &&
        !statusResult.includes('connect: connection refused'));

    if (!daemonRunning) {
      // Start tailscaled — use inherit so sudo can prompt for password
      execSync(
        'sudo tailscaled --tun=userspace-networking --socks5-server=localhost:1055 --state=tailscaled.state > /tmp/tailscaled.log 2>&1 &',
        { stdio: 'inherit' },
      );
      // Wait for socket
      for (let i = 0; i < 20; i++) {
        try {
          execSync('tailscale status 2>&1', { stdio: 'pipe' });
          break;
        } catch {
          execSync('sleep 0.5', { stdio: 'pipe' });
        }
      }
    }

    // Join the tailnet — use inherit so sudo can prompt for password if needed
    // --force-reauth needed when switching between Headscale instances (e.g. new ngrok URL)
    const upArgs = [
      'tailscale up',
      `--authkey=${authKey}`,
      '--accept-dns=false',
      '--force-reauth',
      `--login-server=${controlServer}`,
    ];
    execSync(upArgs.join(' '), { stdio: 'inherit', timeout: 30_000 });

    // Store credentials in config (if we have an API key)
    if (apiKey) {
      const updatedConfig = loadConfig();
      updatedConfig.tailscale = {
        controlServer,
        apiKey,
      };
      saveConfig(updatedConfig);
    }

    if (jsonOutput) {
      printJson({
        controlServer,
        status: 'connected',
      });
    } else {
      printSuccess(`Connected to tailnet at ${controlServer}`);
      if (apiKey) {
        printSuccess('Admin API key stored in config.');
      }
    }
  } catch (err) {
    printError(err instanceof Error ? err.message : String(err));
    process.exit(1);
  }
}

// ============================================================================
// tailscale create-key
// ============================================================================

export interface TailscaleCreateKeyOptions {
  ephemeral?: boolean;
  reusable?: boolean;
  expiration?: string;
  user?: string;
}

export async function handleTailscaleCreateKey(
  opts: TailscaleCreateKeyOptions,
  jsonOutput: boolean,
): Promise<void> {
  try {
    const config = loadConfig();
    if (!config.tailscale?.apiKey || !config.tailscale?.controlServer) {
      throw new Error(
        'Not connected to a tailnet. Run: sudopod tailscale connect'
      );
    }

    const client = new HeadscaleClient({
      baseUrl: config.tailscale.controlServer,
      apiKey: config.tailscale.apiKey,
    });

    // Resolve user — default to first available user
    let userId = opts.user;
    if (!userId) {
      const users = await client.listUsers();
      if (users.length === 0) {
        throw new Error(
          'No users found on Headscale. Create one first: headscale users create <name>'
        );
      }
      userId = users[0].id;
    }

    // Parse expiration — default 1h
    const expiration = opts.expiration
      ? new Date(Date.now() + parseDuration(opts.expiration)).toISOString()
      : new Date(Date.now() + 60 * 60 * 1000).toISOString();

    const key = await client.createPreauthKey(userId, {
      ephemeral: opts.ephemeral ?? true,
      reusable: opts.reusable ?? false,
      expiry: expiration,
    });

    if (jsonOutput) {
      printJson({ key, user: userId, ephemeral: opts.ephemeral ?? true });
    } else {
      console.log(key);
    }
  } catch (err) {
    printError(err instanceof Error ? err.message : String(err));
    process.exit(1);
  }
}

/**
 * Parse a duration string like "1h", "30m", "2d" into milliseconds.
 */
function parseDuration(input: string): number {
  const match = input.match(/^(\d+)(m|h|d)$/);
  if (!match) {
    throw new Error(
      `Invalid duration: "${input}". Use format like 1h, 30m, or 2d.`
    );
  }
  const value = parseInt(match[1], 10);
  switch (match[2]) {
    case 'm': return value * 60 * 1000;
    case 'h': return value * 60 * 60 * 1000;
    case 'd': return value * 24 * 60 * 60 * 1000;
    default:  return value * 60 * 60 * 1000;
  }
}
