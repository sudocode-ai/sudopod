/**
 * GitHub Codespaces Provider
 *
 * Implements the Provider interface for GitHub Codespaces using the `gh` CLI.
 *
 * @see s-9cl3 - Unified Workspace Provider Architecture specification
 * @see s-84xz - Codespaces Provider Implementation specification
 */

import type {
  Provider,
  CodespacesConfig,
  CreateOptions,
  ResumeOptions,
  RuntimeConfig,
  Workspace,
  WorkspaceStatus,
  ListWorkspacesOptions,
} from '../types.js';
import {
  WorkspaceNotFoundError,
  WorkspaceCreationError,
  WorkspaceTimeoutError,
  ExecutionError,
  AuthenticationError,
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
import { installSudocode, applySetupConfig, setupTailscale } from './setup.js';
import { generateKeepaliveScript } from './keepalive.js';

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

    // Install sudocode (unconditional prerequisite)
    await installSudocode(codespaceName, execInCodespace);

    // Apply optional one-time setup config (models, agents, tailscale, scripts)
    if (options.setup) {
      await applySetupConfig(codespaceName, execInCodespace, options.setup);
    }

    // Apply runtime config (always — starts sudocode server, keepalive, port forwarding)
    const runtime = options.runtime ?? {};
    await this.applyRuntimeConfig(codespaceName, runtime);

    // Fetch final state and return
    const cs = await getCodespace(codespaceName);
    if (!cs) {
      throw new WorkspaceNotFoundError(PROVIDER_NAME, codespaceName);
    }

    const port = runtime.port ?? 3000;
    const urls: Record<string, string> = {};
    try {
      urls.sudocode = await getPortUrl(codespaceName, port);
    } catch {
      // Port URL not available — non-fatal
    }

    return mapToWorkspace(cs, urls);
  }

  async resume(
    workspaceId?: string,
    options?: ResumeOptions
  ): Promise<Workspace> {
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

    // Re-join Tailscale if config provided (Codespaces wipes /var/lib/tailscale/ on stop/start)
    if (options?.tailscale) {
      await setupTailscale(name, execInCodespace, {
        authKey: options.tailscale.authKey,
        controlServer: options.tailscale.controlServer,
      });
    }

    // Apply runtime config (always — starts sudocode server, keepalive, port forwarding)
    const runtime = options?.runtime ?? {};
    await this.applyRuntimeConfig(name, runtime);

    // Fetch final state
    const updated = await getCodespace(name);
    if (!updated) {
      throw new WorkspaceNotFoundError(PROVIDER_NAME, name);
    }

    const port = runtime.port ?? 3000;
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
   * Apply runtime configuration: start sudocode server, keepalive, port forwarding.
   */
  private async applyRuntimeConfig(
    name: string,
    runtime: RuntimeConfig
  ): Promise<void> {
    const port = runtime.port ?? 3000;

    // Check if sudocode server is already running
    const check = await execInCodespace(
      name,
      `pgrep -f "sudocode server.*--port ${port}" || true`
    );

    if (!check.stdout.trim()) {
      // Start sudocode server in the background.
      // { background: true } places & outside the SSH quotes so the SSH session
      // returns immediately. nohup ensures the process persists after SSH exit.
      await execInCodespace(
        name,
        `nohup sudocode server --port ${port} > /tmp/sudocode-${port}.log 2>&1`,
        { background: true }
      );

      // Wait for server to be ready (60s — server init can be slow on cold codespaces)
      await this.waitForPort(name, port, 60_000);
    }

    // Ensure keepalive daemon is running
    await this.ensureKeepaliveDaemon(name, runtime);

    // Forward port
    await forwardPort(name, port);
  }

  /**
   * Wait for the sudocode server port to be accepting connections.
   *
   * Tries both the root path and /health endpoint for compatibility.
   * The sudocode server serves a frontend app at / (not a REST /health endpoint).
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
    runtime: RuntimeConfig
  ): Promise<void> {
    const port = runtime.port ?? 3000;
    const idleTimeout = runtime.lifecycle?.idleTimeoutMinutes ?? 60;

    // Check if daemon is already running
    const check = await execInCodespace(
      name,
      'pgrep -f "sudocode-keepalive" || true'
    );
    if (check.stdout.trim()) return;

    // Generate and deploy the script
    const script = generateKeepaliveScript(name, port, idleTimeout);
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
