/**
 * Coder connector implementation
 */

import type {
  CoderConfig,
  CoderDeployOptions,
  DeployOptions,
  Deployment,
  DeploymentStatus,
  DeploymentUrls,
  ListFilters,
} from '../types.js';
import type { Connector } from '../core/connector.js';

/**
 * Connector implementation for Coder
 * 
 * This connector manages remote development environments using Coder.
 * Authentication is handled via API key provided in the configuration.
 */
export class CoderConnector implements Connector {
  readonly type = 'coder' as const;

  constructor(private config: CoderConfig) {}

  async deploy(options: DeployOptions): Promise<Deployment> {
    // Extract git repository information from new structure
    const { owner, repo, branch } = options.git;
    const repoUrl = `https://github.com/${owner}/${repo}`;
    
    // Extract Coder-specific options
    const coderOptions = options.providerOptions as CoderDeployOptions;
    const template = coderOptions.template || 'default-workspace';
    const parameters = coderOptions.parameters || {};
    
    // Handle agent installation configuration
    const agentsToInstall = options.agents?.install || [];
    if (agentsToInstall.includes('claude')) {
      // TODO: Configure Coder template parameter for Claude agent installation
      parameters['install_claude_agent'] = 'true';
    }
    
    // Handle LLM/model configuration
    const envVars: Record<string, string> = {};
    
    if (options.models?.claudeLtt) {
      // Pass Claude LTT as environment variable
      envVars['CLAUDE_LTT'] = options.models.claudeLtt;
    }
    
    if (options.models?.providerConfig) {
      // Pass provider config as JSON string in environment variable
      envVars['LLM_PROVIDER_CONFIG'] = JSON.stringify(options.models.providerConfig);
    }
    
    if (options.models?.providerConfigEnvVar) {
      // Reference to environment variable containing provider config
      // In a real implementation, this would be configured in the Coder template
      // to read from the specified environment variable
      envVars['LLM_PROVIDER_CONFIG_VAR'] = options.models.providerConfigEnvVar;
    }
    
    // Configure keepAliveHours and idleTimeout (both honored by Coder)
    const keepAliveHours = options.server.keepAliveHours || 72;
    const idleTimeout = options.server.idleTimeout;
    
    // TODO: Implement actual Coder workspace deployment
    // - Create workspace using Coder API with template and parameters
    // - Set up TTL (keepAliveHours) and idle timeout
    // - Pass environment variables for LLM configuration
    // - Wait for workspace to start
    // - Return Deployment object with URLs and metadata
    
    throw new Error('CoderConnector.deploy() not yet implemented');
  }

  async stop(name: string): Promise<void> {
    // TODO: Implement workspace stop operation
    // - Find workspace by name using Coder API
    // - Stop and delete the workspace
    // - Handle errors appropriately
    throw new Error('CoderConnector.stop() not yet implemented');
  }

  async getStatus(name: string): Promise<DeploymentStatus> {
    // TODO: Implement status query
    // - Query Coder API for workspace status
    // - Map Coder status to DeploymentStatus enum
    // - Throw ConnectorError if workspace not found
    throw new Error('CoderConnector.getStatus() not yet implemented');
  }

  async list(filters?: ListFilters): Promise<Deployment[]> {
    // TODO: Implement workspace listing
    // - Query Coder API for all workspaces
    // - Apply filters (status, repository, date range)
    // - Map to Deployment[] format
    // - Return filtered results
    throw new Error('CoderConnector.list() not yet implemented');
  }

  async getUrls(name: string): Promise<DeploymentUrls> {
    // TODO: Implement URL generation
    // - Find workspace by name
    // - Generate workspace URL
    // - Generate sudocode UI URL (workspace URL + port)
    // - Generate SSH connection string if available
    // - Return DeploymentUrls object
    throw new Error('CoderConnector.getUrls() not yet implemented');
  }
}

/**
 * @deprecated Use CoderConnector instead
 */
export const CoderProvider = CoderConnector;
