/**
 * GitHub Codespaces Provider
 *
 * Implements the Provider interface for GitHub Codespaces using the `gh` CLI.
 *
 * @see s-9cl3 - Unified Workspace Provider Architecture specification
 * @see s-84xz - Codespaces Provider Implementation specification
 * @see s-4ge4 - Service Registry & Workspace Manifest spec
 */

import type {
  Provider,
  CodespacesConfig,
  CreateOptions,
  Workspace,
  WorkspaceStatus,
  ListWorkspacesOptions,
} from '../types.js';
import {
  WorkspaceNotFoundError,
  WorkspaceCreationError,
  WorkspaceTimeoutError,
} from '../errors.js';
import {
  execInCodespace,
  createCodespace,
  startCodespace,
  stopCodespace as cliStopCodespace,
  deleteCodespace as cliDeleteCodespace,
  getCodespace,
  listCodespaces,
  forwardPort,
  getPortUrl,
  getPorts,
} from './cli.js';
import type { GhCodespace } from './cli.js';
import { applySetupConfig, setupTailscale, startServices, DEFAULT_STATE_DIR } from './setup.js';
import { generateKeepaliveScript } from './keepalive.js';
import { resolveService } from '../../services/registry.js';
import type { WorkspaceManifest } from '../../services/manifest.js';
import { writeManifest, readManifest } from '../../services/manifest.js';

const PROVIDER_NAME = 'codespaces';

/**
 * Map gh CLI codespace state to WorkspaceStatus.
 */
function mapStatus(state: string): WorkspaceStatus {
  switch (state) {
    case 'Available':
      return 'running';
    case 'Starting':
      return 'starting';
    case 'Shutdown':
      return 'stopped';
    case 'ShuttingDown':
      return 'stopping';
    case 'Provisioning':
      return 'creating';
    case 'Deleted':
      return 'deleting';
    default:
      return 'failed';
  }
}

/**
 * Map a gh codespace JSON object to a Workspace.
 */
function mapToWorkspace(
  cs: GhCodespace,
  urls?: Record<string, string>
): Workspace {
  const [owner, repo] = cs.repository.split('/');
  return {
    id: cs.name,
    name: cs.name,
    status: mapStatus(cs.state),
    repository: { owner, repo },
    createdAt: new Date(cs.createdAt),
    lastActivityAt: cs.lastUsedAt ? new Date(cs.lastUsedAt) : undefined,
    connection: {
      ssh: {
        command: `gh codespace ssh -c ${cs.name}`,
      },
      urls: {
        ide: `https://${cs.name}.github.dev`,
        dashboard: `https://github.com/codespaces/${cs.name}`,
        ...urls,
      },
    },
  };
}

/**
 * Sleep for a given number of milliseconds.
 */
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * GitHub Codespaces provider implementation.
 *
 * Uses the `gh` CLI for all operations. Auth token is retrieved
 * via `gh auth token` and passed in the config.
 */
export class CodespacesProvider implements Provider {
  readonly name = 'GitHub Codespaces';

  constructor(private config: CodespacesConfig) {}

  async create(options: CreateOptions): Promise<Workspace> {
    const repo = `${options.repository.owner}/${options.repository.repo}`;
    const branch = options.repository.branch ?? 'main';
    const machine = options.machineType ?? 'basicLinux32gb';

    let codespaceName: string;
    try {
      codespaceName = await createCodespace(
        repo,
        branch,
        machine,
        options.retentionDays
      );
    } catch (error) {
      throw new WorkspaceCreationError(
        PROVIDER_NAME,
        `Failed to create codespace for ${repo}`,
        error instanceof Error ? error : undefined
      );
    }

    // Wait for codespace to be available
    await this.waitForStatus(codespaceName, 'running', 300_000);

    // Apply optional one-time setup config (credentials, services, tailscale, scripts)
    if (options.setup) {
      await applySetupConfig(codespaceName, execInCodespace, options.setup);
    }

    // Resolve services from setup config
    const resolvedServices = (options.setup?.services ?? []).map(
      svc => resolveService(svc.name, svc.port),
    );

    const manifest: WorkspaceManifest = {
      version: 1,
      services: resolvedServices,
      credentials: options.setup?.credentials,
      tailscale: options.setup?.tailscale
        ? {
            stateDir: options.setup.tailscale.stateDir ?? DEFAULT_STATE_DIR,
            controlServer: options.setup.tailscale.controlServer,
          }
        : undefined,
      lifecycle: options.setup?.lifecycle,
      setupScript: options.setup?.setupScript,
      createdAt: new Date().toISOString(),
    };

    // Write manifest to disk
    await writeManifest(codespaceName, execInCodespace, manifest);

    // Apply runtime — start services, health check, keepalive, port forward
    await this.applyManifestRuntime(codespaceName, manifest);

    // Fetch final state and return
    const cs = await getCodespace(codespaceName);
    if (!cs) {
      throw new WorkspaceNotFoundError(PROVIDER_NAME, codespaceName);
    }

    const urls: Record<string, string> = {};
    const sudocodeSvc = resolvedServices.find(s => s.name === 'sudocode');
    if (sudocodeSvc?.port) {
      try {
        urls.sudocode = await getPortUrl(codespaceName, sudocodeSvc.port);
      } catch {
        // Port URL not available — non-fatal
      }
    }

    return mapToWorkspace(cs, urls);
  }

  async resume(workspaceId?: string): Promise<Workspace> {
    // If no workspaceId, get the most recently created codespace
    let name = workspaceId;
    if (!name) {
      const all = await listCodespaces();
      if (all.length === 0) {
        throw new WorkspaceNotFoundError(
          PROVIDER_NAME,
          '<most recent>'
        );
      }
      // Sort by createdAt descending
      all.sort(
        (a, b) =>
          new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
      );
      name = all[0].name;
    }

    // Check current state
    const cs = await getCodespace(name);
    if (!cs) {
      throw new WorkspaceNotFoundError(PROVIDER_NAME, name);
    }

    const status = mapStatus(cs.state);

    // Start if stopped
    if (status === 'stopped') {
      try {
        await startCodespace(name);
      } catch (error) {
        throw new WorkspaceCreationError(
          PROVIDER_NAME,
          `Failed to start codespace ${name}`,
          error instanceof Error ? error : undefined
        );
      }
      await this.waitForStatus(name, 'running', 120_000);
    }

    // Read manifest from disk
    const manifest = await readManifest(name, execInCodespace);

    if (manifest) {
      // Reconnect Tailscale if manifest has tailscale config
      if (manifest.tailscale) {
        const stateDir = manifest.tailscale.stateDir ?? DEFAULT_STATE_DIR;
        const stateCheck = await execInCodespace(
          name,
          `test -f ${stateDir}/tailscaled.state && echo exists`,
        );
        if (stateCheck.stdout.trim() === 'exists') {
          await setupTailscale(name, execInCodespace, {
            stateDir,
            controlServer: manifest.tailscale.controlServer,
          });
        }
      }

      // Apply runtime from manifest
      await this.applyManifestRuntime(name, manifest);
    } else {
      // Legacy fallback — pre-manifest workspace
      await this.applyLegacyRuntimeConfig(name);
    }

    // Fetch final state
    const updated = await getCodespace(name);
    if (!updated) {
      throw new WorkspaceNotFoundError(PROVIDER_NAME, name);
    }

    // Get primary service port from manifest, or default 3000 for legacy
    const port = manifest?.services.find(s => s.name === 'sudocode')?.port ?? 3000;
    const urls: Record<string, string> = {};
    try {
      urls.sudocode = await getPortUrl(name, port);
    } catch {
      // Port URL not available — non-fatal
    }

    return mapToWorkspace(updated, urls);
  }

  async stop(workspaceId: string): Promise<void> {
    const cs = await getCodespace(workspaceId);
    if (!cs) {
      throw new WorkspaceNotFoundError(PROVIDER_NAME, workspaceId);
    }
    // No-op if already stopped
    if (mapStatus(cs.state) === 'stopped') {
      return;
    }
    await cliStopCodespace(workspaceId);
  }

  async delete(workspaceId: string): Promise<void> {
    await cliDeleteCodespace(workspaceId);
  }

  async get(workspaceId: string): Promise<Workspace> {
    const cs = await getCodespace(workspaceId);
    if (!cs) {
      throw new WorkspaceNotFoundError(PROVIDER_NAME, workspaceId);
    }

    // Try to get ports for URL info
    let urls: Record<string, string> | undefined;
    if (mapStatus(cs.state) === 'running') {
      try {
        const ports = await getPorts(workspaceId);
        const sudocodePort = ports.find((p) => p.sourcePort === 3000);
        if (sudocodePort) {
          urls = { sudocode: sudocodePort.browseUrl };
        }
      } catch {
        // Ports not available — that's fine
      }
    }

    return mapToWorkspace(cs, urls);
  }

  async list(filters?: ListWorkspacesOptions): Promise<Workspace[]> {
    const codespaces = await listCodespaces();

    let workspaces = codespaces.map((cs) => mapToWorkspace(cs));

    if (filters?.status?.length) {
      workspaces = workspaces.filter((w) =>
        filters.status!.includes(w.status)
      );
    }
    if (filters?.owner) {
      workspaces = workspaces.filter(
        (w) => w.repository.owner === filters.owner
      );
    }
    if (filters?.repo) {
      workspaces = workspaces.filter(
        (w) => w.repository.repo === filters.repo
      );
    }
    if (filters?.limit !== undefined) {
      workspaces = workspaces.slice(0, filters.limit);
    }

    return workspaces;
  }

  // ===========================================================================
  // Private helpers
  // ===========================================================================

  /**
   * Apply runtime from a workspace manifest.
   * Starts services, waits for ports, sets up keepalive, forwards ports.
   */
  private async applyManifestRuntime(
    name: string,
    manifest: WorkspaceManifest,
  ): Promise<void> {
    // Start all services
    const startedPorts = await startServices(name, execInCodespace, manifest.services);

    // Wait for each service port to be ready
    for (const port of startedPorts) {
      await this.waitForPort(name, port, 60_000);
    }

    // Keepalive using primary service (sudocode) port
    const primaryPort = manifest.services.find(s => s.name === 'sudocode')?.port ?? 3000;
    const idleTimeout = manifest.lifecycle?.idleTimeoutMinutes ?? 60;
    await this.ensureKeepaliveDaemon(name, primaryPort, idleTimeout);

    // Forward all service ports
    for (const port of startedPorts) {
      await forwardPort(name, port);
    }
  }

  /**
   * Legacy fallback for pre-manifest workspaces.
   * Hardcodes sudocode on port 3000.
   * @deprecated Will be removed once all workspaces have manifests.
   */
  private async applyLegacyRuntimeConfig(name: string): Promise<void> {
    const port = 3000;

    // Reconnect Tailscale if persisted state exists
    const stateDir = DEFAULT_STATE_DIR;
    const stateCheck = await execInCodespace(
      name,
      `test -f ${stateDir}/tailscaled.state && echo exists`,
    );
    if (stateCheck.stdout.trim() === 'exists') {
      await setupTailscale(name, execInCodespace, { stateDir });
    }

    // Check if sudocode server is already running
    const check = await execInCodespace(
      name,
      `pgrep -f "sudocode server.*--port ${port}" || true`
    );

    if (!check.stdout.trim()) {
      await execInCodespace(
        name,
        `nohup sudocode server --port ${port} > /tmp/sudocode-${port}.log 2>&1`,
        { background: true }
      );
      await this.waitForPort(name, port, 60_000);
    }

    await this.ensureKeepaliveDaemon(name, port, 60);
    await forwardPort(name, port);
  }

  /**
   * Wait for a port to be accepting connections.
   */
  private async waitForPort(
    name: string,
    port: number,
    timeoutMs = 30_000
  ): Promise<void> {
    const start = Date.now();
    while (Date.now() - start < timeoutMs) {
      const result = await execInCodespace(
        name,
        `curl -sf --max-time 2 -o /dev/null http://localhost:${port}/ || curl -sf --max-time 2 -o /dev/null http://localhost:${port}/health`
      );
      if (result.exitCode === 0) return;
      await sleep(2_000);
    }
    throw new WorkspaceTimeoutError(PROVIDER_NAME, 'waitForPort', timeoutMs);
  }

  /**
   * Ensure the keepalive daemon is running inside the codespace.
   */
  private async ensureKeepaliveDaemon(
    name: string,
    port: number,
    idleTimeoutMinutes: number,
  ): Promise<void> {
    // Check if daemon is already running
    const check = await execInCodespace(
      name,
      'pgrep -f "sudocode-keepalive" || true'
    );
    if (check.stdout.trim()) return;

    // Generate and deploy the script
    const script = generateKeepaliveScript(name, port, idleTimeoutMinutes);
    const encoded = Buffer.from(script).toString('base64');

    await execInCodespace(
      name,
      `echo "${encoded}" | base64 -d > /tmp/sudocode-keepalive.sh`
    );
    await execInCodespace(name, 'chmod +x /tmp/sudocode-keepalive.sh');
    await execInCodespace(
      name,
      'nohup /tmp/sudocode-keepalive.sh > /tmp/sudocode-keepalive.log 2>&1',
      { background: true }
    );
  }

  /**
   * Poll until a codespace reaches the expected status.
   */
  private async waitForStatus(
    name: string,
    expectedStatus: WorkspaceStatus,
    timeoutMs: number
  ): Promise<void> {
    const start = Date.now();
    while (Date.now() - start < timeoutMs) {
      const cs = await getCodespace(name);
      if (cs && mapStatus(cs.state) === expectedStatus) return;
      await sleep(2_000);
    }
    throw new WorkspaceTimeoutError(PROVIDER_NAME, 'waitForStatus', timeoutMs);
  }
}
