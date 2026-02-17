import type { CommandContext } from '../types.js';
import { printJson, printSuccess, printError } from '../output.js';

export async function handleStop(
  ctx: CommandContext,
  id: string
): Promise<void> {
  try {
    await ctx.provider.stop(id);

    if (ctx.jsonOutput) {
      printJson({ id, status: 'stopped' });
    } else {
      printSuccess(`Workspace ${id} stopped.`);
    }
  } catch (err) {
    printError(err instanceof Error ? err.message : String(err));
    process.exit(1);
  }
}
