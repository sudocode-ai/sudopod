#!/usr/bin/env node

import { Command } from 'commander';
import { createProvider } from './provider/factory.js';
import { resolveProviderConfig } from './cli/auth.js';
import { printError } from './cli/output.js';
import { handleCreate } from './cli/commands/create.js';
import { handleResume } from './cli/commands/resume.js';
import { handleStop } from './cli/commands/stop.js';
import { handleDelete } from './cli/commands/delete.js';
import { handleGet } from './cli/commands/get.js';
import { handleList } from './cli/commands/list.js';
import type { CommandContext } from './cli/types.js';

const program = new Command();

program
  .name('sudopod')
  .description('CLI for provisioning and managing cloud development workspaces')
  .version('0.2.0')
  .option('--provider <type>', 'provider (codespaces, coder, hub)', 'codespaces')
  .option('--token <token>', 'auth token (overrides env/auto-detect)')
  .option('--json', 'output as JSON');

// Resolve auth + create provider before each command
program.hook('preAction', async (thisCommand) => {
  const opts = thisCommand.opts();
  try {
    const config = await resolveProviderConfig({
      provider: opts.provider,
      token: opts.token,
    });
    const provider = createProvider(opts.provider, config as any);

    // Stash context for command handlers
    thisCommand.setOptionValue('_ctx', {
      provider,
      jsonOutput: !!opts.json,
    } satisfies CommandContext);
  } catch (err) {
    printError(err instanceof Error ? err.message : String(err));
    process.exit(1);
  }
});

function getCtx(cmd: Command): CommandContext {
  return cmd.optsWithGlobals()._ctx as CommandContext;
}

// ── create ──────────────────────────────────────────────────────────────────
program
  .command('create')
  .description('Create a new workspace')
  .requiredOption('--name <name>', 'workspace name')
  .requiredOption('--repo <owner/repo>', 'repository (owner/repo)')
  .option('--branch <branch>', 'git branch')
  .option('--retention <days>', 'retention days', '7')
  .option('--machine <type>', 'machine type')
  .option('--service <name...>', 'services to install')
  .option('--setup-script <script>', 'one-time setup script')
  .option('--port <port>', 'primary service port')
  .option('--idle-timeout <minutes>', 'idle timeout in minutes')
  .option('--tailscale-auth-key <key>', 'tailscale auth key')
  .option('--tailscale-server <url>', 'tailscale control server URL')
  .action(async function (this: Command, opts) {
    await handleCreate(getCtx(program), opts);
  });

// ── resume ──────────────────────────────────────────────────────────────────
program
  .command('resume [id]')
  .description('Resume a workspace (most recent if id omitted)')
  .action(async function (this: Command, id?: string) {
    await handleResume(getCtx(program), id);
  });

// ── stop ────────────────────────────────────────────────────────────────────
program
  .command('stop <id>')
  .description('Stop a running workspace')
  .action(async function (this: Command, id: string) {
    await handleStop(getCtx(program), id);
  });

// ── delete ──────────────────────────────────────────────────────────────────
program
  .command('delete <id>')
  .description('Permanently delete a workspace')
  .action(async function (this: Command, id: string) {
    await handleDelete(getCtx(program), id);
  });

// ── get ─────────────────────────────────────────────────────────────────────
program
  .command('get <id>')
  .description('Get workspace details')
  .action(async function (this: Command, id: string) {
    await handleGet(getCtx(program), id);
  });

// ── list ────────────────────────────────────────────────────────────────────
program
  .command('list')
  .description('List workspaces')
  .option('--status <status>', 'filter by status')
  .option('--owner <owner>', 'filter by repository owner')
  .option('--repo <repo>', 'filter by repository name')
  .option('--limit <n>', 'maximum results')
  .action(async function (this: Command, opts) {
    await handleList(getCtx(program), opts);
  });

program.parseAsync();
