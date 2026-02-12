/**
 * CLI commands for local Headscale management.
 *
 * - `sudopod headscale start` — start a local Headscale instance via Docker
 * - `sudopod headscale stop` — tear down the local Headscale instance
 *
 * Wraps the Docker Compose infrastructure from tests/integration/tailscale/.
 *
 * @see s-5dat - Sudopod Tailscale CLI Support
 */

import { execSync } from 'node:child_process';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { existsSync } from 'node:fs';
import { loadConfig, saveConfig } from '../config.js';
import { printError, printSuccess, printJson } from '../output.js';
import { startNgrokTunnel, stopNgrokTunnel } from '../../ngrok/tunnel.js';
import { HeadscaleClient } from '../../headscale/client.js';

/**
 * Resolve the path to the Docker Compose directory.
 * Looks for it relative to the package root (where docker-compose.yml lives
 * in the integration test directory), or falls back to a bundled copy.
 */
function findComposeDir(): string {
  // Walk up from this file to find the project root
  const thisDir = dirname(fileURLToPath(import.meta.url));
  const candidates = [
    join(thisDir, '..', '..', '..', 'tests', 'integration', 'tailscale'),
    join(thisDir, '..', '..', 'tests', 'integration', 'tailscale'),
  ];

  for (const candidate of candidates) {
    if (existsSync(join(candidate, 'docker-compose.yml'))) {
      return candidate;
    }
  }

  throw new Error(
    'Could not find headscale docker-compose.yml. ' +
    'Ensure you are running from the sudopod project directory.'
  );
}

function dockerExec(cmd: string, composeDir: string, timeout = 30_000): string {
  return execSync(cmd, {
    cwd: composeDir,
    encoding: 'utf-8',
    timeout,
    stdio: ['pipe', 'pipe', 'pipe'],
  }).trim();
}

// ============================================================================
// headscale start
// ============================================================================

export interface HeadscaleStartOptions {
  port?: string;
}

export async function handleHeadscaleStart(
  opts: HeadscaleStartOptions,
  jsonOutput: boolean,
): Promise<void> {
  try {
    // Check Docker is available
    try {
      execSync('docker info', { stdio: 'pipe', timeout: 10_000 });
    } catch {
      throw new Error(
        'Docker is not available. Install Docker first: https://docs.docker.com/get-docker/'
      );
    }

    const composeDir = findComposeDir();
    const port = opts.port ?? '8080';

    // Check if already running
    try {
      const ps = dockerExec('docker compose ps --format json', composeDir);
      if (ps && ps.includes('"headscale"') && ps.includes('"running"')) {
        const existingConfig = loadConfig();
        const existingUrl = existingConfig.tailscale?.controlServer ?? `http://localhost:${port}`;
        if (jsonOutput) {
          printJson({
            status: 'already_running',
            url: existingUrl,
          });
        } else {
          printSuccess(`Headscale is already running: ${existingUrl}`);
        }
        return;
      }
    } catch {
      // Not running, continue with start
    }

    // Set port override if non-default
    const env = port !== '8080'
      ? { ...process.env, HEADSCALE_PORT: port }
      : process.env;

    // Start Headscale
    execSync('docker compose up -d headscale', {
      cwd: composeDir,
      env,
      stdio: 'pipe',
      timeout: 60_000,
    });

    // Wait for healthy
    execSync(
      'docker compose up -d --wait headscale',
      { cwd: composeDir, env, stdio: 'pipe', timeout: 60_000 },
    );

    // Create default user (idempotent — ignore "already exists" error)
    try {
      dockerExec(
        'docker compose exec headscale headscale users create default',
        composeDir,
      );
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (!msg.includes('already exists')) throw err;
    }

    // Generate admin API key
    const apiKey = dockerExec(
      'docker compose exec headscale headscale apikeys create --expiration 90d',
      composeDir,
      10_000,
    );

    // Start ngrok tunnel so remote workspaces can reach local Headscale
    if (!jsonOutput) {
      console.log('Starting ngrok tunnel...');
    }
    const portNum = parseInt(port, 10);
    const ngrok = await startNgrokTunnel(portNum);
    const controlServer = ngrok.url;

    // Store in config
    const config = loadConfig();
    config.tailscale = {
      controlServer,
      apiKey,
      ngrokPid: ngrok.pid,
      ...(config.tailscale?.stateDir ? { stateDir: config.tailscale.stateDir } : {}),
    };
    saveConfig(config);

    // Generate a preauthkey for the local machine to join the tailnet
    const client = new HeadscaleClient({ baseUrl: 'http://localhost:' + port, apiKey });
    const users = await client.listUsers();
    const userId = users.length > 0 ? users[0].id : undefined;
    let authKey: string | undefined;
    if (userId) {
      authKey = await client.createPreauthKey(userId, {
        ephemeral: false,
        reusable: false,
        expiry: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
      });
    }

    if (jsonOutput) {
      printJson({
        status: 'started',
        url: controlServer,
        apiKey,
        authKey,
        ngrokPid: ngrok.pid,
      });
    } else {
      printSuccess(`Headscale started`);
      console.log(`  Control server: ${controlServer}`);
      console.log(`  Credentials saved to config.`);
      console.log('');
      if (authKey) {
        console.log('  To connect your machine to the tailnet, run:');
        console.log(`    tailscale up --login-server=${controlServer} --authkey=${authKey} --accept-dns=false`);
        console.log('');
      }
      console.log('  To create a workspace on the tailnet:');
      console.log('    sudopod coder create --tailscale');
    }
  } catch (err) {
    printError(err instanceof Error ? err.message : String(err));
    process.exit(1);
  }
}

// ============================================================================
// headscale stop
// ============================================================================

export async function handleHeadscaleStop(jsonOutput: boolean): Promise<void> {
  try {
    try {
      execSync('docker info', { stdio: 'pipe', timeout: 10_000 });
    } catch {
      throw new Error('Docker is not available.');
    }

    // Kill ngrok tunnel if running
    const config = loadConfig();
    if (config.tailscale?.ngrokPid) {
      stopNgrokTunnel(config.tailscale.ngrokPid);
      config.tailscale.ngrokPid = undefined;
      saveConfig(config);
    }

    const composeDir = findComposeDir();

    execSync('docker compose down -v', {
      cwd: composeDir,
      stdio: 'pipe',
      timeout: 30_000,
    });

    if (jsonOutput) {
      printJson({ status: 'stopped' });
    } else {
      printSuccess('Headscale and ngrok stopped.');
    }
  } catch (err) {
    printError(err instanceof Error ? err.message : String(err));
    process.exit(1);
  }
}
