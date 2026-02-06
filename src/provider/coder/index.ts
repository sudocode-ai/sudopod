/**
 * CoderProvider — Unified Provider implementation for self-hosted Coder.
 *
 * Thin layer that implements the Provider interface by delegating to
 * CoderClient from the coder-sdk. Uses "me" for all operations.
 *
 * @see s-6q31 - Self-Hosted Coder Provider spec
 * @see s-9cl3 - Unified Workspace Provider Architecture
 */

import { CoderClient } from '../../coder-sdk/client.js';
import { CoderApiError } from '../../coder-sdk/errors.js';
import { mapCoderWorkspaceToWorkspace } from '../../coder-sdk/mapper.js';
import type { CoderUser } from '../../coder-sdk/types.js';
import type {
  Provider,
  CoderConfig,
  CreateOptions,
  Workspace,
  WorkspaceStatus,
  ListWorkspacesOptions,
} from '../types.js';
import {
  ProviderError,
  WorkspaceNotFoundError,
  WorkspaceCreationError,
  WorkspaceStateError,
  AuthenticationError,
  AuthorizationError,
  ConfigurationError,
} from '../errors.js';

// =============================================================================
// Status Mapping
// =============================================================================

function mapWorkspaceStatusToCoderQuery(status: WorkspaceStatus): string {
  switch (status) {
    case 'creating':  return 'pending';
    case 'starting':  return 'starting';
    case 'running':   return 'running';
    case 'stopping':  return 'stopping';
    case 'stopped':   return 'stopped';
    case 'deleting':  return 'deleting';
    case 'failed':    return 'failed';
    default:          return status;
  }
}

// =============================================================================
// CoderProvider
// =============================================================================

export class CoderProvider implements Provider {
  readonly name = 'Coder';
  private client: CoderClient;
  private contextPromise?: Promise<{ user: CoderUser; organizationId: string }>;

  constructor(private config: CoderConfig) {
    this.client = new CoderClient({
      baseUrl: config.url,
      token: config.authToken,
    });
  }

  // ===========================================================================
  // Lazy Context Resolution
  // ===========================================================================

  private async resolveContext(): Promise<{ user: CoderUser; organizationId: string }> {
    if (!this.contextPromise) {
      this.contextPromise = (async () => {
        const user = await this.client.getCurrentUser();
        const organizationId = user.organization_ids[0];
        if (!organizationId) {
          throw new ConfigurationError('coder', 'User has no organization');
        }
        return { user, organizationId };
      })();
    }
    return this.contextPromise;
  }

  // ===========================================================================
  // Lifecycle Operations
  // ===========================================================================

  async create(options: CreateOptions): Promise<Workspace> {
    try {
      const { organizationId } = await this.resolveContext();

      // Resolve template by name (default: "default")
      const templateName = (options.templateParams?.template as string) ?? 'default';
      const template = await this.client.getTemplateByName(organizationId, templateName);

      // Build rich parameters from CreateOptions
      const richParameterValues = this.buildRichParameters(options);

      // Create workspace as "me"
      const coderWorkspace = await this.client.createWorkspace({
        organizationId,
        username: 'me',
        name: options.name,
        templateId: template.id,
        richParameterValues,
        ttlMs: options.retentionDays * 24 * 60 * 60 * 1000,
      });

      // Wait for workspace to be running
      const ready = await this.client.waitForWorkspaceStatus({
        workspaceId: coderWorkspace.id,
        targetStatus: 'running',
      });

      return mapCoderWorkspaceToWorkspace(ready, { baseUrl: this.config.url });
    } catch (err) {
      throw this.mapError(err, 'create');
    }
  }

  async resume(workspaceId?: string): Promise<Workspace> {
    try {
      // If no workspaceId, find the most recent workspace
      if (!workspaceId) {
        const { workspaces } = await this.client.listWorkspaces({
          query: 'owner:me',
          limit: 1,
        });
        if (workspaces.length === 0) {
          throw new WorkspaceNotFoundError('coder', 'unknown');
        }
        workspaceId = workspaces[0].id;
      }

      // Get current state
      const workspace = await this.client.getWorkspace(workspaceId);
      const status = workspace.latest_build.status;

      // If stopped, start it
      if (status === 'stopped') {
        await this.client.startWorkspace(workspaceId);
        const ready = await this.client.waitForWorkspaceStatus({
          workspaceId,
          targetStatus: 'running',
        });
        return mapCoderWorkspaceToWorkspace(ready, { baseUrl: this.config.url });
      }

      // If already running, return as-is
      if (status === 'running') {
        return mapCoderWorkspaceToWorkspace(workspace, { baseUrl: this.config.url });
      }

      // If in a transitional state, wait for it to settle
      if (['starting', 'stopping', 'pending'].includes(status)) {
        const targetStatus = workspace.latest_build.transition === 'stop' ? 'stopped' : 'running';
        const settled = await this.client.waitForWorkspaceStatus({
          workspaceId,
          targetStatus,
        });
        // If it settled to stopped, start it
        if (settled.latest_build.status === 'stopped') {
          return this.resume(workspaceId);
        }
        return mapCoderWorkspaceToWorkspace(settled, { baseUrl: this.config.url });
      }

      // Failed or deleted — cannot resume
      throw new WorkspaceStateError(
        'coder', 'resume', workspaceId, status, ['running', 'stopped', 'starting', 'stopping'],
      );
    } catch (err) {
      throw this.mapError(err, 'resume');
    }
  }

  async stop(workspaceId: string): Promise<void> {
    try {
      await this.client.stopWorkspace(workspaceId);
      await this.client.waitForWorkspaceStatus({
        workspaceId,
        targetStatus: 'stopped',
      });
    } catch (err) {
      throw this.mapError(err, 'stop');
    }
  }

  async delete(workspaceId: string): Promise<void> {
    try {
      await this.client.deleteWorkspace(workspaceId);
      // Don't wait — deletion can take a while
    } catch (err) {
      throw this.mapError(err, 'delete');
    }
  }

  // ===========================================================================
  // Query Operations
  // ===========================================================================

  async get(workspaceId: string): Promise<Workspace> {
    try {
      const workspace = await this.client.getWorkspace(workspaceId);
      return mapCoderWorkspaceToWorkspace(workspace, { baseUrl: this.config.url });
    } catch (err) {
      throw this.mapError(err, 'get');
    }
  }

  async list(filters?: ListWorkspacesOptions): Promise<Workspace[]> {
    try {
      // Build Coder search query
      let query = 'owner:me';
      if (filters?.status?.length) {
        const coderStatuses = filters.status.map(mapWorkspaceStatusToCoderQuery);
        query += ` status:${coderStatuses.join(',')}`;
      }

      const { workspaces } = await this.client.listWorkspaces({
        query,
        limit: filters?.limit ?? 50,
      });

      return workspaces
        .filter((w) => {
          if (filters?.owner || filters?.repo) {
            const metadata = w.latest_build.resources.flatMap((r) => r.metadata ?? []);
            const repoMeta = metadata.find((m) => m.key === 'repository');
            if (repoMeta) {
              const [owner, repo] = repoMeta.value.split('/');
              if (filters.owner && owner !== filters.owner) return false;
              if (filters.repo && repo !== filters.repo) return false;
            } else {
              // No repository metadata — can't match owner/repo filter
              return false;
            }
          }
          return true;
        })
        .map((w) => mapCoderWorkspaceToWorkspace(w, { baseUrl: this.config.url }));
    } catch (err) {
      throw this.mapError(err, 'list');
    }
  }

  // ===========================================================================
  // Template Parameter Mapping
  // ===========================================================================

  private buildRichParameters(options: CreateOptions): Array<{ name: string; value: string }> {
    const params: Array<{ name: string; value: string }> = [];

    // Repository
    params.push({
      name: 'repository',
      value: `${options.repository.owner}/${options.repository.repo}`,
    });
    if (options.repository.branch) {
      params.push({ name: 'branch', value: options.repository.branch });
    }

    // Machine type (if provided)
    if (options.machineType) {
      params.push({ name: 'machine_type', value: options.machineType });
    }

    // Pass through all templateParams (except "template" which is used for template name lookup)
    if (options.templateParams) {
      for (const [key, value] of Object.entries(options.templateParams)) {
        if (key !== 'template') {
          params.push({ name: key, value: String(value) });
        }
      }
    }

    return params;
  }

  // ===========================================================================
  // Error Mapping
  // ===========================================================================

  private mapError(err: unknown, operation: string): ProviderError {
    // Don't double-wrap Provider errors
    if (err instanceof ProviderError) return err;

    if (err instanceof CoderApiError) {
      if (err.isNotFound) return new WorkspaceNotFoundError('coder', err.path);
      if (err.isUnauthorized) return new AuthenticationError('coder', err.message);
      if (err.isForbidden) return new AuthorizationError('coder', operation, err.message);
      if (err.isConflict) return new WorkspaceCreationError('coder', err.message);
      return new ProviderError(err.message, 'coder', operation);
    }

    return new ProviderError(String(err), 'coder', operation);
  }
}
