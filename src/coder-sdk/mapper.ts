/**
 * Coder-to-Provider Workspace Mapper
 *
 * Utilities for converting between Coder API types and Provider interface types.
 * Shared by CoderProvider and the sudocode-hub.
 *
 * @see s-9uap - sudopod-coder-sdk specification
 */

import type { Workspace, WorkspaceStatus } from '../provider/types.js';
import type { CoderWorkspace, CoderWorkspaceStatus } from './types.js';

export interface MapWorkspaceOptions {
  /** Coder instance base URL, for constructing dashboard URLs */
  baseUrl: string;
}

export function mapCoderStatusToWorkspaceStatus(status: CoderWorkspaceStatus): WorkspaceStatus {
  switch (status) {
    case 'pending':
      return 'creating';
    case 'starting':
      return 'starting';
    case 'running':
      return 'running';
    case 'stopping':
      return 'stopping';
    case 'stopped':
      return 'stopped';
    case 'deleting':
    case 'deleted':
      return 'deleting';
    case 'canceling':
    case 'canceled':
    case 'failed':
      return 'failed';
    default:
      return 'failed';
  }
}

export function mapCoderWorkspaceToWorkspace(
  cw: CoderWorkspace,
  options: MapWorkspaceOptions,
): Workspace {
  return {
    id: cw.id,
    name: cw.name,
    status: mapCoderStatusToWorkspaceStatus(cw.latest_build.status),
    repository: extractRepository(cw),
    createdAt: new Date(cw.created_at),
    lastActivityAt: cw.last_used_at ? new Date(cw.last_used_at) : undefined,
    connection: {
      ssh: {
        command: `ssh coder.${cw.name}`,
      },
      urls: {
        dashboard: `${options.baseUrl}/@${cw.owner_name}/${cw.name}`,
      },
    },
  };
}

/**
 * Extract repository info from workspace resource metadata.
 * Template-dependent — the template must expose repository info
 * as resource metadata with key "repository".
 */
function extractRepository(cw: CoderWorkspace): { owner: string; repo: string } {
  const metadata = cw.latest_build.resources.flatMap((r) => r.metadata ?? []);
  const repoMeta = metadata.find((m) => m.key === 'repository');
  if (repoMeta) {
    const [owner, repo] = repoMeta.value.split('/');
    return { owner: owner ?? '', repo: repo ?? '' };
  }
  return { owner: '', repo: '' };
}
