/**
 * Coder API Client
 *
 * REST API client for Coder workspace operations.
 *
 * @see s-6q31 - Coder Provider Implementation specification
 * @see i-74ai - Implement Coder API client issue
 */

import type {
  CoderUser,
  CoderWorkspace,
  CoderTemplate,
  CoderTemplateVersion,
  CreateWorkspaceRequest,
  CreateWorkspaceBuildRequest,
  ExtendWorkspaceRequest,
  ListWorkspacesResponse,
  CoderAPIErrorResponse,
} from './types.js';

// ============================================================================
// Error Types
// ============================================================================

/**
 * Coder API error with status code and response body.
 */
export class CoderApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly body: string,
    public readonly response?: CoderAPIErrorResponse
  ) {
    const message = response?.message ?? body;
    super(`Coder API error (${status}): ${message}`);
    this.name = 'CoderApiError';
  }

  /** Returns true if the error is a 401 Unauthorized */
  isUnauthorized(): boolean {
    return this.status === 401;
  }

  /** Returns true if the error is a 403 Forbidden */
  isForbidden(): boolean {
    return this.status === 403;
  }

  /** Returns true if the error is a 404 Not Found */
  isNotFound(): boolean {
    return this.status === 404;
  }

  /** Returns true if the error is a 409 Conflict (e.g., workspace name exists) */
  isConflict(): boolean {
    return this.status === 409;
  }

  /** Returns true if the error is a server error (5xx) */
  isServerError(): boolean {
    return this.status >= 500;
  }
}

// ============================================================================
// API Client
// ============================================================================

/**
 * Coder REST API client.
 *
 * All requests use the `Coder-Session-Token` header for authentication.
 * This works for both self-hosted Coder tokens and OAuth tokens via Hub.
 */
export class CoderApiClient {
  private readonly baseUrl: string;

  constructor(
    url: string,
    private readonly token: string
  ) {
    // Ensure no trailing slash
    this.baseUrl = url.replace(/\/$/, '');
  }

  // ══════════════════════════════════════════════════════════════════════════
  // Generic Request
  // ══════════════════════════════════════════════════════════════════════════

  /**
   * Make an authenticated request to the Coder API.
   *
   * @param method - HTTP method
   * @param path - API path (e.g., "/api/v2/users/me")
   * @param body - Optional request body (will be JSON stringified)
   * @returns Parsed JSON response
   * @throws CoderApiError on non-2xx responses
   */
  async request<T>(method: string, path: string, body?: unknown): Promise<T> {
    const url = `${this.baseUrl}${path}`;

    const headers: Record<string, string> = {
      'Coder-Session-Token': this.token,
      Accept: 'application/json',
    };

    if (body !== undefined) {
      headers['Content-Type'] = 'application/json';
    }

    const response = await fetch(url, {
      method,
      headers,
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });

    if (!response.ok) {
      const text = await response.text();
      let parsed: CoderAPIErrorResponse | undefined;
      try {
        parsed = JSON.parse(text);
      } catch {
        // Not JSON, use raw text
      }
      throw new CoderApiError(response.status, text, parsed);
    }

    // Handle 204 No Content
    if (response.status === 204) {
      return undefined as T;
    }

    return response.json() as Promise<T>;
  }

  // ══════════════════════════════════════════════════════════════════════════
  // User Operations
  // ══════════════════════════════════════════════════════════════════════════

  /**
   * Get the current authenticated user.
   */
  async getMe(): Promise<CoderUser> {
    return this.request<CoderUser>('GET', '/api/v2/users/me');
  }

  /**
   * Get a user by email or username.
   */
  async getUser(identifier: string): Promise<CoderUser> {
    return this.request<CoderUser>(
      'GET',
      `/api/v2/users/${encodeURIComponent(identifier)}`
    );
  }

  // ══════════════════════════════════════════════════════════════════════════
  // Template Operations
  // ══════════════════════════════════════════════════════════════════════════

  /**
   * Get a template by organization ID and name.
   */
  async getTemplate(orgId: string, templateName: string): Promise<CoderTemplate> {
    return this.request<CoderTemplate>(
      'GET',
      `/api/v2/organizations/${encodeURIComponent(orgId)}/templates/${encodeURIComponent(templateName)}`
    );
  }

  /**
   * Get a template version by ID.
   */
  async getTemplateVersion(versionId: string): Promise<CoderTemplateVersion> {
    return this.request<CoderTemplateVersion>(
      'GET',
      `/api/v2/templateversions/${encodeURIComponent(versionId)}`
    );
  }

  // ══════════════════════════════════════════════════════════════════════════
  // Workspace Operations
  // ══════════════════════════════════════════════════════════════════════════

  /**
   * Create a new workspace.
   *
   * @param orgId - Organization ID
   * @param username - Username of the workspace owner
   * @param request - Workspace creation request
   */
  async createWorkspace(
    orgId: string,
    username: string,
    request: CreateWorkspaceRequest
  ): Promise<CoderWorkspace> {
    return this.request<CoderWorkspace>(
      'POST',
      `/api/v2/organizations/${encodeURIComponent(orgId)}/members/${encodeURIComponent(username)}/workspaces`,
      request
    );
  }

  /**
   * Get a workspace by ID.
   */
  async getWorkspace(workspaceId: string): Promise<CoderWorkspace> {
    return this.request<CoderWorkspace>(
      'GET',
      `/api/v2/workspaces/${encodeURIComponent(workspaceId)}`
    );
  }

  /**
   * List workspaces with optional query filter.
   *
   * @param query - Search query (e.g., "owner:me status:running")
   * @param limit - Maximum number of results (default 50)
   */
  async listWorkspaces(query?: string, limit?: number): Promise<CoderWorkspace[]> {
    const params = new URLSearchParams();
    if (query) {
      params.set('q', query);
    }
    if (limit !== undefined) {
      params.set('limit', String(limit));
    }

    const queryString = params.toString();
    const path = queryString
      ? `/api/v2/workspaces?${queryString}`
      : '/api/v2/workspaces';

    const response = await this.request<ListWorkspacesResponse>('GET', path);
    return response.workspaces;
  }

  /**
   * Create a workspace build (start, stop, or delete).
   *
   * @param workspaceId - Workspace ID
   * @param request - Build request with transition type
   */
  async buildWorkspace(
    workspaceId: string,
    request: CreateWorkspaceBuildRequest
  ): Promise<void> {
    await this.request<unknown>(
      'POST',
      `/api/v2/workspaces/${encodeURIComponent(workspaceId)}/builds`,
      request
    );
  }

  /**
   * Start a workspace.
   */
  async startWorkspace(workspaceId: string): Promise<void> {
    await this.buildWorkspace(workspaceId, { transition: 'start' });
  }

  /**
   * Stop a workspace.
   */
  async stopWorkspace(workspaceId: string): Promise<void> {
    await this.buildWorkspace(workspaceId, { transition: 'stop' });
  }

  /**
   * Delete a workspace.
   *
   * @param workspaceId - Workspace ID
   * @param orphan - If true, don't destroy underlying infrastructure
   */
  async deleteWorkspace(workspaceId: string, orphan = false): Promise<void> {
    await this.buildWorkspace(workspaceId, { transition: 'delete', orphan });
  }

  /**
   * Extend a workspace deadline.
   *
   * @param workspaceId - Workspace ID
   * @param deadline - New deadline (RFC3339 timestamp or Date)
   */
  async extendWorkspace(
    workspaceId: string,
    deadline: string | Date
  ): Promise<void> {
    const deadlineStr =
      deadline instanceof Date ? deadline.toISOString() : deadline;

    await this.request<void>(
      'PUT',
      `/api/v2/workspaces/${encodeURIComponent(workspaceId)}/extend`,
      { deadline: deadlineStr } satisfies ExtendWorkspaceRequest
    );
  }

  // ══════════════════════════════════════════════════════════════════════════
  // Helper Methods
  // ══════════════════════════════════════════════════════════════════════════

  /**
   * Wait for a workspace to reach a specific build status.
   *
   * @param workspaceId - Workspace ID
   * @param targetStatus - Status to wait for
   * @param timeoutMs - Maximum time to wait (default 5 minutes)
   * @param pollIntervalMs - Polling interval (default 2 seconds)
   */
  async waitForStatus(
    workspaceId: string,
    targetStatus: string | string[],
    timeoutMs = 300000,
    pollIntervalMs = 2000
  ): Promise<CoderWorkspace> {
    const statuses = Array.isArray(targetStatus) ? targetStatus : [targetStatus];
    const startTime = Date.now();

    while (Date.now() - startTime < timeoutMs) {
      const workspace = await this.getWorkspace(workspaceId);
      const currentStatus = workspace.latest_build.status;

      if (statuses.includes(currentStatus)) {
        return workspace;
      }

      // Check for terminal failure states
      if (currentStatus === 'failed' || currentStatus === 'canceled') {
        throw new Error(
          `Workspace build ${currentStatus} while waiting for ${statuses.join(' or ')}`
        );
      }

      await new Promise((resolve) => setTimeout(resolve, pollIntervalMs));
    }

    throw new Error(
      `Timeout waiting for workspace ${workspaceId} to reach status ${statuses.join(' or ')}`
    );
  }
}
