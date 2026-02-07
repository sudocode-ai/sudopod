/**
 * CoderProvider — Unified Provider implementation for self-hosted Coder.
 *
 * Thin layer that implements the Provider interface by delegating to
 * CoderClient from the coder-sdk. Uses "me" for all operations.
 *
 * Supports setup config processing, workspace manifest, and Tailscale —
 * same capabilities as the Codespaces provider, adapted for Coder's
 * environment (different paths, no port forwarding/keepalive needed).
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
  ExecFn,
} from '../types.js';
import {
  ProviderError,
  WorkspaceNotFoundError,
  WorkspaceCreationError,
  WorkspaceStateError,
  WorkspaceTimeoutError,
  AuthenticationError,
  AuthorizationError,
  ConfigurationError,
} from '../errors.js';
import { createCoderExecFn } from './cli.js';
import { installSudocode, applySetupConfig, setupTailscale, startServices } from '../codespaces/setup.js';
import { resolveService } from '../../services/registry.js';
import { writeManifest, readManifest } from '../../services/manifest.js';
import type { WorkspaceManifest } from '../../services/manifest.js';

// =============================================================================
// Constants
// =============================================================================

// Paths on the /workspaces Docker volume — persists across stop/start.
// /home/coder/ is ephemeral (rebuilt by envbuilder on each start).
const CODER_MANIFEST_PATH = '/workspaces/.sudopod/manifest.json';
const CODER_TAILSCALE_STATE_DIR = '/workspaces/.tailscale';

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

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// =============================================================================
// CoderProvider
// =============================================================================

export class CoderProvider implements Provider {
  readonly name = 'Coder';
  private client: CoderClient;
  private exec: ExecFn;
  private contextPromise?: Promise<{ user: CoderUser; organizationId: string }>;

  constructor(private config: CoderConfig) {
    this.client = new CoderClient({
      baseUrl: config.url,
      token: config.authToken,
    });
    this.exec = createCoderExecFn({
      coderUrl: config.url,
      coderToken: config.authToken,
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

      const workspaceName = ready.name;

      // Install Node.js + sudocode — prerequisite for all workspaces
      await installSudocode(workspaceName, this.exec);

      // Apply optional one-time setup config (credentials, services, tailscale, scripts)
      if (options.setup) {
        // Override tailscale stateDir default to Coder path
        const setupWithCoderDefaults = {
          ...options.setup,
          tailscale: options.setup.tailscale
            ? {
                ...options.setup.tailscale,
                stateDir: options.setup.tailscale.stateDir ?? CODER_TAILSCALE_STATE_DIR,
              }
            : undefined,
        };
        await applySetupConfig(workspaceName, this.exec, setupWithCoderDefaults);
      }

      // Resolve services from setup config
      const resolvedServices = (options.setup?.services ?? []).map(
        svc => resolveService(svc.name, svc.port),
      );

      // Build and write manifest
      const manifest: WorkspaceManifest = {
        version: 1,
        services: resolvedServices,
        credentials: options.setup?.credentials,
        tailscale: options.setup?.tailscale
          ? {
              stateDir: options.setup.tailscale.stateDir ?? CODER_TAILSCALE_STATE_DIR,
              controlServer: options.setup.tailscale.controlServer,
            }
          : undefined,
        lifecycle: options.setup?.lifecycle,
        setupScript: options.setup?.setupScript,
        createdAt: new Date().toISOString(),
      };

      await writeManifest(workspaceName, this.exec, manifest, CODER_MANIFEST_PATH);

      // Apply runtime — start services, wait for ports
      await this.applyManifestRuntime(workspaceName, manifest);

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
        await this.applyManifestOnResume(ready.name);
        return mapCoderWorkspaceToWorkspace(ready, { baseUrl: this.config.url });
      }

      // If already running, read manifest and apply runtime
      if (status === 'running') {
        await this.applyManifestOnResume(workspace.name);
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
        await this.applyManifestOnResume(settled.name);
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
  // Private Helpers — Runtime
  // ===========================================================================

  /**
   * Read manifest and apply all runtime config on resume.
   *
   * Envbuilder workspaces rebuild the container on stop/start, so system-level
   * installs (Node.js, tailscale, sudocode) are lost. The manifest and tailscale
   * state persist on the /workspaces volume. This method:
   *   1. Reinstalls Node.js + sudocode if missing
   *   2. Reconnects Tailscale (re-installing the binary if needed)
   *   3. Restarts services
   */
  private async applyManifestOnResume(name: string): Promise<void> {
    const manifest = await readManifest(name, this.exec, CODER_MANIFEST_PATH);
    if (!manifest) return;

    // Reinstall Node.js + sudocode if the binary is missing (envbuilder rebuild)
    const nodeCheck = await this.exec(name, 'command -v node');
    if (nodeCheck.exitCode !== 0) {
      await installSudocode(name, this.exec);
    }

    // Reconnect Tailscale if manifest has tailscale config.
    // Always attempt — setupTailscale handles all tiers (installed, not installed).
    if (manifest.tailscale) {
      const stateDir = manifest.tailscale.stateDir ?? CODER_TAILSCALE_STATE_DIR;
      await setupTailscale(name, this.exec, {
        stateDir,
        controlServer: manifest.tailscale.controlServer,
      });
    }

    await this.applyManifestRuntime(name, manifest);
  }

  /**
   * Apply runtime from a workspace manifest.
   * Simpler than Codespaces — no port forwarding, no keepalive needed.
   * Coder handles port forwarding via its web UI and activity tracking at the template level.
   */
  private async applyManifestRuntime(
    name: string,
    manifest: WorkspaceManifest,
  ): Promise<void> {
    // startServices now handles both starting and port verification in a single
    // SSH command (required for Coder — processes die between SSH sessions).
    await startServices(name, this.exec, manifest.services);
  }

  /**
   * Wait for a port to be accepting connections.
   */
  private async waitForPort(
    name: string,
    port: number,
    timeoutMs = 30_000,
  ): Promise<void> {
    const start = Date.now();
    while (Date.now() - start < timeoutMs) {
      const result = await this.exec(
        name,
        `curl -sf --max-time 2 -o /dev/null http://localhost:${port}/ || curl -sf --max-time 2 -o /dev/null http://localhost:${port}/health`,
      );
      if (result.exitCode === 0) return;
      await sleep(2_000);
    }
    throw new WorkspaceTimeoutError('coder', 'waitForPort', timeoutMs);
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
