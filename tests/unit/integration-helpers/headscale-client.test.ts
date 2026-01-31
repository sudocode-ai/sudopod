/**
 * Unit tests for the Headscale REST API client.
 * All HTTP calls are mocked via vi.spyOn(global, 'fetch').
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  HeadscaleClient,
  HeadscaleApiError,
} from '../../../tests/integration/tailscale/headscale-client.js';

function jsonResponse(data: unknown, status = 200): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    statusText: status === 200 ? 'OK' : 'Error',
    json: () => Promise.resolve(data),
    text: () => Promise.resolve(JSON.stringify(data)),
    headers: new Headers(),
  } as unknown as Response;
}

describe('HeadscaleClient', () => {
  let client: HeadscaleClient;
  let fetchSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    client = new HeadscaleClient({
      baseUrl: 'http://localhost:8080',
      apiKey: 'test-api-key',
    });
    fetchSpy = vi.spyOn(global, 'fetch');
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  // ── Auth header ──

  it('should send Authorization header on all requests', async () => {
    fetchSpy.mockResolvedValueOnce(jsonResponse({ users: [] }));

    await client.listUsers();

    expect(fetchSpy).toHaveBeenCalledWith(
      'http://localhost:8080/api/v1/user',
      expect.objectContaining({
        headers: expect.objectContaining({
          Authorization: 'Bearer test-api-key',
          'Content-Type': 'application/json',
        }),
      }),
    );
  });

  it('should strip trailing slash from baseUrl', async () => {
    const c = new HeadscaleClient({
      baseUrl: 'http://localhost:8080/',
      apiKey: 'k',
    });
    fetchSpy.mockResolvedValueOnce(jsonResponse({ users: [] }));

    await c.listUsers();

    expect(fetchSpy).toHaveBeenCalledWith(
      'http://localhost:8080/api/v1/user',
      expect.anything(),
    );
  });

  // ── Users ──

  describe('createUser', () => {
    it('should POST to /api/v1/user and return the user', async () => {
      const user = { id: '1', name: 'test-user', createdAt: '2026-01-01T00:00:00Z' };
      fetchSpy.mockResolvedValueOnce(jsonResponse({ user }));

      const result = await client.createUser('test-user');

      expect(result).toEqual(user);
      expect(fetchSpy).toHaveBeenCalledWith(
        'http://localhost:8080/api/v1/user',
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify({ name: 'test-user' }),
        }),
      );
    });
  });

  describe('listUsers', () => {
    it('should return users array', async () => {
      const users = [
        { id: '1', name: 'alice', createdAt: '2026-01-01T00:00:00Z' },
        { id: '2', name: 'bob', createdAt: '2026-01-01T00:00:00Z' },
      ];
      fetchSpy.mockResolvedValueOnce(jsonResponse({ users }));

      const result = await client.listUsers();

      expect(result).toEqual(users);
    });

    it('should return empty array when users is null', async () => {
      fetchSpy.mockResolvedValueOnce(jsonResponse({ users: null }));

      const result = await client.listUsers();

      expect(result).toEqual([]);
    });
  });

  describe('deleteUser', () => {
    it('should DELETE the user by id', async () => {
      fetchSpy.mockResolvedValueOnce(jsonResponse({}, 204));

      await client.deleteUser('42');

      expect(fetchSpy).toHaveBeenCalledWith(
        'http://localhost:8080/api/v1/user/42',
        expect.objectContaining({ method: 'DELETE' }),
      );
    });
  });

  // ── PreAuth Keys ──

  describe('createPreauthKey', () => {
    it('should POST and return the key string', async () => {
      const preAuthKey = {
        id: '1',
        key: 'preauthkey-abc123',
        reusable: false,
        ephemeral: false,
        used: false,
        expiration: '2026-02-01T00:00:00Z',
        createdAt: '2026-01-01T00:00:00Z',
        user: { id: '1', name: 'test-user' },
      };
      fetchSpy.mockResolvedValueOnce(jsonResponse({ preAuthKey }));

      const key = await client.createPreauthKey('1');

      expect(key).toBe('preauthkey-abc123');
      const body = JSON.parse(
        (fetchSpy.mock.calls[0][1] as RequestInit).body as string,
      );
      expect(body.user).toBe('1');
      expect(body.reusable).toBe(false);
      expect(body.ephemeral).toBe(false);
      expect(body.expiration).toBeTruthy();
    });

    it('should pass reusable and ephemeral options', async () => {
      const preAuthKey = {
        id: '1',
        key: 'key-reusable',
        reusable: true,
        ephemeral: true,
      };
      fetchSpy.mockResolvedValueOnce(jsonResponse({ preAuthKey }));

      await client.createPreauthKey('1', {
        reusable: true,
        ephemeral: true,
      });

      const body = JSON.parse(
        (fetchSpy.mock.calls[0][1] as RequestInit).body as string,
      );
      expect(body.reusable).toBe(true);
      expect(body.ephemeral).toBe(true);
    });

    it('should use custom expiry when provided', async () => {
      const preAuthKey = { id: '1', key: 'k' };
      fetchSpy.mockResolvedValueOnce(jsonResponse({ preAuthKey }));

      await client.createPreauthKey('1', { expiry: '2026-12-31T23:59:59Z' });

      const body = JSON.parse(
        (fetchSpy.mock.calls[0][1] as RequestInit).body as string,
      );
      expect(body.expiration).toBe('2026-12-31T23:59:59Z');
    });
  });

  describe('listPreauthKeys', () => {
    it('should GET with user query param', async () => {
      fetchSpy.mockResolvedValueOnce(jsonResponse({ preAuthKeys: [] }));

      await client.listPreauthKeys('5');

      expect(fetchSpy).toHaveBeenCalledWith(
        'http://localhost:8080/api/v1/preauthkey?user=5',
        expect.anything(),
      );
    });
  });

  // ── Nodes ──

  describe('listNodes', () => {
    it('should return nodes array', async () => {
      const nodes = [
        {
          id: '1',
          name: 'node-1',
          givenName: 'node-1',
          ipAddresses: ['100.64.0.1'],
          online: true,
          user: { id: '1', name: 'test-user' },
          lastSeen: '2026-01-01T00:00:00Z',
          createdAt: '2026-01-01T00:00:00Z',
        },
      ];
      fetchSpy.mockResolvedValueOnce(jsonResponse({ nodes }));

      const result = await client.listNodes();

      expect(result).toEqual(nodes);
      expect(result[0].ipAddresses).toEqual(['100.64.0.1']);
      expect(result[0].online).toBe(true);
    });

    it('should return empty array when nodes is null', async () => {
      fetchSpy.mockResolvedValueOnce(jsonResponse({ nodes: null }));

      const result = await client.listNodes();

      expect(result).toEqual([]);
    });
  });

  describe('getNode', () => {
    it('should GET a single node by id', async () => {
      const node = {
        id: '7',
        name: 'my-codespace',
        givenName: 'my-codespace',
        ipAddresses: ['100.64.0.2'],
        online: true,
        user: { id: '1', name: 'test-user' },
      };
      fetchSpy.mockResolvedValueOnce(jsonResponse({ node }));

      const result = await client.getNode('7');

      expect(result).toEqual(node);
      expect(fetchSpy).toHaveBeenCalledWith(
        'http://localhost:8080/api/v1/node/7',
        expect.anything(),
      );
    });
  });

  describe('deleteNode', () => {
    it('should DELETE the node by id', async () => {
      fetchSpy.mockResolvedValueOnce(jsonResponse({}, 204));

      await client.deleteNode('7');

      expect(fetchSpy).toHaveBeenCalledWith(
        'http://localhost:8080/api/v1/node/7',
        expect.objectContaining({ method: 'DELETE' }),
      );
    });
  });

  // ── API Keys ──

  describe('createApiKey', () => {
    it('should POST and return the key string', async () => {
      fetchSpy.mockResolvedValueOnce(
        jsonResponse({ apiKey: 'hsak_1234567890' }),
      );

      const key = await client.createApiKey();

      expect(key).toBe('hsak_1234567890');
      expect(fetchSpy).toHaveBeenCalledWith(
        'http://localhost:8080/api/v1/apikey',
        expect.objectContaining({ method: 'POST' }),
      );
    });

    it('should use custom expiration', async () => {
      fetchSpy.mockResolvedValueOnce(jsonResponse({ apiKey: 'hsak_abc' }));

      await client.createApiKey('2026-06-01T00:00:00Z');

      const body = JSON.parse(
        (fetchSpy.mock.calls[0][1] as RequestInit).body as string,
      );
      expect(body.expiration).toBe('2026-06-01T00:00:00Z');
    });
  });

  // ── Error handling ──

  describe('error handling', () => {
    it('should throw HeadscaleApiError on non-2xx response', async () => {
      fetchSpy.mockResolvedValueOnce(
        jsonResponse({ message: 'not found' }, 404),
      );

      await expect(client.getNode('999')).rejects.toThrow(HeadscaleApiError);
    });

    it('should include status, path, and body in error', async () => {
      fetchSpy.mockResolvedValueOnce(
        jsonResponse({ message: 'unauthorized' }, 401),
      );

      try {
        await client.listNodes();
        expect.fail('should have thrown');
      } catch (err) {
        const e = err as HeadscaleApiError;
        expect(e.status).toBe(401);
        expect(e.path).toBe('/api/v1/node');
        expect(e.body).toContain('unauthorized');
      }
    });

    it('should throw on 500 server error', async () => {
      fetchSpy.mockResolvedValueOnce(
        jsonResponse({ message: 'internal error' }, 500),
      );

      await expect(client.createUser('fail')).rejects.toThrow(
        HeadscaleApiError,
      );
    });
  });
});
