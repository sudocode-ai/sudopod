import type { CommandContext } from '../types.js';
import { printWorkspace, printJson, serializeWorkspace, printError, setQuiet, printStep } from '../output.js';

export async function handleResume(
  ctx: CommandContext,
  id?: string
): Promise<void> {
  try {
    setQuiet(ctx.jsonOutput);
    printStep(id ? `Resuming workspace ${id}...` : 'Resuming most recent workspace...');
    const workspace = await ctx.provider.resume(id);

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
