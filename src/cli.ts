#!/usr/bin/env node

import { Command } from 'commander';
import { createProvider } from './provider/factory.js';
import { resolveCodespacesConfig, resolveCoderConfig, resolveHubConfig } from './cli/auth.js';
import { loadConfig } from './cli/config.js';
import { printError } from './cli/output.js';
import { handleCreate } from './cli/commands/create.js';
import { handleResume } from './cli/commands/resume.js';
import { handleStop } from './cli/commands/stop.js';
import { handleDelete } from './cli/commands/delete.js';
import { handleGet } from './cli/commands/get.js';
import { handleList } from './cli/commands/list.js';
import { handleConfig, handleProviderConfig } from './cli/commands/config.js';
import { handleTailscaleConnect, handleTailscaleCreateKey } from './cli/commands/tailscale.js';
import { handleHeadscaleStart, handleHeadscaleStop } from './cli/commands/headscale.js';
import type { CommandContext } from './cli/types.js';
import type { Provider } from './provider/types.js';

const program = new Command();

program
  .name('sudopod')
  .description('CLI for provisioning and managing cloud development workspaces')
  .version('0.2.0')
  .option('--json', 'output as JSON');

// ── Helper: register the 6 workspace commands on a parent command ────────
function registerWorkspaceCommands(parent: Command, resolveProvider: () => Provider) {
  function getCtx(): CommandContext {
    return {
      provider: resolveProvider(),
      jsonOutput: !!program.opts().json,
    };
  }

  parent
    .command('create')
    .description('Create a new workspace')
    .option('--repo <owner/repo>', 'repository (default: current git repo)')
    .option('--branch <branch>', 'git branch (default: current branch)')
    .option('--retention <days>', 'retention days', '7')
    .option('--machine <type>', 'machine type', 'default')
    .option('--service <name[:port]...>', 'services to install (e.g. --service claude-code --service aider:5000)')
    .option('--setup-script <script>', 'one-time setup script')
    .option('--port <port>', 'primary service port', '3000')
    .option('--idle-timeout <minutes>', 'idle timeout in minutes')
    .option('--tailscale', 'auto-generate preauthkey from stored config')
    .option('--tailscale-auth-key <key>', 'tailscale auth key (manual)')
    .option('--tailscale-server <url>', 'tailscale control server URL')
    .action(async (opts) => { await handleCreate(getCtx(), opts); });

  parent
    .command('resume [id]')
    .description('Resume a workspace (most recent if id omitted)')
    .action(async (id?: string) => { await handleResume(getCtx(), id); });

  parent
    .command('stop <id>')
    .description('Stop a running workspace')
    .action(async (id: string) => { await handleStop(getCtx(), id); });

  parent
    .command('delete <id>')
    .description('Permanently delete a workspace')
    .action(async (id: string) => { await handleDelete(getCtx(), id); });

  parent
    .command('get <id>')
    .description('Get workspace details')
    .action(async (id: string) => { await handleGet(getCtx(), id); });

  parent
    .command('list')
    .description('List workspaces')
    .option('--status <status>', 'filter by status')
    .option('--owner <owner>', 'filter by repository owner')
    .option('--repo <repo>', 'filter by repository name')
    .option('--limit <n>', 'maximum results')
    .action(async (opts) => { await handleList(getCtx(), opts); });
}

// ── sudopod config ──────────────────────────────────────────────────────
program
  .command('config')
  .description('View or set global configuration')
  .option('--provider <name>', 'set default provider (codespaces, coder, hub)')
  .action(async (opts) => {
    await handleConfig(opts, !!program.opts().json);
  });

// ── sudopod codespaces <command> ────────────────────────────────────────
const codespaces = program
  .command('codespaces')
  .description('GitHub Codespaces provider');

registerWorkspaceCommands(codespaces, () => {
  return createProvider('codespaces', resolveCodespacesConfig());
});

// ── sudopod coder <command> ─────────────────────────────────────────────
const coder = program
  .command('coder')
  .description('Self-hosted Coder provider');

coder
  .command('config')
  .description('Configure Coder connection')
  .requiredOption('--url <url>', 'Coder instance URL')
  .requiredOption('--token <token>', 'Coder auth token')
  .action(async (opts) => {
    await handleProviderConfig('coder', opts, !!program.opts().json);
  });

registerWorkspaceCommands(coder, () => {
  return createProvider('coder', resolveCoderConfig());
});

// ── sudopod hub <command> ───────────────────────────────────────────────
const hub = program
  .command('hub')
  .description('Sudocode Hub provider');

hub
  .command('config')
  .description('Configure Hub connection')
  .requiredOption('--url <url>', 'Hub URL')
  .requiredOption('--token <token>', 'Hub auth token')
  .action(async (opts) => {
    await handleProviderConfig('hub', opts, !!program.opts().json);
  });

registerWorkspaceCommands(hub, () => {
  return createProvider('hub', resolveHubConfig());
});

// ── sudopod tailscale <command> ────────────────────────────────────────
const tailscale = program
  .command('tailscale')
  .description('Tailscale networking commands');

tailscale
  .command('connect')
  .description('Join a tailnet and store admin credentials')
  .requiredOption('--control-server <url>', 'Headscale control server URL')
  .requiredOption('--auth-key <key>', 'Preauthkey for joining the tailnet')
  .requiredOption('--api-key <key>', 'Headscale admin API key')
  .action(async (opts) => {
    await handleTailscaleConnect(opts, !!program.opts().json);
  });

tailscale
  .command('create-key')
  .description('Generate a preauthkey for a workspace')
  .option('--no-ephemeral', 'create non-ephemeral key')
  .option('--reusable', 'create reusable key')
  .option('--expiration <duration>', 'key expiration (e.g. 1h, 30m, 2d)', '1h')
  .option('--user <name>', 'Headscale user (default: first user)')
  .action(async (opts) => {
    await handleTailscaleCreateKey(opts, !!program.opts().json);
  });

// ── sudopod headscale <command> ───────────────────────────────────────
const headscaleCmd = program
  .command('headscale')
  .description('Local Headscale instance management');

headscaleCmd
  .command('start')
  .description('Start a local Headscale instance via Docker')
  .option('--port <port>', 'Headscale port', '8080')
  .action(async (opts) => {
    await handleHeadscaleStart(opts, !!program.opts().json);
  });

headscaleCmd
  .command('stop')
  .description('Stop the local Headscale instance')
  .action(async () => {
    await handleHeadscaleStop(!!program.opts().json);
  });

// ── sudopod <command> (default provider) ────────────────────────────────
registerWorkspaceCommands(program, () => {
  const config = loadConfig();
  const provider = config.defaultProvider ?? 'codespaces';

  switch (provider) {
    case 'codespaces':
      return createProvider('codespaces', resolveCodespacesConfig());
    case 'coder':
      return createProvider('coder', resolveCoderConfig());
    case 'hub':
      return createProvider('hub', resolveHubConfig());
    default:
      printError(`Unknown default provider: "${provider}". Run \`sudopod config --provider <name>\` to fix.`);
      process.exit(1);
  }
});

program.parseAsync();
