/**
 * HubProvider — Thin HTTP client implementing the Provider interface.
 *
 * Sends Provider interface calls over HTTP to a hub server (mock or production).
 * The hub server delegates to CoderOrchestrator internally.
 *
 * @see s-7utm - Mock Hub Server + HubProvider Implementation
 * @see s-9cl3 - Unified Workspace Provider Architecture
 */

import type {
  Provider,
  HubConfig,
  CreateOptions,
  Workspace,
  ListWorkspacesOptions,
} from '../types.js';
import {
  ProviderError,
  WorkspaceNotFoundError,
  AuthenticationError,
  AuthorizationError,
  WorkspaceCreationError,
  WorkspaceTimeoutError,
} from '../errors.js';

export class HubProvider implements Provider {
  readonly name = 'Hub';
  private baseUrl: string;
  private authToken: string;
  private timeout: number;

  constructor(config: HubConfig, options?: { timeout?: number }) {
    this.baseUrl = config.url.replace(/\/$/, '');
    this.authToken = config.authToken;
    this.timeout = options?.timeout ?? 300_000; // 5 minutes — workspace ops are slow
  }

  async create(options: CreateOptions): Promise<Workspace> {
    return this.request<Workspace>('POST', '/workspaces', options);
  }

  async resume(workspaceId?: string): Promise<Workspace> {
    if (!workspaceId) {
      const workspaces = await this.list();
      if (workspaces.length === 0) {
        throw new WorkspaceNotFoundError('hub', 'unknown');
      }
      workspaceId = workspaces[0].id;
    }
    return this.request<Workspace>('POST', `/workspaces/${encodeURIComponent(workspaceId)}/resume`);
  }

  async stop(workspaceId: string): Promise<void> {
    await this.request<void>('POST', `/workspaces/${encodeURIComponent(workspaceId)}/stop`);
  }

  async delete(workspaceId: string): Promise<void> {
    await this.request<void>('DELETE', `/workspaces/${encodeURIComponent(workspaceId)}`);
  }

  async get(workspaceId: string): Promise<Workspace> {
    return this.request<Workspace>('GET', `/workspaces/${encodeURIComponent(workspaceId)}`);
  }

  async list(filters?: ListWorkspacesOptions): Promise<Workspace[]> {
    const params = new URLSearchParams();
    if (filters?.status?.length) params.set('status', filters.status.join(','));
    if (filters?.owner) params.set('owner', filters.owner);
    if (filters?.repo) params.set('repo', filters.repo);
    if (filters?.limit) params.set('limit', String(filters.limit));
    const query = params.toString();
    const path = `/workspaces${query ? `?${query}` : ''}`;
    return this.request<Workspace[]>('GET', path);
  }

  // ─── Private ───────────────────────────────────────────────────

  private async request<T>(
    method: string,
    path: string,
    body?: unknown,
  ): Promise<T> {
    const url = `${this.baseUrl}${path}`;
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.timeout);

    try {
      const response = await fetch(url, {
        method,
        headers: {
          'Authorization': `Bearer ${this.authToken}`,
          ...(body ? { 'Content-Type': 'application/json' } : {}),
        },
        body: body ? JSON.stringify(body) : undefined,
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (response.status === 204) {
        return undefined as T;
      }

      const data: unknown = await response.json();

      if (!response.ok) {
        throw this.mapHttpError(response.status, data as Record<string, unknown>);
      }

      // Rehydrate Date fields (JSON serialization loses Date objects)
      if (data && typeof data === 'object') {
        this.rehydrateDates(data);
      }

      return data as T;
    } catch (error: unknown) {
      clearTimeout(timeoutId);
      if (error instanceof ProviderError) throw error;
      if (error instanceof Error && error.name === 'AbortError') {
        throw new WorkspaceTimeoutError('hub', method, this.timeout);
      }
      throw new ProviderError(
        error instanceof Error ? error.message : String(error),
        'hub',
        method,
      );
    }
  }

  private mapHttpError(status: number, data: Record<string, unknown>): ProviderError {
    const message = (data?.error as string) ?? `HTTP ${status}`;
    switch (status) {
      case 401: return new AuthenticationError('hub', message);
      case 403: return new AuthorizationError('hub', 'request', message);
      case 404: return new WorkspaceNotFoundError('hub', message);
      case 409: return new WorkspaceCreationError('hub', message);
      case 504: return new WorkspaceTimeoutError('hub', 'request', 0);
      default:  return new ProviderError(message, 'hub', 'request');
    }
  }

  private rehydrateDates(obj: unknown): void {
    if (Array.isArray(obj)) {
      obj.forEach(item => this.rehydrateDates(item));
      return;
    }
    if (obj && typeof obj === 'object') {
      const record = obj as Record<string, unknown>;
      if (typeof record.createdAt === 'string') {
        record.createdAt = new Date(record.createdAt as string);
      }
      if (typeof record.lastActivityAt === 'string') {
        record.lastActivityAt = new Date(record.lastActivityAt as string);
      }
    }
  }
}
