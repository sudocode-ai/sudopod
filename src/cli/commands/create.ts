import type { CreateOptions } from '../../provider/types.js';
import type { CommandContext } from '../types.js';
import { printWorkspace, printJson, serializeWorkspace, printError } from '../output.js';

export interface CreateCommandOptions {
  name: string;
  repo: string;
  branch?: string;
  retention: string;
  machine?: string;
  service?: string[];
  setupScript?: string;
  port?: string;
  idleTimeout?: string;
  tailscaleAuthKey?: string;
  tailscaleServer?: string;
}

export async function handleCreate(
  ctx: CommandContext,
  opts: CreateCommandOptions
): Promise<void> {
  try {
    const [owner, repo] = parseRepo(opts.repo);

    const createOpts: CreateOptions = {
      name: opts.name,
      repository: { owner, repo, branch: opts.branch },
      retentionDays: parseInt(opts.retention, 10),
      machineType: opts.machine,
      setup: buildSetupConfig(opts),
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

function buildSetupConfig(opts: CreateCommandOptions) {
  const hasSetup =
    opts.service?.length ||
    opts.setupScript ||
    opts.idleTimeout ||
    opts.tailscaleAuthKey;

  if (!hasSetup) return undefined;

  return {
    services: opts.service?.map(name => ({ name })),
    lifecycle: opts.idleTimeout
      ? { idleTimeoutMinutes: parseInt(opts.idleTimeout, 10) }
      : undefined,
    setupScript: opts.setupScript,
    tailscale: opts.tailscaleAuthKey
      ? {
          authKey: opts.tailscaleAuthKey,
          controlServer: opts.tailscaleServer,
        }
      : undefined,
  };
}
