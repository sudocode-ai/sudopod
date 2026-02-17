import type { ListWorkspacesOptions, WorkspaceStatus } from '../../provider/types.js';
import type { CommandContext } from '../types.js';
import { printWorkspaceList, printJson, serializeWorkspace, printError } from '../output.js';

export interface ListCommandOptions {
  status?: string;
  owner?: string;
  repo?: string;
  limit?: string;
}

export async function handleList(
  ctx: CommandContext,
  opts: ListCommandOptions
): Promise<void> {
  try {
    const filters: ListWorkspacesOptions = {};

    if (opts.status) {
      filters.status = [opts.status as WorkspaceStatus];
    }
    if (opts.owner) filters.owner = opts.owner;
    if (opts.repo) filters.repo = opts.repo;
    if (opts.limit) filters.limit = parseInt(opts.limit, 10);

    const workspaces = await ctx.provider.list(filters);

    if (ctx.jsonOutput) {
      printJson(workspaces.map(serializeWorkspace));
    } else {
      printWorkspaceList(workspaces);
    }
  } catch (err) {
    printError(err instanceof Error ? err.message : String(err));
    process.exit(1);
  }
}
