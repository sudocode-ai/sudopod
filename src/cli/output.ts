import chalk from 'chalk';
import type { Workspace, WorkspaceStatus } from '../provider/types.js';

export function formatStatus(status: WorkspaceStatus): string {
  switch (status) {
    case 'running':
      return chalk.green(status);
    case 'starting':
    case 'stopping':
    case 'creating':
      return chalk.yellow(status);
    case 'stopped':
      return chalk.gray(status);
    case 'failed':
    case 'deleting':
      return chalk.red(status);
    default:
      return status;
  }
}

export function serializeWorkspace(ws: Workspace): Record<string, unknown> {
  return {
    ...ws,
    createdAt: ws.createdAt instanceof Date ? ws.createdAt.toISOString() : ws.createdAt,
    lastActivityAt:
      ws.lastActivityAt instanceof Date
        ? ws.lastActivityAt.toISOString()
        : ws.lastActivityAt,
  };
}

export function printWorkspace(ws: Workspace): void {
  console.log(`${chalk.bold(ws.name)}  ${formatStatus(ws.status)}`);
  console.log(`  ID:   ${ws.id}`);
  console.log(`  Repo: ${ws.repository.owner}/${ws.repository.repo}`);
  console.log(`  SSH:  ${ws.connection.ssh.command}`);

  if (ws.connection.tailscale) {
    console.log(`  Tailscale: ${ws.connection.tailscale.nodeName}`);
  }

  if (ws.connection.urls) {
    for (const [label, url] of Object.entries(ws.connection.urls)) {
      console.log(`  ${label}: ${url}`);
    }
  }

  if (ws.forwardedPorts?.length) {
    for (const p of ws.forwardedPorts) {
      console.log(`  Port: ${p.local} -> ${p.remote}${p.url ? ` (${p.url})` : ''}`);
    }
  }
}

export function printWorkspaceList(workspaces: Workspace[]): void {
  if (workspaces.length === 0) {
    console.log('No workspaces found.');
    return;
  }

  for (const ws of workspaces) {
    console.log(
      `${ws.id.padEnd(24)} ${formatStatus(ws.status).padEnd(20)} ${ws.name.padEnd(24)} ${ws.repository.owner}/${ws.repository.repo}`
    );
  }
}

export function printJson(data: unknown): void {
  console.log(JSON.stringify(data, null, 2));
}

export function printError(message: string): void {
  console.error(chalk.red(`Error: ${message}`));
}

export function printSuccess(message: string): void {
  console.log(chalk.green(message));
}
