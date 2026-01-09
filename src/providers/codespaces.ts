/**
 * GitHub Codespaces provider implementation
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
import type { Provider } from '../core/provider.js';

/**
 * Provider implementation for GitHub Codespaces
 * 
 * This provider manages remote development environments using GitHub Codespaces.
 * Authentication is handled through the gh CLI, which must be properly configured
 * before using this provider.
 */
export class CodespacesProvider implements Provider {
  readonly type = 'codespaces' as const;

  constructor(private config: CodespacesConfig) {}

  async deploy(options: DeployOptions): Promise<Deployment> {
    // Extract git repository information from new structure
    const { owner, repo, branch } = options.git;
    const repository = `${owner}/${repo}`;
    
    // Extract provider-specific options
    const providerOpts = options.providerOptions as CodespacesDeployOptions;
    const machine = providerOpts.machine || 'basicLinux32gb';
    const retentionPeriod = providerOpts.retentionPeriod || 14;
    
    // Handle agent installation
    if (options.agents?.install) {
      for (const agent of options.agents.install) {
        if (agent === 'claude') {
          // TODO: Implement Claude agent installation
          // This is a stub - actual implementation will be added later
          // Agent installation will be handled during environment setup
        } else {
          // TODO: Warn about unknown agent types
          // For now, unknown agents are silently ignored
        }
      }
    }
    
    // Handle LLM configuration
    const llmConfig = this.prepareLlmConfig(options.models);
    if (llmConfig) {
      // TODO: Pass LLM configuration to deployed environment
      // This will be implemented when we add environment setup logic
      // Configuration is prepared and ready to be passed to the Codespace
    }
    
    // TODO: Execute `gh codespace create` with appropriate flags:
    //       - Repository: repository (owner/repo format)
    //       - Branch: branch
    //       - Machine type: machine
    //       - Retention period: retentionPeriod
    // TODO: Parse gh CLI JSON output to extract Codespace details
    // TODO: Implement keepalive mechanism to bypass Codespace idle timeout
    //       (see CodespacesDeployOptions note about idleTimeout being ignored)
    // TODO: Map response to Deployment interface with all required fields
    // TODO: Handle deployment failures with DeploymentFailedError
    throw new Error('CodespacesProvider.deploy() not yet implemented');
  }

  /**
   * Prepare LLM configuration from options.models
   * Returns configuration object or null if no LLM config provided
   */
  private prepareLlmConfig(models?: DeployOptions['models']): Record<string, any> | null {
    if (!models) {
      return null;
    }

    const config: Record<string, any> = {};

    // Handle Claude LTT
    if (models.claudeLtt) {
      config.claudeLtt = models.claudeLtt;
    }

    // Handle direct provider config
    if (models.providerConfig) {
      config.providerConfig = models.providerConfig;
    }

    // Handle provider config from environment variable
    if (models.providerConfigEnvVar) {
      config.providerConfigEnvVar = models.providerConfigEnvVar;
    }

    return Object.keys(config).length > 0 ? config : null;
  }

  async stop(name: string): Promise<void> {
    // TODO: Implement Codespace stop/delete using gh CLI
    // TODO: Execute `gh codespace delete` with Codespace name
    // TODO: Handle force deletion if necessary
    // TODO: Throw ProviderError if Codespace not found or deletion fails
    throw new Error('CodespacesProvider.stop() not yet implemented');
  }

  async getStatus(name: string): Promise<DeploymentStatus> {
    // TODO: Implement status query using gh CLI
    // TODO: Execute `gh codespace view` with Codespace name and JSON output
    // TODO: Map Codespace state to DeploymentStatus enum:
    //       - Available -> 'running'
    //       - Starting -> 'starting'
    //       - Shutdown -> 'stopped'
    //       - etc.
    // TODO: Throw ProviderError if Codespace not found
    throw new Error('CodespacesProvider.getStatus() not yet implemented');
  }

  async list(filters?: ListFilters): Promise<Deployment[]> {
    // TODO: Implement Codespaces listing using gh CLI
    // TODO: Execute `gh codespace list` with JSON output
    // TODO: Parse all Codespaces from JSON response
    // TODO: Map each Codespace to Deployment format using mapToDeployment()
    // TODO: Apply filters (status, owner, repo, date range)
    //       Note: filters.owner and filters.repo replaced filters.repository
    // TODO: Return filtered array of Deployments
    throw new Error('CodespacesProvider.list() not yet implemented');
  }

  /**
   * Helper method to map Codespace data to Deployment object
   * Example of how to construct Deployment with new git structure
   * 
   * @param codespace - Raw codespace data from gh CLI
   * @param options - Original deploy options (for keepAliveHours, etc.)
   * @returns Deployment object
   */
  private mapToDeployment(codespace: any, options?: DeployOptions): Deployment {
    // Parse repository string "owner/repo" into components
    const [owner, repo] = codespace.repository.split('/');
    
    return {
      id: codespace.name,
      name: codespace.displayName || codespace.name,
      provider: 'codespaces' as const,
      
      // Use new git structure instead of repository string
      git: {
        owner,
        repo,
        branch: codespace.gitStatus?.ref || options?.git.branch,
      },
      
      status: this.mapStatus(codespace.state),
      createdAt: codespace.createdAt,
      urls: {
        workspace: codespace.webUrl || '',
        sudocode: '', // TODO: Construct from port forwarding
        ssh: codespace.connection?.sessionId ? `ssh ${codespace.connection.sessionId}` : undefined,
      },
      
      keepAliveHours: options?.server.keepAliveHours || 72,
      idleTimeout: undefined, // Codespaces ignores idleTimeout
      
      metadata: {
        codespaces: {
          machine: codespace.machine || 'basicLinux32gb',
          retentionPeriod: codespace.retentionPeriod || 14,
        },
      },
    };
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

  async getUrls(name: string): Promise<DeploymentUrls> {
    // TODO: Implement URL generation for Codespace
    // TODO: Query Codespace details using gh CLI if needed
    // TODO: Construct workspace URL (GitHub Codespaces web interface)
    // TODO: Construct sudocode URL using port forwarding
    //       (e.g., https://<codespace-name>-<port>.app.github.dev)
    // TODO: Generate SSH connection string if available
    // TODO: Return DeploymentUrls object with all URLs
    // TODO: Throw ProviderError if Codespace not found
    throw new Error('CodespacesProvider.getUrls() not yet implemented');
  }
}
