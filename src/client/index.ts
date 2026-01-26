/**
 * SudopodClient - HTTP client for calling sudopod provider hosts.
 *
 * This is the shared foundation used by both sudocode-hub and SelfHostedConnector.
 * Provides typed methods for all Provider endpoints with retry and timeout support.
 *
 * @see s-3j7d - SudopodClient Implementation specification
 */

import type {
  CreateWorkspaceRequest,
  Workspace,
  User,
  EnsureUserRequest,
  ListWorkspacesFilter,
} from '../types/index.js';
import { SudopodClientError } from './errors.js';

// Re-export error class
export { SudopodClientError } from './errors.js';

/**
 * Configuration for SudopodClient.
 */
export interface SudopodClientConfig {
  /**
   * Base URL of the provider host.
   * Example: "https://coder.mycompany.com:8080"
   */
  providerUrl: string;

  /**
   * API key for Bearer token authentication.
   */
  apiKey: string;

  /**
   * Request timeout in milliseconds.
   * Default: 30000 (30 seconds)
   */
  timeout?: number;

  /**
   * Number of retries for failed requests.
   * Only retries on 5xx errors and network failures, not 4xx.
   * Default: 3
   */
  retries?: number;

  /**
   * Optional base path prefix (if server uses one).
   * Example: "/api/v1"
   */
  basePath?: string;
}

/**
 * Typed HTTP client for sudopod provider hosts.
 */
export class SudopodClient {
  private readonly baseUrl: string;
  private readonly apiKey: string;
  private readonly timeout: number;
  private readonly retries: number;

  constructor(config: SudopodClientConfig) {
    // Normalize URL: remove trailing slash from provider URL
    const base = config.providerUrl.replace(/\/$/, '');
    // Normalize basePath: ensure single leading slash, no trailing slash
    const path = config.basePath
      ? `/${config.basePath.replace(/^\/|\/$/g, '')}`
      : '';
    this.baseUrl = `${base}${path}`;
    this.apiKey = config.apiKey;
    this.timeout = config.timeout ?? 30000;
    this.retries = config.retries ?? 3;
  }

  // === Workspace Methods ===

  /**
   * Create a new workspace.
   */
  async createWorkspace(req: CreateWorkspaceRequest): Promise<Workspace> {
    return this.request<Workspace>('POST', '/workspaces', req);
  }

  /**
   * Get a workspace by ID.
   */
  async getWorkspace(id: string): Promise<Workspace> {
    return this.request<Workspace>(
      'GET',
      `/workspaces/${encodeURIComponent(id)}`
    );
  }

  /**
   * Delete a workspace by ID.
   */
  async deleteWorkspace(id: string): Promise<void> {
    await this.request<void>('DELETE', `/workspaces/${encodeURIComponent(id)}`);
  }

  /**
   * List workspaces with optional filters.
   */
  async listWorkspaces(filters?: ListWorkspacesFilter): Promise<Workspace[]> {
    const params = new URLSearchParams();
    if (filters?.owner) params.set('owner', filters.owner);
    if (filters?.status) params.set('status', filters.status);
    if (filters?.limit !== undefined) params.set('limit', String(filters.limit));
    if (filters?.offset !== undefined)
      params.set('offset', String(filters.offset));

    const query = params.toString();
    const path = query ? `/workspaces?${query}` : '/workspaces';
    return this.request<Workspace[]>('GET', path);
  }

  /**
   * Start a stopped workspace.
   */
  async startWorkspace(id: string): Promise<void> {
    await this.request<void>(
      'POST',
      `/workspaces/${encodeURIComponent(id)}/start`
    );
  }

  /**
   * Stop a running workspace.
   */
  async stopWorkspace(id: string): Promise<void> {
    await this.request<void>(
      'POST',
      `/workspaces/${encodeURIComponent(id)}/stop`
    );
  }

  // === User Methods ===

  /**
   * Ensure a user exists in the provider's system.
   */
  async ensureUser(req: EnsureUserRequest): Promise<User> {
    return this.request<User>('POST', '/users', req);
  }

  // === Health Check ===

  /**
   * Check provider health.
   */
  async health(): Promise<{ ok: boolean; timestamp: string }> {
    return this.request<{ ok: boolean; timestamp: string }>('GET', '/health');
  }

  // === Internal Request Handler ===

  private async request<T>(
    method: string,
    path: string,
    body?: unknown
  ): Promise<T> {
    const url = `${this.baseUrl}${path}`;
    let lastError: Error | undefined;

    for (let attempt = 0; attempt <= this.retries; attempt++) {
      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), this.timeout);

        const response = await fetch(url, {
          method,
          headers: {
            Authorization: `Bearer ${this.apiKey}`,
            'Content-Type': 'application/json',
          },
          body: body ? JSON.stringify(body) : undefined,
          signal: controller.signal,
        });

        clearTimeout(timeoutId);

        // Handle no-content responses
        if (response.status === 204) {
          return undefined as T;
        }

        // Parse response body
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const data: any = await response.json();

        // Handle errors
        if (!response.ok) {
          throw new SudopodClientError(
            data.error || `Request failed with status ${response.status}`,
            data.code || 'UNKNOWN_ERROR',
            response.status
          );
        }

        return data as T;
      } catch (error: unknown) {
        lastError = error as Error;

        // Don't retry on client errors (4xx)
        if (error instanceof SudopodClientError && error.isClientError()) {
          throw error;
        }

        // Handle abort (timeout)
        if (
          error instanceof Error &&
          (error.name === 'AbortError' || error.name === 'TimeoutError')
        ) {
          throw new SudopodClientError('Request timed out', 'TIMEOUT', 408);
        }

        // Retry on network errors and 5xx
        if (attempt < this.retries) {
          // Exponential backoff: 100ms, 200ms, 400ms...
          await this.sleep(100 * Math.pow(2, attempt));
          continue;
        }
      }
    }

    throw lastError || new Error('Request failed');
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
