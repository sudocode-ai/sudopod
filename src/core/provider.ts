/**
 * Provider interface definition
 */

import type {
  DeployOptions,
  Deployment,
  DeploymentStatus,
  DeploymentUrls,
  ListFilters,
} from '../types.js';

/**
 * Provider interface - stateless operations for managing remote environments
 * All methods query the provider's API in real-time (no local state)
 */
export interface Provider {
  /** Provider type identifier */
  readonly type: 'codespaces' | 'coder';

  /**
   * Deploy a new remote environment
   * Returns deployment info immediately (environment may still be provisioning)
   *
   * @param options - Deployment configuration
   * @returns Deployment information with URLs and metadata
   * @throws DeploymentFailedError if deployment fails
   * @throws AuthenticationError if authentication fails
   */
  deploy(options: DeployOptions): Promise<Deployment>;

  /**
   * Stop and delete an environment
   *
   * @param name - Environment name to stop
   * @throws ProviderError if stop operation fails
   */
  stop(name: string): Promise<void>;

  /**
   * Get current status of an environment
   * Queries provider API in real-time
   *
   * @param name - Environment name to query
   * @returns Current status information
   * @throws ProviderError if environment not found
   */
  getStatus(name: string): Promise<DeploymentStatus>;

  /**
   * List all environments from provider
   * Queries provider API in real-time (not local tracking)
   *
   * @param filters - Optional filters for listing
   * @returns Array of deployments matching filters
   */
  list(filters?: ListFilters): Promise<Deployment[]>;

  /**
   * Get URLs for accessing environment
   * Can be called during or after deployment
   *
   * @param name - Environment name
   * @returns URLs for accessing the environment
   * @throws ProviderError if environment not found
   */
  getUrls(name: string): Promise<DeploymentUrls>;
}
