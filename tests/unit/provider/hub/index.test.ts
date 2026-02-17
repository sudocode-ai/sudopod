/**
 * Unit tests for HubProvider.
 *
 * Tests the HTTP client with mocked fetch.
 *
 * @see s-7utm - Mock Hub Server + HubProvider Implementation
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { HubProvider } from '../../../../src/provider/hub/index.js';
import {
  WorkspaceNotFoundError,
  AuthenticationError,
  AuthorizationError,
  WorkspaceCreationError,
  WorkspaceTimeoutError,
  ProviderError,
} from '../../../../src/provider/errors.js';

const HUB_URL = 'https://hub.example.com';
const AUTH_TOKEN = 'test-token-123';

const mockWorkspace = {
  id: 'ws-abc',
  name: 'test-workspace',
  status: 'running',
  repository: { owner: 'test', repo: 'repo' },
  createdAt: '2026-01-01T00:00:00.000Z',
  connection: {
    ssh: { command: 'ssh test@example.com' },
  },
};

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

function noContentResponse(): Response {
  return new Response(null, { status: 204 });
}

describe('HubProvider', () => {
  let fetchSpy: ReturnType<typeof vi.spyOn>;
  let provider: HubProvider;

  beforeEach(() => {
    fetchSpy = vi.spyOn(global, 'fetch');
    provider = new HubProvider({ url: HUB_URL, authToken: AUTH_TOKEN });
  });

  afterEach(() => {
    fetchSpy.mockRestore();
  });

  // ── Constructor ──

  describe('constructor', () => {
    it('normalizes trailing slash from URL', async () => {
      const p = new HubProvider({ url: 'https://hub.example.com/', authToken: AUTH_TOKEN });
      fetchSpy.mockResolvedValue(jsonResponse([]));
      await p.list();
      expect(fetchSpy).toHaveBeenCalledWith(
        'https://hub.example.com/workspaces',
        expect.anything(),
      );
    });

    it('uses custom timeout', async () => {
      const p = new HubProvider(
        { url: HUB_URL, authToken: AUTH_TOKEN },
        { timeout: 1000 },
      );
      // Just verify construction succeeds — timeout tested separately
      expect(p.name).toBe('Hub');
    });
  });

  // ── create() ──

  describe('create()', () => {
    it('sends POST /workspaces with body and auth', async () => {
      fetchSpy.mockResolvedValue(jsonResponse(mockWorkspace, 201));
      const options = {
        name: 'my-ws',
        repository: { owner: 'org', repo: 'project' },
        retentionDays: 7,
      };
      await provider.create(options);
      expect(fetchSpy).toHaveBeenCalledWith(
        `${HUB_URL}/workspaces`,
        expect.objectContaining({
          method: 'POST',
          headers: expect.objectContaining({
            'Authorization': `Bearer ${AUTH_TOKEN}`,
            'Content-Type': 'application/json',
          }),
          body: JSON.stringify(options),
        }),
      );
    });

    it('returns workspace with rehydrated dates', async () => {
      fetchSpy.mockResolvedValue(jsonResponse(mockWorkspace, 201));
      const ws = await provider.create({
        name: 'test',
        repository: { owner: 'a', repo: 'b' },
        retentionDays: 1,
      });
      expect(ws.id).toBe('ws-abc');
      expect(ws.createdAt).toBeInstanceOf(Date);
    });

    it('maps 409 to WorkspaceCreationError', async () => {
      fetchSpy.mockResolvedValue(
        jsonResponse({ error: 'Name conflict', code: 'CONFLICT' }, 409),
      );
      await expect(
        provider.create({ name: 'x', repository: { owner: 'a', repo: 'b' }, retentionDays: 1 }),
      ).rejects.toThrow(WorkspaceCreationError);
    });
  });

  // ── resume() ──

  describe('resume()', () => {
    it('sends POST /workspaces/:id/resume', async () => {
      fetchSpy.mockResolvedValue(jsonResponse(mockWorkspace));
      await provider.resume('ws-abc');
      expect(fetchSpy).toHaveBeenCalledWith(
        `${HUB_URL}/workspaces/ws-abc/resume`,
        expect.objectContaining({ method: 'POST' }),
      );
    });

    it('with no ID, calls list then resumes most recent', async () => {
      // First call: list returns one workspace
      fetchSpy.mockResolvedValueOnce(jsonResponse([mockWorkspace]));
      // Second call: resume that workspace
      fetchSpy.mockResolvedValueOnce(jsonResponse(mockWorkspace));

      await provider.resume();
      expect(fetchSpy).toHaveBeenCalledTimes(2);
      expect(fetchSpy).toHaveBeenNthCalledWith(1,
        `${HUB_URL}/workspaces`,
        expect.objectContaining({ method: 'GET' }),
      );
      expect(fetchSpy).toHaveBeenNthCalledWith(2,
        `${HUB_URL}/workspaces/ws-abc/resume`,
        expect.objectContaining({ method: 'POST' }),
      );
    });

    it('with no ID and empty list, throws WorkspaceNotFoundError', async () => {
      fetchSpy.mockResolvedValue(jsonResponse([]));
      await expect(provider.resume()).rejects.toThrow(WorkspaceNotFoundError);
    });
  });

  // ── stop() ──

  describe('stop()', () => {
    it('sends POST /workspaces/:id/stop and handles 204', async () => {
      fetchSpy.mockResolvedValue(noContentResponse());
      await provider.stop('ws-abc');
      expect(fetchSpy).toHaveBeenCalledWith(
        `${HUB_URL}/workspaces/ws-abc/stop`,
        expect.objectContaining({ method: 'POST' }),
      );
    });

    it('maps 404 to WorkspaceNotFoundError', async () => {
      fetchSpy.mockResolvedValue(
        jsonResponse({ error: 'Not found', code: 'NOT_FOUND' }, 404),
      );
      await expect(provider.stop('ws-missing')).rejects.toThrow(WorkspaceNotFoundError);
    });
  });

  // ── delete() ──

  describe('delete()', () => {
    it('sends DELETE /workspaces/:id and handles 204', async () => {
      fetchSpy.mockResolvedValue(noContentResponse());
      await provider.delete('ws-abc');
      expect(fetchSpy).toHaveBeenCalledWith(
        `${HUB_URL}/workspaces/ws-abc`,
        expect.objectContaining({ method: 'DELETE' }),
      );
    });

    it('maps 404 to WorkspaceNotFoundError', async () => {
      fetchSpy.mockResolvedValue(
        jsonResponse({ error: 'Not found' }, 404),
      );
      await expect(provider.delete('ws-missing')).rejects.toThrow(WorkspaceNotFoundError);
    });
  });

  // ── get() ──

  describe('get()', () => {
    it('sends GET /workspaces/:id and returns workspace', async () => {
      fetchSpy.mockResolvedValue(jsonResponse(mockWorkspace));
      const ws = await provider.get('ws-abc');
      expect(ws.id).toBe('ws-abc');
      expect(fetchSpy).toHaveBeenCalledWith(
        `${HUB_URL}/workspaces/ws-abc`,
        expect.objectContaining({ method: 'GET' }),
      );
    });

    it('maps 404 to WorkspaceNotFoundError', async () => {
      fetchSpy.mockResolvedValue(
        jsonResponse({ error: 'Not found' }, 404),
      );
      await expect(provider.get('ws-missing')).rejects.toThrow(WorkspaceNotFoundError);
    });
  });

  // ── list() ──

  describe('list()', () => {
    it('sends GET /workspaces with no params', async () => {
      fetchSpy.mockResolvedValue(jsonResponse([]));
      await provider.list();
      expect(fetchSpy).toHaveBeenCalledWith(
        `${HUB_URL}/workspaces`,
        expect.anything(),
      );
    });

    it('appends query params for filters', async () => {
      fetchSpy.mockResolvedValue(jsonResponse([]));
      await provider.list({
        status: ['running', 'stopped'],
        owner: 'testowner',
        repo: 'testrepo',
        limit: 5,
      });
      const url = fetchSpy.mock.calls[0][0] as string;
      expect(url).toContain('status=running%2Cstopped');
      expect(url).toContain('owner=testowner');
      expect(url).toContain('repo=testrepo');
      expect(url).toContain('limit=5');
    });

    it('returns empty array', async () => {
      fetchSpy.mockResolvedValue(jsonResponse([]));
      const result = await provider.list();
      expect(result).toEqual([]);
    });
  });

  // ── Auth ──

  describe('authentication', () => {
    it('sends Authorization: Bearer header', async () => {
      fetchSpy.mockResolvedValue(jsonResponse([]));
      await provider.list();
      expect(fetchSpy).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          headers: expect.objectContaining({
            'Authorization': `Bearer ${AUTH_TOKEN}`,
          }),
        }),
      );
    });

    it('maps 401 to AuthenticationError', async () => {
      fetchSpy.mockResolvedValue(
        jsonResponse({ error: 'Invalid token' }, 401),
      );
      await expect(provider.list()).rejects.toThrow(AuthenticationError);
    });
  });

  // ── Timeout ──

  describe('timeout', () => {
    it('throws WorkspaceTimeoutError on abort', async () => {
      const p = new HubProvider(
        { url: HUB_URL, authToken: AUTH_TOKEN },
        { timeout: 1 }, // 1ms timeout
      );
      fetchSpy.mockImplementation((_url: string, init?: RequestInit) => {
        return new Promise((resolve, reject) => {
          const timer = setTimeout(() => resolve(jsonResponse([])), 10_000);
          init?.signal?.addEventListener('abort', () => {
            clearTimeout(timer);
            const err = new DOMException('The operation was aborted.', 'AbortError');
            reject(err);
          });
        });
      });
      await expect(p.list()).rejects.toThrow(WorkspaceTimeoutError);
    });
  });

  // ── Date Rehydration ──

  describe('date rehydration', () => {
    it('converts createdAt string to Date object', async () => {
      fetchSpy.mockResolvedValue(jsonResponse({
        ...mockWorkspace,
        createdAt: '2026-01-15T12:00:00.000Z',
        lastActivityAt: '2026-01-16T08:00:00.000Z',
      }));
      const ws = await provider.get('ws-abc');
      expect(ws.createdAt).toBeInstanceOf(Date);
      expect(ws.lastActivityAt).toBeInstanceOf(Date);
    });
  });
});
