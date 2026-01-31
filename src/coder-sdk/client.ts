/**
 * CoderClient — HTTP client for the Coder REST API.
 *
 * Stateless, typed wrapper using native fetch (Node 18+).
 * All requests use Coder-Session-Token header for auth.
 *
 * @see s-9uap - sudopod-coder-sdk specification
 */

import { CoderApiError } from './errors.js';
import type {
  CoderClientConfig,
  CoderWorkspace,
  CoderWorkspaceBuild,
  CoderTemplate,
  CoderTemplateVersion,
  CoderUser,
  CoderWorkspaceStatus,
  CreateWorkspaceParams,
  ListWorkspacesParams,
  ListWorkspacesResponse,
  CreateBuildParams,
  WaitForBuildParams,
  ListUsersParams,
  ListUsersResponse,
  CreateUserParams,
} from './types.js';

export class CoderClient {
  constructor(private readonly config: CoderClientConfig) {}

  // ==========================================================================
  // HTTP Layer
  // ==========================================================================

  private async request<T>(
    method: string,
    path: string,
    body?: unknown,
    query?: Record<string, string>,
  ): Promise<T> {
    const url = new URL(path, this.config.baseUrl);
    if (query) {
      for (const [k, v] of Object.entries(query)) {
        url.searchParams.set(k, v);
      }
    }

    const headers: Record<string, string> = {
      'Coder-Session-Token': this.config.token,
    };
    if (body !== undefined) {
      headers['Content-Type'] = 'application/json';
    }

    const response = await fetch(url.toString(), {
      method,
      headers,
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });

    if (!response.ok) {
      throw CoderApiError.fromResponse(
        response.status,
        await response.text(),
        method,
        path,
      );
    }

    if (response.status === 204) return undefined as T;
    return response.json() as Promise<T>;
  }

  // ==========================================================================
  // Workspace Operations
  // ==========================================================================

  async createWorkspace(params: CreateWorkspaceParams): Promise<CoderWorkspace> {
    return this.request<CoderWorkspace>(
      'POST',
      `/api/v2/organizations/${params.organizationId}/members/${params.username}/workspaces`,
      {
        name: params.name,
        template_id: params.templateId,
        rich_parameter_values: params.richParameterValues,
        ttl_ms: params.ttlMs,
        autostart_schedule: params.autostartSchedule,
      },
    );
  }

  async getWorkspace(workspaceId: string): Promise<CoderWorkspace> {
    return this.request<CoderWorkspace>('GET', `/api/v2/workspaces/${workspaceId}`);
  }

  async getWorkspaceByOwnerAndName(owner: string, name: string): Promise<CoderWorkspace> {
    return this.request<CoderWorkspace>('GET', `/api/v2/users/${owner}/workspace/${name}`);
  }

  async listWorkspaces(params?: ListWorkspacesParams): Promise<ListWorkspacesResponse> {
    const query: Record<string, string> = {};
    if (params?.query) query.q = params.query;
    if (params?.limit !== undefined) query.limit = String(params.limit);
    if (params?.offset !== undefined) query.offset = String(params.offset);

    return this.request<ListWorkspacesResponse>('GET', '/api/v2/workspaces', undefined, query);
  }

  async createWorkspaceBuild(params: CreateBuildParams): Promise<CoderWorkspaceBuild> {
    return this.request<CoderWorkspaceBuild>(
      'POST',
      `/api/v2/workspaces/${params.workspaceId}/builds`,
      {
        transition: params.transition,
        template_version_id: params.templateVersionId,
        rich_parameter_values: params.richParameterValues,
      },
    );
  }

  async startWorkspace(workspaceId: string): Promise<CoderWorkspaceBuild> {
    return this.createWorkspaceBuild({ workspaceId, transition: 'start' });
  }

  async stopWorkspace(workspaceId: string): Promise<CoderWorkspaceBuild> {
    return this.createWorkspaceBuild({ workspaceId, transition: 'stop' });
  }

  async deleteWorkspace(workspaceId: string): Promise<CoderWorkspaceBuild> {
    return this.createWorkspaceBuild({ workspaceId, transition: 'delete' });
  }

  async extendWorkspaceDeadline(workspaceId: string, deadline: Date): Promise<void> {
    await this.request<void>(
      'PUT',
      `/api/v2/workspaces/${workspaceId}/extend`,
      { deadline: deadline.toISOString() },
    );
  }

  // ==========================================================================
  // Workspace Status Polling
  // ==========================================================================

  async waitForWorkspaceStatus(params: WaitForBuildParams): Promise<CoderWorkspace> {
    const interval = params.pollIntervalMs ?? 2000;
    const timeout = params.timeoutMs ?? 300_000;
    const deadline = Date.now() + timeout;

    while (Date.now() < deadline) {
      const workspace = await this.getWorkspace(params.workspaceId);
      if (workspace.latest_build.status === params.targetStatus) {
        return workspace;
      }
      if (
        workspace.latest_build.status === 'failed' ||
        workspace.latest_build.status === 'canceled'
      ) {
        throw new CoderApiError(
          0,
          `Workspace build ${workspace.latest_build.status}`,
          'POLL',
          `/workspaces/${params.workspaceId}`,
        );
      }
      await sleep(interval);
    }

    throw new CoderApiError(
      0,
      `Timed out waiting for workspace status: ${params.targetStatus}`,
      'POLL',
      `/workspaces/${params.workspaceId}`,
    );
  }

  // ==========================================================================
  // Template Operations
  // ==========================================================================

  async getTemplateByName(organizationId: string, templateName: string): Promise<CoderTemplate> {
    return this.request<CoderTemplate>(
      'GET',
      `/api/v2/organizations/${organizationId}/templates/${templateName}`,
    );
  }

  async listTemplates(organizationId: string): Promise<CoderTemplate[]> {
    return this.request<CoderTemplate[]>(
      'GET',
      `/api/v2/organizations/${organizationId}/templates`,
    );
  }

  async getTemplateVersion(templateVersionId: string): Promise<CoderTemplateVersion> {
    return this.request<CoderTemplateVersion>(
      'GET',
      `/api/v2/templateversions/${templateVersionId}`,
    );
  }

  // ==========================================================================
  // User Operations
  // ==========================================================================

  async getCurrentUser(): Promise<CoderUser> {
    return this.request<CoderUser>('GET', '/api/v2/users/me');
  }

  async getUser(usernameOrId: string): Promise<CoderUser> {
    return this.request<CoderUser>('GET', `/api/v2/users/${encodeURIComponent(usernameOrId)}`);
  }

  async listUsers(params?: ListUsersParams): Promise<ListUsersResponse> {
    const query: Record<string, string> = {};
    if (params?.query) query.q = params.query;
    if (params?.limit !== undefined) query.limit = String(params.limit);
    if (params?.offset !== undefined) query.offset = String(params.offset);

    return this.request<ListUsersResponse>('GET', '/api/v2/users', undefined, query);
  }

  async createUser(params: CreateUserParams): Promise<CoderUser> {
    return this.request<CoderUser>('POST', '/api/v2/users', {
      email: params.email,
      username: params.username,
      name: params.name,
      login_type: params.loginType ?? 'none',
      organization_ids: params.organizationIds,
    });
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
