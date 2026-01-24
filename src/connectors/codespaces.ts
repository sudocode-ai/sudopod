/**
 * GitHub Codespaces connector implementation
 */

import type {
  CodespacesConfig,
  CodespacesDeployOptions,
  DeployOptions,
  Deployment,
  DeploymentStatus,
  DeploymentUrls,
  ListFilters,
} from '../types.js';
import type { Connector } from '../core/connector.js';
import {
  AuthenticationError,
  DeploymentFailedError,
  ConnectorError,
} from '../core/errors.js';
import {
  checkGhCliInstalled,
  checkGhAuthenticated,
  createCodespace,
  waitForCodespaceReady,
  deleteCodespace,
  listCodespaces,
  getCodespaceInfo,
} from '../utils/codespaces/management.js';
import type { CodespaceInfo } from '../utils/codespaces/types.js';
import {
  waitForPortListening,
  forwardPort,
  getCodespacePortUrl,
} from '../utils/codespaces/ports.js';
import {
  installClaudeCode,
  installSudocodeGlobally,
  installSudocodeFromLocal,
  initializeSudocodeProject,
} from '../utils/codespaces/installation.js';
import {
  startSudocodeServer,
} from '../utils/codespaces/server.js';
import {
  startIdleTimeoutDaemon,
} from '../utils/codespaces/keepalive.js';

/**
 * Connector implementation for GitHub Codespaces
 * 
 * This connector manages remote development environments using GitHub Codespaces.
 * Authentication is handled through the gh CLI, which must be properly configured
 * before using this connector.
 */
export class CodespacesConnector implements Connector {
  readonly type = 'codespaces' as const;

  constructor(private config: CodespacesConfig) {}

  /**
   * Deploy a new Codespace with sudocode
   */
  async deploy(options: DeployOptions): Promise<Deployment> {
    // Validate prerequisites
    await this.checkPrerequisites();

    // Extract git repository information
    const { owner, repo, branch } = options.git;
    const repository = `${owner}/${repo}`;
    
    // Extract connector-specific options
    const connectorOpts = options.providerOptions as CodespacesDeployOptions;
    const machine = connectorOpts.machine || 'basicLinux32gb';
    const retentionPeriod = connectorOpts.retentionPeriod || 14;

    // Determine workspace directory
    const workspaceName = repo;
    const workspaceDir = options.workspaceDir || `/workspaces/${workspaceName}`;

    try {
      // Create Codespace with hardcoded 5-minute idle timeout
      // Our idle timeout daemon will prevent GitHub's auto-stop until user's idle_timeout expires
      const codespace = await createCodespace({
        repository,
        machine,
        idleTimeout: 5, // Hardcoded 5 minutes - daemon prevents auto-stop
        retentionPeriod,
        branch,
      });

      // Wait for ready
      await waitForCodespaceReady(codespace.name, 30);

      // Install sudocode
      const isDev = options.dev || false;
      await this.installSudocode(codespace.name, isDev, workspaceDir);

      // Start server and daemon
      const port = options.server.port || 3000;
      const idleTimeout = options.server.idleTimeout;
      
      await this.startServer(
        codespace.name,
        port,
        idleTimeout,
        workspaceDir,
        isDev,
        options.models?.claudeLtt
      );

      // Register port with GitHub (handles local port conflicts)
      await this.registerPortWithGitHub(codespace.name, port);

      // Get URLs
      const urls = await this.getUrls(codespace.name, port);

      // Return deployment info
      return {
        id: codespace.name,
        name: codespace.name,
        provider: 'codespaces',
        git: {
          owner,
          repo,
          branch,
        },
        status: 'running',
        createdAt: new Date().toISOString(),
        urls,
        keepAliveHours: options.server.keepAliveHours || 72,
        idleTimeout,
        metadata: {
          codespaces: {
            machine,
            retentionPeriod,
          },
        },
      };

    } catch (error: any) {
      throw new DeploymentFailedError(error.message, error);
    }
  }

  /**
   * Stop and delete a Codespace
   */
  async stop(name: string): Promise<void> {
    try {
      await deleteCodespace(name);
    } catch (error: any) {
      throw new ConnectorError('codespaces', 'stop', error.message);
    }
  }

  /**
   * Get status of a Codespace
   */
  async getStatus(name: string): Promise<DeploymentStatus> {
    try {
      const codespace = await getCodespaceInfo(name);
      return this.mapStatus(codespace.state);
    } catch (error: any) {
      throw new ConnectorError('codespaces', 'getStatus', error.message);
    }
  }

  /**
   * List Codespaces
   */
  async list(filters?: ListFilters): Promise<Deployment[]> {
    try {
      const codespaces = await listCodespaces();
      
      // Convert to Deployment objects
      let deployments = codespaces.map(cs => this.mapToDeployment(cs));

      // Apply filters
      if (filters?.status) {
        deployments = deployments.filter(d => 
          filters.status!.includes(d.status)
        );
      }
      if (filters?.owner) {
        deployments = deployments.filter(d => 
          d.git.owner === filters.owner
        );
      }
      if (filters?.repo) {
        deployments = deployments.filter(d => 
          d.git.repo === filters.repo
        );
      }
      if (filters?.createdAfter) {
        deployments = deployments.filter(d => 
          d.createdAt >= filters.createdAfter!
        );
      }
      if (filters?.createdBefore) {
        deployments = deployments.filter(d => 
          d.createdAt <= filters.createdBefore!
        );
      }

      return deployments;
    } catch (error: any) {
      throw new ConnectorError('codespaces', 'list', error.message);
    }
  }

  /**
   * Get URLs for a Codespace
   */
  async getUrls(name: string, port: number = 3000): Promise<DeploymentUrls> {
    const codespace = await getCodespaceInfo(name);
    const workspace = `https://${name}.github.dev`;
    const sudocode = await getCodespacePortUrl(name, port);
    const ssh = `gh codespace ssh --codespace ${name}`;

    return {
      workspace,
      sudocode,
      ssh,
    };
  }

  /**
   * Check prerequisites (gh CLI installed and authenticated)
   */
  private async checkPrerequisites(): Promise<void> {
    try {
      await checkGhCliInstalled();
    } catch {
      throw new AuthenticationError(
        'codespaces',
        'GitHub CLI not found. Install from https://cli.github.com'
      );
    }

    try {
      await checkGhAuthenticated();
    } catch {
      throw new AuthenticationError(
        'codespaces',
        'Not authenticated with GitHub. Run: gh auth login'
      );
    }
  }

  /**
   * Install sudocode in Codespace
   */
  private async installSudocode(
    name: string,
    isDev: boolean,
    workspaceDir: string
  ): Promise<void> {
    await installClaudeCode(name);

    if (isDev) {
      await installSudocodeFromLocal(name);
    } else {
      await installSudocodeGlobally(name);
    }

    await initializeSudocodeProject(name);
  }

  /**
   * Start sudocode server and idle timeout daemon
   */
  private async startServer(
    name: string,
    port: number,
    idleTimeout: number | undefined,
    workspaceDir: string,
    isDev: boolean,
    claudeAuthToken?: string
  ): Promise<void> {
    // Start server process
    await startSudocodeServer(name, port, {
      claudeAuthToken
    });

    // Wait for port to be listening
    await waitForPortListening(name, port, 30);

    // Start idle timeout daemon with user's configured idle_timeout
    const idleTimeoutHours = idleTimeout !== undefined 
      ? idleTimeout / 60  // Convert minutes to hours
      : 72; // Default: 72 hours (3 days)
    
    await startIdleTimeoutDaemon({
      codespaceName: name,
      serverPort: port,
      serverLogPath: `/tmp/sudocode-${port}.log`,
      idleTimeoutHours,
      sshIntervalMinutes: 0.5, // SSH every 30 seconds
    });
  }

  /**
   * Register port with GitHub forwarding system
   */
  private async registerPortWithGitHub(name: string, port: number): Promise<void> {
    // Forward port to register it with GitHub's forwarding system
    // The forwardPort function starts a forward, waits briefly, then kills it
    // The port remains registered after the forward process exits
    await forwardPort(name, port);
  }

  /**
   * Map Codespace state to DeploymentStatus
   */
  private mapStatus(state: string): DeploymentStatus {
    const statusMap: Record<string, DeploymentStatus> = {
      'Available': 'running',
      'Starting': 'starting',
      'Shutdown': 'stopped',
      'Unavailable': 'stopped',
      'Pending': 'provisioning',
    };
    return statusMap[state] || 'failed';
  }

  /**
   * Convert CodespaceInfo to Deployment
   */
  private mapToDeployment(cs: CodespaceInfo): Deployment {
    // Parse repository string "owner/repo" into components
    const [owner, repo] = (cs.repository || 'unknown/unknown').split('/');
    
    return {
      id: cs.name,
      name: cs.displayName || cs.name,
      provider: 'codespaces',
      git: {
        owner,
        repo,
        branch: cs.branch,
      },
      status: this.mapStatus(cs.state),
      createdAt: cs.createdAt || new Date().toISOString(),
      urls: {
        workspace: cs.url || `https://${cs.name}.github.dev`,
        sudocode: `https://${cs.name}-3000.app.github.dev`,
        ssh: `gh codespace ssh --codespace ${cs.name}`,
      },
      keepAliveHours: 72, // Default
      idleTimeout: undefined, // Codespaces ignores idleTimeout
      metadata: {
        codespaces: {
          machine: cs.machine || 'basicLinux32gb',
          retentionPeriod: 14, // Default
        },
      },
    };
  }
}

/**
 * @deprecated Use CodespacesConnector instead
 */
export const CodespacesProvider = CodespacesConnector;
