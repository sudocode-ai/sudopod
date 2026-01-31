/**
 * SelfHostedConnector - CLI-side connector for self-hosted provider deployments.
 *
 * Uses SudopodClient to call provider hosts directly, providing the same
 * request format as sudocode-hub but with values from local configuration.
 *
 * @see s-xlsw - SelfHostedConnector Implementation specification
 */

import { execSync } from 'child_process';
import type { CreateWorkspaceRequest, Workspace, ListWorkspacesFilter } from '../../types/index.js';
import { SudopodClient } from '../../client/index.js';
import { ConnectorError, AuthenticationError } from '../../core/errors.js';
import type { SelfHostedConnectorConfig, SelfHostedCreateWorkspaceRequest } from './types.js';

// Re-export types
export type { SelfHostedConnectorConfig, SelfHostedCreateWorkspaceRequest } from './types.js';

/**
 * Connector for self-hosted provider deployments.
 *
 * This connector enables the "self-hosted provider" deployment model where:
 * - Users deploy their own provider infrastructure (e.g., coder-infra)
 * - CLI calls the provider host directly (no hub in the middle)
 * - Users provide their own API key, GitHub token, and secrets via config
 *
 * @example
 * ```typescript
 * const connector = new SelfHostedConnector({
 *   type: 'self-hosted',
 *   providerUrl: 'https://coder.mycompany.com:8080',
 *   apiKey: 'my-api-key',
 *   githubToken: 'gh-cli',
 *   userIdentity: { email: 'me@company.com' },
 * });
 *
 * const workspace = await connector.createWorkspace({
 *   repository: 'owner/repo',
 *   branch: 'main',
 * });
 * ```
 */
export class SelfHostedConnector {
  readonly type = 'self-hosted' as const;

  private readonly client: SudopodClient;
  private readonly config: SelfHostedConnectorConfig;
  private resolvedGithubToken?: string;
  private resolvedSecrets?: Record<string, string>;

  constructor(config: SelfHostedConnectorConfig) {
    this.config = config;

    // Expand environment variables in providerUrl and apiKey
    const providerUrl = this.expandEnvVars(config.providerUrl);
    const apiKey = this.expandEnvVars(config.apiKey);

    this.client = new SudopodClient({
      providerUrl,
      apiKey,
      basePath: config.basePath,
      timeout: config.timeout ?? 60000,
    });
  }

  /**
   * Create a workspace on the provider host.
   * Injects githubToken, secrets, and userIdentity from config.
   */
  async createWorkspace(req: SelfHostedCreateWorkspaceRequest): Promise<Workspace> {
    try {
      // Resolve GitHub token (lazy - only when needed)
      const githubToken = await this.getGitHubToken();

      // Resolve secrets (expand environment variables)
      const secrets = this.getSecrets();

      // Build full request with injected values
      const fullReq: CreateWorkspaceRequest = {
        repository: req.repository,
        branch: req.branch,
        cpuCores: req.cpuCores,
        memoryGb: req.memoryGb,
        diskSizeGb: req.diskSizeGb,
        idleTimeoutMinutes: req.idleTimeoutMinutes,
        maxTtlHours: req.maxTtlHours,
        userIdentity: this.config.userIdentity ?? { email: 'anonymous@localhost' },
        githubToken,
        secrets,
      };

      return await this.client.createWorkspace(fullReq);
    } catch (error: unknown) {
      if (error instanceof AuthenticationError || error instanceof ConnectorError) {
        throw error;
      }
      const err = error as Error & { code?: string };
      if (err.code === 'AUTHENTICATION_FAILED') {
        throw new AuthenticationError(
          'self-hosted',
          'API key is invalid. Check your connector configuration.'
        );
      }
      throw new ConnectorError('self-hosted', 'createWorkspace', err.message);
    }
  }

  /**
   * Get workspace by ID.
   */
  async getWorkspace(id: string): Promise<Workspace> {
    try {
      return await this.client.getWorkspace(id);
    } catch (error: unknown) {
      const err = error as Error;
      throw new ConnectorError('self-hosted', 'getWorkspace', err.message);
    }
  }

  /**
   * Delete workspace by ID.
   */
  async deleteWorkspace(id: string): Promise<void> {
    try {
      await this.client.deleteWorkspace(id);
    } catch (error: unknown) {
      const err = error as Error;
      throw new ConnectorError('self-hosted', 'deleteWorkspace', err.message);
    }
  }

  /**
   * List workspaces.
   * Note: May only return workspaces for the configured userIdentity.
   */
  async listWorkspaces(filters?: ListWorkspacesFilter): Promise<Workspace[]> {
    try {
      return await this.client.listWorkspaces(filters);
    } catch (error: unknown) {
      const err = error as Error;
      throw new ConnectorError('self-hosted', 'listWorkspaces', err.message);
    }
  }

  /**
   * Start a stopped workspace.
   */
  async startWorkspace(id: string): Promise<void> {
    try {
      await this.client.startWorkspace(id);
    } catch (error: unknown) {
      const err = error as Error;
      throw new ConnectorError('self-hosted', 'startWorkspace', err.message);
    }
  }

  /**
   * Stop a running workspace.
   */
  async stopWorkspace(id: string): Promise<void> {
    try {
      await this.client.stopWorkspace(id);
    } catch (error: unknown) {
      const err = error as Error;
      throw new ConnectorError('self-hosted', 'stopWorkspace', err.message);
    }
  }

  /**
   * Validate configuration and connectivity.
   * Checks that the provider is reachable and GitHub token is available (if configured).
   */
  async validate(): Promise<void> {
    // Check provider host is reachable
    try {
      await this.client.health();
    } catch (error: unknown) {
      const err = error as Error;
      throw new ConnectorError(
        'self-hosted',
        'validate',
        `Cannot reach provider host: ${err.message}`
      );
    }

    // Check GitHub token is available if configured
    if (this.config.githubToken) {
      try {
        await this.getGitHubToken();
      } catch (error: unknown) {
        const err = error as Error;
        throw new ConnectorError(
          'self-hosted',
          'validate',
          `Cannot get GitHub token: ${err.message}`
        );
      }
    }

    // Warn if userIdentity is not configured
    if (!this.config.userIdentity?.email) {
      console.warn('Warning: No userIdentity.email configured. OIDC login may not work.');
    }
  }

  /**
   * Get GitHub token from config or gh CLI.
   * Lazily resolved and cached for connector lifetime.
   */
  private async getGitHubToken(): Promise<string | undefined> {
    // Return cached token if available
    if (this.resolvedGithubToken !== undefined) {
      return this.resolvedGithubToken || undefined;
    }

    const tokenConfig = this.config.githubToken;

    if (!tokenConfig) {
      this.resolvedGithubToken = '';
      return undefined;
    }

    if (tokenConfig === 'gh-cli') {
      try {
        const token = execSync('gh auth token', {
          encoding: 'utf-8',
          stdio: ['pipe', 'pipe', 'pipe'],
        }).trim();

        if (!token) {
          throw new Error('gh auth token returned empty');
        }

        this.resolvedGithubToken = token;
        return token;
      } catch {
        throw new AuthenticationError(
          'self-hosted',
          'Failed to get GitHub token from gh CLI. Run: gh auth login'
        );
      }
    }

    // Explicit token - may contain env var reference
    const token = this.expandEnvVars(tokenConfig);
    this.resolvedGithubToken = token;
    return token;
  }

  /**
   * Get secrets with environment variables expanded.
   * Lazily resolved and cached for connector lifetime.
   */
  private getSecrets(): Record<string, string> | undefined {
    if (this.resolvedSecrets !== undefined) {
      return Object.keys(this.resolvedSecrets).length > 0
        ? this.resolvedSecrets
        : undefined;
    }

    const secretsConfig = this.config.secrets;

    if (!secretsConfig || Object.keys(secretsConfig).length === 0) {
      this.resolvedSecrets = {};
      return undefined;
    }

    // Expand environment variables in secret values
    const resolved: Record<string, string> = {};
    for (const [key, value] of Object.entries(secretsConfig)) {
      resolved[key] = this.expandEnvVars(value);
    }

    this.resolvedSecrets = resolved;
    return resolved;
  }

  /**
   * Expand ${VAR_NAME} references in a string.
   * @throws Error if environment variable is not set
   */
  private expandEnvVars(value: string): string {
    return value.replace(/\$\{([^}]+)\}/g, (_, varName) => {
      const envValue = process.env[varName];
      if (envValue === undefined) {
        throw new Error(`Environment variable ${varName} is not set`);
      }
      return envValue;
    });
  }
}
