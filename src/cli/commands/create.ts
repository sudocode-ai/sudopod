import { execSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import type { CreateOptions, ServiceConfig } from '../../provider/types.js';
import type { CommandContext } from '../types.js';
import { loadConfig } from '../config.js';
import { HeadscaleClient } from '../../headscale/client.js';
import { printWorkspace, printJson, serializeWorkspace, printError, setQuiet, printStep } from '../output.js';

export interface CreateCommandOptions {
  repo?: string;
  branch?: string;
  retention: string;
  machine: string;
  service?: string[];
  setupScript?: string;
  idleTimeout?: string;
  tailscale?: boolean;
}

export async function handleCreate(
  ctx: CommandContext,
  opts: CreateCommandOptions
): Promise<void> {
  try {
    setQuiet(ctx.jsonOutput);
    const [owner, repo] = opts.repo ? parseRepo(opts.repo) : detectRepo();
    const branch = opts.branch ?? detectBranch();
    printStep(`Creating workspace for ${owner}/${repo} (${branch})...`);
    const name = generateName(repo, branch);

    // Auto-generate tailscale preauthkey if --tailscale flag is set
    let tailscaleConfig: { authKey: string; controlServer: string; headscaleApiKey: string } | undefined;
    if (opts.tailscale) {
      tailscaleConfig = await autoGeneratePreauthKey();
    }

    const createOpts: CreateOptions = {
      name,
      repository: { owner, repo, branch },
      retentionDays: parseInt(opts.retention, 10),
      machineType: opts.machine,
      setup: buildSetupConfig(opts, tailscaleConfig),
    };

    const workspace = await ctx.provider.create(createOpts);

    if (ctx.jsonOutput) {
      printJson(serializeWorkspace(workspace));
    } else {
      printWorkspace(workspace);
    }
  } catch (err) {
    printError(err instanceof Error ? err.message : String(err));
    process.exit(1);
  }
}

function parseRepo(repo: string): [string, string] {
  const parts = repo.split('/');
  if (parts.length !== 2 || !parts[0] || !parts[1]) {
    throw new Error(`Invalid repo format: "${repo}". Expected owner/repo.`);
  }
  return [parts[0], parts[1]];
}

function detectRepo(): [string, string] {
  let url: string;
  try {
    url = execSync('git remote get-url origin', { encoding: 'utf-8' }).trim();
  } catch {
    throw new Error(
      'Could not detect git repo. Use --repo <owner/repo> or run from inside a git repository.'
    );
  }

  // Handle SSH (git@github.com:owner/repo.git) and HTTPS (https://github.com/owner/repo.git)
  const match = url.match(/(?:github\.com[:/])([^/]+)\/([^/.]+?)(?:\.git)?$/);
  if (!match) {
    throw new Error(
      `Could not parse owner/repo from remote URL: "${url}". Use --repo <owner/repo>.`
    );
  }
  return [match[1], match[2]];
}

function detectBranch(): string {
  try {
    const branch = execSync('git branch --show-current', { encoding: 'utf-8' }).trim();
    if (!branch) throw new Error('detached HEAD');
    return branch;
  } catch {
    return 'main';
  }
}

function generateName(repo: string, branch: string): string {
  const id = randomBytes(3).toString('hex');
  return `${repo}-${branch}-${id}`;
}

function parseService(value: string): ServiceConfig {
  const colonIdx = value.lastIndexOf(':');
  if (colonIdx > 0) {
    const maybeName = value.slice(0, colonIdx);
    const maybePort = parseInt(value.slice(colonIdx + 1), 10);
    if (!isNaN(maybePort) && maybePort > 0) {
      return { name: maybeName, port: maybePort };
    }
  }
  return { name: value };
}

/**
 * Auto-generate an ephemeral preauthkey using stored Headscale admin credentials.
 */
async function autoGeneratePreauthKey(): Promise<{ authKey: string; controlServer: string; headscaleApiKey: string }> {
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

  // Use first available user
  const users = await client.listUsers();
  if (users.length === 0) {
    throw new Error(
      'No users found on Headscale. Create one first: headscale users create <name>'
    );
  }

  const authKey = await client.createPreauthKey(users[0].id, {
    ephemeral: true,
    reusable: false,
    expiry: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
  });

  return { authKey, controlServer: config.tailscale.controlServer, headscaleApiKey: config.tailscale.apiKey };
}

function buildSetupConfig(
  opts: CreateCommandOptions,
  tailscaleConfig?: { authKey: string; controlServer: string; headscaleApiKey: string },
) {
  const services = opts.service?.map(parseService);

  const hasSetup =
    services?.length ||
    opts.setupScript ||
    opts.idleTimeout ||
    tailscaleConfig;

  if (!hasSetup) return undefined;

  return {
    services,
    lifecycle: opts.idleTimeout
      ? { idleTimeoutMinutes: parseInt(opts.idleTimeout, 10) }
      : undefined,
    setupScript: opts.setupScript,
    tailscale: tailscaleConfig
      ? {
          authKey: tailscaleConfig.authKey,
          controlServer: tailscaleConfig.controlServer,
          headscaleApiKey: tailscaleConfig.headscaleApiKey,
        }
      : undefined,
  };
}
