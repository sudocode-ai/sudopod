/**
 * Coder Workspace Orchestrator
 *
 * High-level lifecycle orchestration for Coder workspaces.
 * Combines CoderClient (API primitives) with shared setup utilities
 * to manage the full create/resume/stop/delete lifecycle.
 *
 * Used by both the self-hosted CoderProvider and the sudocode-hub server.
 *
 * @see s-9uap - sudopod-coder-sdk specification
 * @see s-6q31 - Self-Hosted Coder Provider spec
 */

import { CoderClient } from './client.js';
import { CoderApiError } from './errors.js';
import { mapCoderWorkspaceToWorkspace } from './mapper.js';
import { createCoderExecFn } from './exec.js';
import type { CoderUser } from './types.js';
import type {
  CreateOptions,
  Workspace,
  WorkspaceStatus,
  ListWorkspacesOptions,
  ExecFn,
} from '../provider/types.js';
import {
  ProviderError,
  WorkspaceNotFoundError,
  WorkspaceCreationError,
  WorkspaceStateError,
  WorkspaceTimeoutError,
  AuthenticationError,
  AuthorizationError,
  ConfigurationError,
} from '../provider/errors.js';
import { installSudocode, applySetupConfig, setupTailscale, startServices } from '../provider/setup.js';
import { printStep } from '../cli/output.js';
import { buildManifest, writeManifest, readManifest } from '../services/manifest.js';
import type { WorkspaceManifest } from '../services/manifest.js';
import { HeadscaleClient } from '../headscale/client.js';
import type { HeadscaleNode } from '../headscale/client.js';

// =============================================================================
// Constants
// =============================================================================

// Paths on the /workspaces Docker volume — persists across stop/start.
// /home/coder/ is ephemeral (rebuilt by envbuilder on each start).
const CODER_MANIFEST_PATH = '/workspaces/.sudopod/manifest.json';
const CODER_TAILSCALE_STATE_DIR = '/workspaces/.tailscale';

// =============================================================================
// Types
// =============================================================================

export interface CoderOrchestratorConfig {
  baseUrl: string;
  token: string;
}

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
// CoderOrchestrator
// =============================================================================

/**
 * High-level workspace lifecycle orchestrator for Coder.
 *
 * Encapsulates the full create/resume flow:
 * - API calls (via CoderClient)
 * - Remote execution (via ExecFn)
 * - Setup (installSudocode, applySetupConfig, setupTailscale)
 * - Manifest management (buildManifest, writeManifest, readManifest)
 * - Service management (startServices)
 *
 * Both CoderProvider (CLI) and the Hub server delegate to this class.
 */
export class CoderOrchestrator {
  private client: CoderClient;
  private exec: ExecFn;
  private baseUrl: string;
  private contextPromise?: Promise<{ user: CoderUser; organizationId: string }>;

  constructor(config: CoderOrchestratorConfig) {
    this.baseUrl = config.baseUrl;
    this.client = new CoderClient({
      baseUrl: config.baseUrl,
      token: config.token,
    });
    this.exec = createCoderExecFn({
      coderUrl: config.baseUrl,
      coderToken: config.token,
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
      printStep('Creating workspace...');
      const coderWorkspace = await this.client.createWorkspace({
        organizationId,
        username: 'me',
        name: options.name,
        templateId: template.id,
        richParameterValues,
        ttlMs: options.retentionDays * 24 * 60 * 60 * 1000,
      });

      // Wait for workspace to be running
      printStep('Waiting for workspace to start...');
      const ready = await this.client.waitForWorkspaceStatus({
        workspaceId: coderWorkspace.id,
        targetStatus: 'running',
      });

      const workspaceName = ready.name;

      // Resolve workspace directory early — needed for install and setup
      const workspaceDir = options.setup?.workspaceDir ?? `/workspaces/${options.repository.repo}`;

      // Install Node.js + sudocode — prerequisite for all workspaces
      await installSudocode(workspaceName, this.exec, workspaceDir);

      // Apply optional one-time setup config (credentials, services, tailscale, scripts)
      if (options.setup) {
        // Override tailscale defaults for Coder: kernel networking + Coder state path
        const setupWithCoderDefaults = {
          ...options.setup,
          tailscale: options.setup.tailscale
            ? {
                ...options.setup.tailscale,
                stateDir: options.setup.tailscale.stateDir ?? CODER_TAILSCALE_STATE_DIR,
                mode: options.setup.tailscale.mode ?? 'kernel' as const,
              }
            : undefined,
        };
        await applySetupConfig(workspaceName, this.exec, setupWithCoderDefaults, workspaceDir);

        // Set up .vscode-server symlink so VS Code Remote-SSH persists on EBS.
        // /root/.vscode-server is on ephemeral overlay; symlink to /workspaces/ (EBS).
        if (options.setup.tailscale) {
          await this.exec(
            workspaceName,
            'mkdir -p /workspaces/.vscode-server && rm -rf /root/.vscode-server && ln -s /workspaces/.vscode-server /root/.vscode-server',
          );
        }
      }

      // Discover Tailscale IP via Headscale API if configured
      let tailscaleNode: HeadscaleNode | undefined;
      if (options.setup?.tailscale?.headscaleApiKey && options.setup.tailscale.controlServer) {
        printStep('Discovering Tailscale node...');
        tailscaleNode = await this.discoverTailscaleNode(
          options.setup.tailscale.controlServer,
          options.setup.tailscale.headscaleApiKey,
          workspaceName,
        );
      }

      // Build manifest from setup config + Tailscale discovery
      const manifest = buildManifest({
        services: options.setup?.services ?? [],
        workspaceDir,
        credentials: options.setup?.credentials,
        tailscale: options.setup?.tailscale
          ? {
              stateDir: options.setup.tailscale.stateDir ?? CODER_TAILSCALE_STATE_DIR,
              controlServer: options.setup.tailscale.controlServer,
              mode: options.setup.tailscale.mode ?? 'kernel',
              ip: tailscaleNode?.ipAddresses[0],
              nodeId: tailscaleNode?.id,
              nodeName: tailscaleNode?.givenName,
            }
          : undefined,
        lifecycle: options.setup?.lifecycle,
        setupScript: options.setup?.setupScript,
      });

      printStep('Writing workspace manifest...');
      await writeManifest(workspaceName, this.exec, manifest, CODER_MANIFEST_PATH);

      // Apply runtime — start services, wait for ports
      printStep('Starting services...');
      await this.applyManifestRuntime(workspaceName, manifest);

      const workspace = mapCoderWorkspaceToWorkspace(ready, { baseUrl: this.baseUrl });
      return this.enrichWithTailscale(workspace, manifest);
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
        printStep('Starting workspace...');
        await this.client.startWorkspace(workspaceId);
        printStep('Waiting for workspace to start...');
        const ready = await this.client.waitForWorkspaceStatus({
          workspaceId,
          targetStatus: 'running',
        });
        const manifest = await this.applyManifestOnResume(ready.name);
        const ws = mapCoderWorkspaceToWorkspace(ready, { baseUrl: this.baseUrl });
        return manifest ? this.enrichWithTailscale(ws, manifest) : ws;
      }

      // If already running, read manifest and apply runtime
      if (status === 'running') {
        const manifest = await this.applyManifestOnResume(workspace.name);
        const ws = mapCoderWorkspaceToWorkspace(workspace, { baseUrl: this.baseUrl });
        return manifest ? this.enrichWithTailscale(ws, manifest) : ws;
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
        const manifest = await this.applyManifestOnResume(settled.name);
        const ws = mapCoderWorkspaceToWorkspace(settled, { baseUrl: this.baseUrl });
        return manifest ? this.enrichWithTailscale(ws, manifest) : ws;
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
      return mapCoderWorkspaceToWorkspace(workspace, { baseUrl: this.baseUrl });
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
        .map((w) => mapCoderWorkspaceToWorkspace(w, { baseUrl: this.baseUrl }));
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
  private async applyManifestOnResume(name: string): Promise<WorkspaceManifest | null> {
    const manifest = await readManifest(name, this.exec, CODER_MANIFEST_PATH);
    if (!manifest) return null;

    // Reinstall Node.js + sudocode if the binary is missing (envbuilder rebuild)
    const nodeCheck = await this.exec(name, 'command -v node');
    if (nodeCheck.exitCode !== 0) {
      await installSudocode(name, this.exec);
    }

    // Reconnect Tailscale if manifest has tailscale config.
    // Always attempt — setupTailscale handles all tiers (installed, not installed).
    if (manifest.tailscale) {
      printStep('Reconnecting Tailscale...');
      const stateDir = manifest.tailscale.stateDir ?? CODER_TAILSCALE_STATE_DIR;
      await setupTailscale(name, this.exec, {
        stateDir,
        controlServer: manifest.tailscale.controlServer,
        mode: manifest.tailscale.mode,
      });

      // Re-create .vscode-server symlink — envbuilder rebuilds the container overlay
      // on stop/start, so the symlink at /root/.vscode-server is lost.
      // The actual data persists on EBS at /workspaces/.vscode-server.
      await this.exec(
        name,
        'mkdir -p /workspaces/.vscode-server && rm -rf /root/.vscode-server && ln -s /workspaces/.vscode-server /root/.vscode-server',
      );
    }

    printStep('Starting services...');
    await this.applyManifestRuntime(name, manifest);
    return manifest;
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
    await startServices(name, this.exec, manifest.services, manifest.workspaceDir);
  }

  // ===========================================================================
  // Tailscale Helpers
  // ===========================================================================

  /**
   * Discover a workspace's Tailscale node in Headscale by hostname.
   * Polls with retry because the node may take a few seconds to appear
   * after `tailscale up` completes.
   */
  private async discoverTailscaleNode(
    controlServer: string,
    apiKey: string,
    hostname: string,
    timeoutMs = 30_000,
  ): Promise<HeadscaleNode> {
    const headscale = new HeadscaleClient({ baseUrl: controlServer, apiKey });
    const start = Date.now();

    while (Date.now() - start < timeoutMs) {
      const nodes = await headscale.listNodes();
      const node = nodes.find(n => n.givenName === hostname);
      if (node && node.ipAddresses.length > 0) {
        return node;
      }
      await sleep(2_000);
    }

    throw new WorkspaceTimeoutError('coder', 'discoverTailscaleNode', timeoutMs);
  }

  /**
   * Enrich a Workspace with Tailscale connection info from the manifest.
   */
  private enrichWithTailscale(workspace: Workspace, manifest: WorkspaceManifest): Workspace {
    if (!manifest.tailscale?.ip || !manifest.tailscale?.nodeId) {
      return workspace;
    }

    const ip = manifest.tailscale.ip;
    const workDir = manifest.workspaceDir ?? `/workspaces/${workspace.repository.repo || 'workspace'}`;
    const nodeName = manifest.tailscale.nodeName ?? workspace.name;

    return {
      ...workspace,
      connection: {
        ...workspace.connection,
        tailscale: {
          nodeName,
          nodeId: manifest.tailscale.nodeId,
          ip,
          sshCommand: `ssh root@${ip}`,
          vscodeCommand: `code --remote ssh-remote+root@${ip} ${workDir}`,
        },
        ssh: {
          command: `ssh root@${ip}`,
        },
        urls: {
          ...workspace.connection.urls,
          vscode: `code --remote ssh-remote+root@${ip} ${workDir}`,
        },
      },
    };
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

    // Machine type (if provided and not the CLI default placeholder)
    if (options.machineType && options.machineType !== 'default') {
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
