/**
 * Lightweight TypeScript client for the Headscale REST API (v1).
 *
 * Covers users, preauthkeys, nodes, and API keys — the operations
 * needed by sudopod CLI commands (tailscale connect, create-key, etc.).
 *
 * @see s-5dat - Sudopod Tailscale CLI Support
 */

export interface HeadscaleUser {
  id: string;
  name: string;
  createdAt: string;
}

export interface HeadscalePreAuthKey {
  id: string;
  key: string;
  user: HeadscaleUser;
  reusable: boolean;
  ephemeral: boolean;
  used: boolean;
  expiration: string;
  createdAt: string;
}

export interface HeadscaleNode {
  id: string;
  name: string;
  givenName: string;
  ipAddresses: string[];
  online: boolean;
  user: HeadscaleUser;
  lastSeen: string;
  createdAt: string;
}

export interface HeadscaleClientOptions {
  baseUrl: string;
  apiKey: string;
}

export class HeadscaleClient {
  private baseUrl: string;
  private apiKey: string;

  constructor(options: HeadscaleClientOptions) {
    this.baseUrl = options.baseUrl.replace(/\/$/, '');
    this.apiKey = options.apiKey;
  }

  // -- Users --

  async createUser(name: string): Promise<HeadscaleUser> {
    const res = await this.request<{ user: HeadscaleUser }>('/api/v1/user', {
      method: 'POST',
      body: JSON.stringify({ name }),
    });
    return res.user;
  }

  async listUsers(): Promise<HeadscaleUser[]> {
    const res = await this.request<{ users: HeadscaleUser[] }>('/api/v1/user');
    return res.users ?? [];
  }

  async deleteUser(id: string): Promise<void> {
    await this.request(`/api/v1/user/${id}`, { method: 'DELETE' });
  }

  // -- PreAuth Keys --

  async createPreauthKey(
    userId: string,
    options: { expiry?: string; reusable?: boolean; ephemeral?: boolean } = {},
  ): Promise<string> {
    const expiration =
      options.expiry ?? new Date(Date.now() + 60 * 60 * 1000).toISOString();
    const res = await this.request<{ preAuthKey: HeadscalePreAuthKey }>(
      '/api/v1/preauthkey',
      {
        method: 'POST',
        body: JSON.stringify({
          user: userId,
          reusable: options.reusable ?? false,
          ephemeral: options.ephemeral ?? false,
          expiration,
        }),
      },
    );
    return res.preAuthKey.key;
  }

  async listPreauthKeys(userId: string): Promise<HeadscalePreAuthKey[]> {
    const res = await this.request<{ preAuthKeys: HeadscalePreAuthKey[] }>(
      `/api/v1/preauthkey?user=${userId}`,
    );
    return res.preAuthKeys ?? [];
  }

  // -- Nodes --

  async listNodes(): Promise<HeadscaleNode[]> {
    const res = await this.request<{ nodes: HeadscaleNode[] }>('/api/v1/node');
    return res.nodes ?? [];
  }

  async getNode(nodeId: string): Promise<HeadscaleNode> {
    const res = await this.request<{ node: HeadscaleNode }>(
      `/api/v1/node/${nodeId}`,
    );
    return res.node;
  }

  async deleteNode(nodeId: string): Promise<void> {
    await this.request(`/api/v1/node/${nodeId}`, { method: 'DELETE' });
  }

  // -- API Keys --

  async createApiKey(expiration?: string): Promise<string> {
    const exp =
      expiration ?? new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
    const res = await this.request<{ apiKey: string }>('/api/v1/apikey', {
      method: 'POST',
      body: JSON.stringify({ expiration: exp }),
    });
    return res.apiKey;
  }

  // -- Internal --

  private async request<T>(
    path: string,
    init: RequestInit = {},
  ): Promise<T> {
    const url = `${this.baseUrl}${path}`;
    const res = await fetch(url, {
      ...init,
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        'Content-Type': 'application/json',
        ...((init.headers as Record<string, string>) ?? {}),
      },
    });

    if (!res.ok) {
      const body = await res.text().catch(() => '');
      throw new HeadscaleApiError(res.status, res.statusText, body, path);
    }

    if (res.status === 204) return {} as T;
    return (await res.json()) as T;
  }
}

export class HeadscaleApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly statusText: string,
    public readonly body: string,
    public readonly path: string,
  ) {
    super(`Headscale API ${status} ${statusText} on ${path}: ${body}`);
    this.name = 'HeadscaleApiError';
  }
}
