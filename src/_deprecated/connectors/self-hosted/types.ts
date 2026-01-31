/**
 * Types for SelfHostedConnector.
 *
 * The SelfHostedConnector is a CLI-side connector for users who deploy their own
 * provider infrastructure. It calls provider hosts directly using SudopodClient.
 *
 * @see s-xlsw - SelfHostedConnector Implementation specification
 */

/**
 * Configuration for SelfHostedConnector.
 *
 * @example
 * ```typescript
 * const config: SelfHostedConnectorConfig = {
 *   type: 'self-hosted',
 *   providerUrl: 'https://coder.mycompany.com:8080',
 *   apiKey: '${SUDOPOD_API_KEY}',
 *   githubToken: 'gh-cli',
 *   secrets: {
 *     ANTHROPIC_API_KEY: '${ANTHROPIC_API_KEY}',
 *   },
 *   userIdentity: {
 *     email: 'me@company.com',
 *     username: 'myusername',
 *   },
 * };
 * ```
 */
export interface SelfHostedConnectorConfig {
  /** Connector type identifier */
  type: 'self-hosted';

  /**
   * URL of the provider host.
   * Supports ${VAR_NAME} environment variable expansion.
   * @example "https://coder.mycompany.com:8080"
   */
  providerUrl: string;

  /**
   * API key for authenticating with the provider host.
   * Supports ${VAR_NAME} environment variable expansion.
   */
  apiKey: string;

  /**
   * GitHub token source:
   * - "gh-cli": Fetch from `gh auth token` command (lazy, cached)
   * - string: Use this explicit token (supports ${VAR_NAME} expansion)
   * - undefined: Don't include GitHub token in requests
   */
  githubToken?: string | 'gh-cli';

  /**
   * Secrets to inject into workspaces.
   * Values support ${VAR_NAME} environment variable expansion.
   * @example { "ANTHROPIC_API_KEY": "${ANTHROPIC_API_KEY}" }
   */
  secrets?: Record<string, string>;

  /**
   * User identity for OIDC user creation.
   * Required if provider uses OIDC authentication.
   */
  userIdentity?: {
    /** User's email address - primary identifier for user matching */
    email?: string;
    /** OIDC subject identifier */
    sub?: string;
    /** Preferred username for display purposes */
    username?: string;
  };

  /**
   * Optional base path if provider uses one.
   * @example "/api/v1"
   */
  basePath?: string;

  /**
   * Request timeout in milliseconds.
   * @default 60000 (60 seconds)
   */
  timeout?: number;
}

/**
 * Request type for creating workspace via SelfHostedConnector.
 *
 * Does NOT include githubToken, secrets, or userIdentity -
 * these are injected from connector config.
 */
export interface SelfHostedCreateWorkspaceRequest {
  /** Repository in "owner/repo" format */
  repository: string;

  /** Branch to clone (default: "main") */
  branch?: string;

  /** CPU cores to allocate */
  cpuCores?: number;

  /** Memory in GB */
  memoryGb?: number;

  /** Disk size in GB */
  diskSizeGb?: number;

  /** Minutes of inactivity before auto-stop */
  idleTimeoutMinutes?: number;

  /** Maximum hours before workspace is deleted */
  maxTtlHours?: number;
}
