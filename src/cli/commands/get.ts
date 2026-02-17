import type { CommandContext } from '../types.js';
import { printWorkspace, printJson, serializeWorkspace, printError } from '../output.js';

export async function handleGet(
  ctx: CommandContext,
  id: string
): Promise<void> {
  try {
    const workspace = await ctx.provider.get(id);

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
