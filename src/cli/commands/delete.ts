import type { CommandContext } from '../types.js';
import { printJson, printSuccess, printError } from '../output.js';

export async function handleDelete(
  ctx: CommandContext,
  id: string
): Promise<void> {
  try {
    await ctx.provider.delete(id);

    if (ctx.jsonOutput) {
      printJson({ id, deleted: true });
    } else {
      printSuccess(`Workspace ${id} deleted.`);
    }
  } catch (err) {
    printError(err instanceof Error ? err.message : String(err));
    process.exit(1);
  }
}
