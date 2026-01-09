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
  /** Git repository configuration */
  git: {
    /** Repository owner/organization name (e.g., "anthropics") */
    owner: string;
    
    /** Repository name (e.g., "sudocode") */
    repo: string;
    
    /** Git branch to checkout (optional, uses default branch if not specified) */
    branch?: string;
  };

  /**
   * Development mode flag - install sudocode from local repository build instead of npm.
   * 
   * When `dev: true`:
   * - Typically used with `sudocode.mode: 'local'` 
   * - Builds sudocode from the checked-out repository (git.repo)
   * - Useful for testing unreleased changes or custom modifications
   * - May also influence other behavior like branch selection or test execution
   * 
   * When `dev: false` (or omitted):
   * - Typically used with `sudocode.mode: 'npm'`
   * - Installs sudocode from npm registry
   * - Production deployment recommended configuration
   * 
   * Note: The `dev` flag is a high-level intent, while `sudocode.mode` specifies
   * the actual installation mechanism. Both should be set consistently.
   * 
   * @example
   * // Development deployment from local build
   * { dev: true, sudocode: { mode: 'local' } }
   * 
   * @example
   * // Production deployment from npm
   * { dev: false, sudocode: { mode: 'npm', version: '1.2.3' } }
   */
  dev?: boolean;

  /** Override workspace directory (optional) */
  workspaceDir?: string;

  /**
   * Agent configuration - specifies which agents to pre-install in the remote environment
   * Currently supports: 'claude'
   * Different agents may require different installation/setup steps
   */
  agents?: {
    /** List of agent identifiers to install (currently supports: 'claude') */
    install: string[];
  };

  /**
   * Model/LLM configuration for the deployment
   * Supports multiple authentication and provider configuration methods
   */
  models?: {
    /**
     * Claude Long-Term Token (LTT) for authentication with Anthropic API
     * Used when deploying with Claude as the primary LLM
     * @example "ltt_xxxxxxxxxxxxx"
     */
    claudeLtt?: string;

    /**
     * LLM provider connection details as a JSON object
     * Supports multiple provider formats:
     * 
     * **Anthropic:**
     * ```json
     * { "provider": "anthropic", "apiKey": "sk-..." }
     * ```
     * 
     * **OpenAI/LiteLLM:**
     * ```json
     * { "provider": "openai", "apiKey": "sk-...", "baseUrl": "https://api.openai.com/v1" }
     * ```
     * 
     * **AWS Bedrock:**
     * ```json
     * { 
     *   "provider": "bedrock", 
     *   "region": "us-east-1",
     *   "accessKeyId": "...",
     *   "secretAccessKey": "..."
     * }
     * ```
     */
    providerConfig?: Record<string, any>;

    /**
     * Environment variable name containing the LLM provider config as JSON
     * Alternative to providerConfig - allows passing sensitive credentials via env vars
     * The environment variable should contain a JSON string matching the providerConfig format
     * @example "LLM_CONFIG"
     */
    providerConfigEnvVar?: string;
  };

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

  /** Git repository configuration */
  git: {
    /** Repository owner/organization name */
    owner: string;
    
    /** Repository name */
    repo: string;
    
    /** Git branch (if specified during deployment) */
    branch?: string;
  };

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

  /** Filter by repository owner */
  owner?: string;

  /** Filter by repository name */
  repo?: string;

  /** Created after timestamp (ISO 8601) */
  createdAfter?: string;

  /** Created before timestamp (ISO 8601) */
  createdBefore?: string;
}
