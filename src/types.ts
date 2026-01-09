/**
 * Core type definitions for sudopod
 */

/**
 * Provider configuration (union type for extensibility)
 */
export type ProviderConfig = CodespacesConfig | CoderConfig;

/**
 * Codespaces provider configuration
 */
export interface CodespacesConfig {
  type: 'codespaces';
  // No auth needed - uses gh CLI which handles auth
}

/**
 * Coder provider configuration
 */
export interface CoderConfig {
  type: 'coder';
  /** Coder instance URL */
  url: string;
  /** API key for authentication */
  apiKey: string;
}

/**
 * Deploy options - provider-agnostic base + provider-specific extensions
 */
export interface DeployOptions {
  /** Repository in owner/repo format (e.g., "username/repo") */
  repository: string;

  /** Git branch to checkout (optional, uses default branch if not specified) */
  branch?: string;

  /** Override workspace directory (optional) */
  workspaceDir?: string;

  /** Sudocode installation configuration */
  sudocode: {
    /** Installation mode: npm or local build */
    mode: 'npm' | 'local';

    /** Specific version for npm mode (e.g., "1.2.3" or "latest") */
    version?: string;

    /** Path to local build for local mode */
    localPath?: string;
  };

  /** Server configuration */
  server: {
    /** Server port (default: 3000) */
    port?: number;

    /** How long to keep VM alive before shutdown (hours) */
    keepAliveHours?: number;

    /** Idle timeout before pausing VM (minutes) - provider-dependent */
    idleTimeout?: number;
  };

  /** Provider-specific options */
  providerOptions: CodespacesDeployOptions | CoderDeployOptions;
}

/**
 * Codespaces-specific deployment options
 *
 * Note: idleTimeout from DeployOptions is IGNORED for Codespaces.
 * GitHub Codespaces doesn't reliably auto-resume processes or auto-forward
 * ports after pausing, so we cannot use pause/resume. Instead, we rely on
 * keepAliveHours and implement a keepalive mechanism to bypass the codespace's
 * own idle timeout, keeping the VM running continuously until shutdown.
 */
export interface CodespacesDeployOptions {
  /** Machine size (default: 'basicLinux32gb') */
  machine?: string;

  /** Retention period in days (default: 14) */
  retentionPeriod?: number;
}

/**
 * Coder-specific deployment options
 *
 * Note: Both keepAliveHours and idleTimeout from DeployOptions ARE HONORED.
 * Coder supports fully configurable TTL and idle timeout values.
 */
export interface CoderDeployOptions {
  /** Coder template name */
  template?: string;

  /** Template parameters */
  parameters?: Record<string, string>;

  /** Auto-start workspace (default: true) */
  autoStart?: boolean;
}

/**
 * Deployment information - provider-agnostic representation
 */
export interface Deployment {
  /** Provider-specific unique identifier */
  id: string;

  /** Human-readable name */
  name: string;

  /** Provider type */
  provider: 'codespaces' | 'coder';

  /** Repository in owner/repo format */
  repository: string;

  /** Git branch (if specified during deployment) */
  branch?: string;

  /** Current deployment status */
  status: DeploymentStatus;

  /** Creation timestamp (ISO 8601) */
  createdAt: string;

  /** Access URLs for the environment */
  urls: DeploymentUrls;

  /** VM lifecycle configuration (NOT in provider metadata) */
  keepAliveHours: number;

  /** Idle timeout in minutes (may be ignored by provider) */
  idleTimeout?: number;

  /** Provider-specific metadata (opaque to sudopod consumers) */
  metadata: {
    codespaces?: {
      machine: string;
      retentionPeriod: number;
    };
    coder?: {
      template: string;
      workspaceId: string;
      ownerId: string;
    };
  };
}

/**
 * Deployment status enumeration
 */
export type DeploymentStatus =
  | 'provisioning' // Creating infrastructure
  | 'starting' // Starting environment
  | 'running' // Fully operational
  | 'stopping' // Shutting down
  | 'stopped' // Stopped (can be restarted)
  | 'failed' // Deployment failed
  | 'deleted'; // Permanently deleted

/**
 * Access URLs for a deployment
 */
export interface DeploymentUrls {
  /** Main workspace URL (Codespace or Coder workspace) */
  workspace: string;

  /** Sudocode UI URL */
  sudocode: string;

  /** SSH connection string (optional) */
  ssh?: string;

  /** Additional provider-specific URLs */
  [key: string]: string | undefined;
}

/**
 * Filters for listing deployments
 */
export interface ListFilters {
  /** Filter by status */
  status?: DeploymentStatus[];

  /** Filter by repository */
  repository?: string;

  /** Created after timestamp (ISO 8601) */
  createdAfter?: string;

  /** Created before timestamp (ISO 8601) */
  createdBefore?: string;
}
