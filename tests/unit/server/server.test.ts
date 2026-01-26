/**
 * Integration tests for the sudopod server.
 *
 * Tests the full HTTP server with a mock provider using supertest.
 *
 * @see s-2aqt - Sudopod Server Implementation specification
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import request from 'supertest';
import { createServer } from '../../../src/server/index.js';
import type { Provider, Workspace, User } from '../../../src/types/provider.js';
import {
  ProviderError,
  WorkspaceNotFoundError,
  QuotaExceededError,
  ProviderUnavailableError,
} from '../../../src/types/errors.js';

/**
 * Creates a mock provider with all methods as vi.fn() spies.
 */
function createMockProvider(): Provider & {
  createWorkspace: ReturnType<typeof vi.fn>;
  getWorkspace: ReturnType<typeof vi.fn>;
  deleteWorkspace: ReturnType<typeof vi.fn>;
  listWorkspaces: ReturnType<typeof vi.fn>;
  startWorkspace: ReturnType<typeof vi.fn>;
  stopWorkspace: ReturnType<typeof vi.fn>;
  ensureUser: ReturnType<typeof vi.fn>;
} {
  return {
    createWorkspace: vi.fn(),
    getWorkspace: vi.fn(),
    deleteWorkspace: vi.fn(),
    listWorkspaces: vi.fn(),
    startWorkspace: vi.fn(),
    stopWorkspace: vi.fn(),
    ensureUser: vi.fn(),
  };
}

/**
 * Creates a sample workspace object for testing.
 */
function createSampleWorkspace(overrides: Partial<Workspace> = {}): Workspace {
  return {
    id: 'ws-123',
    name: 'test-workspace',
    status: 'running',
    urls: { workspace: 'https://example.com/ws' },
    createdAt: '2026-01-24T12:00:00.000Z',
    owner: 'testuser',
    repository: 'owner/repo',
    ...overrides,
  };
}

/**
 * Creates a sample user object for testing.
 */
function createSampleUser(overrides: Partial<User> = {}): User {
  return {
    id: 'user-123',
    username: 'testuser',
    email: 'user@example.com',
    status: 'active',
    createdAt: '2026-01-24T12:00:00.000Z',
    ...overrides,
  };
}

describe('createServer', () => {
  let mockProvider: ReturnType<typeof createMockProvider>;
  let app: ReturnType<typeof createServer>;

  beforeEach(() => {
    mockProvider = createMockProvider();
    app = createServer(mockProvider, {
      apiKeys: ['test-api-key'],
    });
  });

  describe('authentication', () => {
    it('rejects requests without API key', async () => {
      const res = await request(app).get('/workspaces');
      expect(res.status).toBe(401);
      expect(res.body.code).toBe('AUTHENTICATION_FAILED');
      expect(res.body.error).toBe('Missing Authorization header');
    });

    it('rejects requests without Bearer prefix', async () => {
      const res = await request(app)
        .get('/workspaces')
        .set('Authorization', 'test-api-key');
      expect(res.status).toBe(401);
      expect(res.body.code).toBe('AUTHENTICATION_FAILED');
      expect(res.body.error).toBe('Authorization header must use Bearer scheme');
    });

    it('rejects invalid API key', async () => {
      const res = await request(app)
        .get('/workspaces')
        .set('Authorization', 'Bearer wrong-key');
      expect(res.status).toBe(401);
      expect(res.body.code).toBe('AUTHENTICATION_FAILED');
      expect(res.body.error).toBe('Invalid API key');
    });

    it('allows valid API key', async () => {
      mockProvider.listWorkspaces.mockResolvedValue([]);
      const res = await request(app)
        .get('/workspaces')
        .set('Authorization', 'Bearer test-api-key');
      expect(res.status).toBe(200);
    });

    it('allows health check without auth', async () => {
      const res = await request(app).get('/health');
      expect(res.status).toBe(200);
      expect(res.body.ok).toBe(true);
      expect(res.body.timestamp).toBeDefined();
    });
  });

  describe('POST /workspaces', () => {
    it('creates workspace and returns 201', async () => {
      const mockWorkspace = createSampleWorkspace({ status: 'pending' });
      mockProvider.createWorkspace.mockResolvedValue(mockWorkspace);

      const res = await request(app)
        .post('/workspaces')
        .set('Authorization', 'Bearer test-api-key')
        .send({
          repository: 'owner/repo',
          userIdentity: { email: 'user@example.com' },
        });

      expect(res.status).toBe(201);
      expect(res.body).toEqual(mockWorkspace);
    });

    it('returns 400 for invalid request - missing repository', async () => {
      const res = await request(app)
        .post('/workspaces')
        .set('Authorization', 'Bearer test-api-key')
        .send({ userIdentity: { email: 'user@example.com' } });

      expect(res.status).toBe(400);
      expect(res.body.code).toBe('INVALID_REQUEST');
      expect(res.body.error).toContain('repository is required');
    });

    it('returns 400 for invalid request - invalid repository format', async () => {
      const res = await request(app)
        .post('/workspaces')
        .set('Authorization', 'Bearer test-api-key')
        .send({
          repository: 'invalid',
          userIdentity: { email: 'user@example.com' },
        });

      expect(res.status).toBe(400);
      expect(res.body.code).toBe('INVALID_REQUEST');
      expect(res.body.error).toContain('repository must be in "owner/repo" format');
    });

    it('returns 400 for invalid request - missing userIdentity', async () => {
      const res = await request(app)
        .post('/workspaces')
        .set('Authorization', 'Bearer test-api-key')
        .send({ repository: 'owner/repo' });

      expect(res.status).toBe(400);
      expect(res.body.code).toBe('INVALID_REQUEST');
      expect(res.body.error).toContain('userIdentity is required');
    });

    it('passes validated request to provider', async () => {
      const mockWorkspace = createSampleWorkspace();
      mockProvider.createWorkspace.mockResolvedValue(mockWorkspace);

      const requestBody = {
        repository: 'owner/repo',
        userIdentity: { email: 'user@example.com', username: 'testuser' },
        cpuCores: 4,
        memoryGb: 8,
      };

      await request(app)
        .post('/workspaces')
        .set('Authorization', 'Bearer test-api-key')
        .send(requestBody);

      expect(mockProvider.createWorkspace).toHaveBeenCalledTimes(1);
      expect(mockProvider.createWorkspace).toHaveBeenCalledWith(requestBody);
    });
  });

  describe('GET /workspaces', () => {
    it('lists workspaces and returns 200', async () => {
      const mockWorkspaces = [
        createSampleWorkspace({ id: 'ws-1', name: 'workspace-1' }),
        createSampleWorkspace({ id: 'ws-2', name: 'workspace-2' }),
      ];
      mockProvider.listWorkspaces.mockResolvedValue(mockWorkspaces);

      const res = await request(app)
        .get('/workspaces')
        .set('Authorization', 'Bearer test-api-key');

      expect(res.status).toBe(200);
      expect(res.body).toEqual(mockWorkspaces);
    });

    it('returns empty array when no workspaces', async () => {
      mockProvider.listWorkspaces.mockResolvedValue([]);

      const res = await request(app)
        .get('/workspaces')
        .set('Authorization', 'Bearer test-api-key');

      expect(res.status).toBe(200);
      expect(res.body).toEqual([]);
    });

    it('passes query filters to provider', async () => {
      mockProvider.listWorkspaces.mockResolvedValue([]);

      await request(app)
        .get('/workspaces')
        .query({ owner: 'testuser', status: 'running', limit: '10', offset: '5' })
        .set('Authorization', 'Bearer test-api-key');

      expect(mockProvider.listWorkspaces).toHaveBeenCalledTimes(1);
      expect(mockProvider.listWorkspaces).toHaveBeenCalledWith({
        owner: 'testuser',
        status: 'running',
        limit: 10,
        offset: 5,
      });
    });

    it('handles partial query filters', async () => {
      mockProvider.listWorkspaces.mockResolvedValue([]);

      await request(app)
        .get('/workspaces')
        .query({ owner: 'testuser' })
        .set('Authorization', 'Bearer test-api-key');

      expect(mockProvider.listWorkspaces).toHaveBeenCalledWith({
        owner: 'testuser',
        status: undefined,
        limit: undefined,
        offset: undefined,
      });
    });
  });

  describe('GET /workspaces/:id', () => {
    it('returns workspace and 200', async () => {
      const mockWorkspace = createSampleWorkspace();
      mockProvider.getWorkspace.mockResolvedValue(mockWorkspace);

      const res = await request(app)
        .get('/workspaces/ws-123')
        .set('Authorization', 'Bearer test-api-key');

      expect(res.status).toBe(200);
      expect(res.body).toEqual(mockWorkspace);
      expect(mockProvider.getWorkspace).toHaveBeenCalledWith('ws-123');
    });

    it('returns 404 when provider throws WorkspaceNotFoundError', async () => {
      mockProvider.getWorkspace.mockRejectedValue(
        new WorkspaceNotFoundError('ws-nonexistent')
      );

      const res = await request(app)
        .get('/workspaces/ws-nonexistent')
        .set('Authorization', 'Bearer test-api-key');

      expect(res.status).toBe(404);
      expect(res.body.code).toBe('WORKSPACE_NOT_FOUND');
      expect(res.body.error).toContain('ws-nonexistent');
    });
  });

  describe('DELETE /workspaces/:id', () => {
    it('deletes workspace and returns 204', async () => {
      mockProvider.deleteWorkspace.mockResolvedValue(undefined);

      const res = await request(app)
        .delete('/workspaces/ws-123')
        .set('Authorization', 'Bearer test-api-key');

      expect(res.status).toBe(204);
      expect(res.body).toEqual({});
      expect(mockProvider.deleteWorkspace).toHaveBeenCalledWith('ws-123');
    });

    it('returns 404 when workspace not found', async () => {
      mockProvider.deleteWorkspace.mockRejectedValue(
        new WorkspaceNotFoundError('ws-nonexistent')
      );

      const res = await request(app)
        .delete('/workspaces/ws-nonexistent')
        .set('Authorization', 'Bearer test-api-key');

      expect(res.status).toBe(404);
      expect(res.body.code).toBe('WORKSPACE_NOT_FOUND');
    });
  });

  describe('POST /workspaces/:id/start', () => {
    it('starts workspace and returns 204', async () => {
      mockProvider.startWorkspace.mockResolvedValue(undefined);

      const res = await request(app)
        .post('/workspaces/ws-123/start')
        .set('Authorization', 'Bearer test-api-key');

      expect(res.status).toBe(204);
      expect(res.body).toEqual({});
      expect(mockProvider.startWorkspace).toHaveBeenCalledWith('ws-123');
    });

    it('returns 404 when workspace not found', async () => {
      mockProvider.startWorkspace.mockRejectedValue(
        new WorkspaceNotFoundError('ws-nonexistent')
      );

      const res = await request(app)
        .post('/workspaces/ws-nonexistent/start')
        .set('Authorization', 'Bearer test-api-key');

      expect(res.status).toBe(404);
      expect(res.body.code).toBe('WORKSPACE_NOT_FOUND');
    });
  });

  describe('POST /workspaces/:id/stop', () => {
    it('stops workspace and returns 204', async () => {
      mockProvider.stopWorkspace.mockResolvedValue(undefined);

      const res = await request(app)
        .post('/workspaces/ws-123/stop')
        .set('Authorization', 'Bearer test-api-key');

      expect(res.status).toBe(204);
      expect(res.body).toEqual({});
      expect(mockProvider.stopWorkspace).toHaveBeenCalledWith('ws-123');
    });

    it('returns 404 when workspace not found', async () => {
      mockProvider.stopWorkspace.mockRejectedValue(
        new WorkspaceNotFoundError('ws-nonexistent')
      );

      const res = await request(app)
        .post('/workspaces/ws-nonexistent/stop')
        .set('Authorization', 'Bearer test-api-key');

      expect(res.status).toBe(404);
      expect(res.body.code).toBe('WORKSPACE_NOT_FOUND');
    });
  });

  describe('POST /users', () => {
    it('creates user and returns 201', async () => {
      const mockUser = createSampleUser({ status: 'dormant' });
      mockProvider.ensureUser.mockResolvedValue(mockUser);

      const res = await request(app)
        .post('/users')
        .set('Authorization', 'Bearer test-api-key')
        .send({
          email: 'user@example.com',
          loginType: 'oidc',
        });

      expect(res.status).toBe(201);
      expect(res.body).toEqual(mockUser);
      expect(mockProvider.ensureUser).toHaveBeenCalledWith({
        email: 'user@example.com',
        loginType: 'oidc',
      });
    });

    it('returns 400 for invalid request - missing email', async () => {
      const res = await request(app)
        .post('/users')
        .set('Authorization', 'Bearer test-api-key')
        .send({ loginType: 'oidc' });

      expect(res.status).toBe(400);
      expect(res.body.code).toBe('INVALID_REQUEST');
      expect(res.body.error).toContain('email is required');
    });

    it('returns 400 for invalid request - invalid loginType', async () => {
      const res = await request(app)
        .post('/users')
        .set('Authorization', 'Bearer test-api-key')
        .send({
          email: 'user@example.com',
          loginType: 'password',
        });

      expect(res.status).toBe(400);
      expect(res.body.code).toBe('INVALID_REQUEST');
      expect(res.body.error).toContain('loginType must be "oidc"');
    });

    it('returns 501 if provider does not have ensureUser', async () => {
      // Create provider without ensureUser
      const providerWithoutEnsureUser: Provider = {
        createWorkspace: vi.fn(),
        getWorkspace: vi.fn(),
        deleteWorkspace: vi.fn(),
        listWorkspaces: vi.fn(),
        startWorkspace: vi.fn(),
        stopWorkspace: vi.fn(),
      };
      const appWithoutEnsureUser = createServer(providerWithoutEnsureUser, {
        apiKeys: ['test-api-key'],
      });

      const res = await request(appWithoutEnsureUser)
        .post('/users')
        .set('Authorization', 'Bearer test-api-key')
        .send({
          email: 'user@example.com',
          loginType: 'oidc',
        });

      expect(res.status).toBe(501);
      expect(res.body.error).toBe('User management not supported by this provider');
    });
  });

  describe('error handling', () => {
    it('maps ProviderError to correct HTTP status - 404', async () => {
      mockProvider.getWorkspace.mockRejectedValue(
        new WorkspaceNotFoundError('ws-123')
      );

      const res = await request(app)
        .get('/workspaces/ws-123')
        .set('Authorization', 'Bearer test-api-key');

      expect(res.status).toBe(404);
      expect(res.body.code).toBe('WORKSPACE_NOT_FOUND');
    });

    it('maps ProviderError to correct HTTP status - 429', async () => {
      mockProvider.createWorkspace.mockRejectedValue(
        new QuotaExceededError('CPU quota exceeded')
      );

      const res = await request(app)
        .post('/workspaces')
        .set('Authorization', 'Bearer test-api-key')
        .send({
          repository: 'owner/repo',
          userIdentity: { email: 'user@example.com' },
        });

      expect(res.status).toBe(429);
      expect(res.body.code).toBe('QUOTA_EXCEEDED');
      expect(res.body.error).toContain('CPU quota exceeded');
    });

    it('maps ProviderError to correct HTTP status - 503', async () => {
      mockProvider.listWorkspaces.mockRejectedValue(
        new ProviderUnavailableError('Backend service is down')
      );

      const res = await request(app)
        .get('/workspaces')
        .set('Authorization', 'Bearer test-api-key');

      expect(res.status).toBe(503);
      expect(res.body.code).toBe('PROVIDER_UNAVAILABLE');
      expect(res.body.error).toContain('Backend service is down');
    });

    it('returns 500 for unknown errors', async () => {
      mockProvider.getWorkspace.mockRejectedValue(new Error('Something went wrong'));

      const res = await request(app)
        .get('/workspaces/ws-123')
        .set('Authorization', 'Bearer test-api-key');

      expect(res.status).toBe(500);
      expect(res.body.code).toBe('INTERNAL_ERROR');
      expect(res.body.error).toBe('Internal server error');
    });

    it('does not leak internal error details', async () => {
      mockProvider.getWorkspace.mockRejectedValue(
        new Error('Database connection string: postgres://user:password@host')
      );

      const res = await request(app)
        .get('/workspaces/ws-123')
        .set('Authorization', 'Bearer test-api-key');

      expect(res.status).toBe(500);
      expect(res.body.error).toBe('Internal server error');
      expect(res.body.error).not.toContain('postgres');
      expect(res.body.error).not.toContain('password');
    });
  });

  describe('basePath configuration', () => {
    it('mounts routes at basePath', async () => {
      const appWithBasePath = createServer(mockProvider, {
        apiKeys: ['test-api-key'],
        basePath: '/api/v1',
      });
      mockProvider.listWorkspaces.mockResolvedValue([]);

      // Routes should work at basePath
      const res = await request(appWithBasePath)
        .get('/api/v1/workspaces')
        .set('Authorization', 'Bearer test-api-key');
      expect(res.status).toBe(200);

      // Health check at basePath
      const healthRes = await request(appWithBasePath).get('/api/v1/health');
      expect(healthRes.status).toBe(200);
      expect(healthRes.body.ok).toBe(true);
    });
  });

  describe('multiple API keys', () => {
    it('accepts any valid API key from the list', async () => {
      const appWithMultipleKeys = createServer(mockProvider, {
        apiKeys: ['key-1', 'key-2', 'key-3'],
      });
      mockProvider.listWorkspaces.mockResolvedValue([]);

      // First key
      const res1 = await request(appWithMultipleKeys)
        .get('/workspaces')
        .set('Authorization', 'Bearer key-1');
      expect(res1.status).toBe(200);

      // Second key
      const res2 = await request(appWithMultipleKeys)
        .get('/workspaces')
        .set('Authorization', 'Bearer key-2');
      expect(res2.status).toBe(200);

      // Third key
      const res3 = await request(appWithMultipleKeys)
        .get('/workspaces')
        .set('Authorization', 'Bearer key-3');
      expect(res3.status).toBe(200);
    });

    it('rejects invalid key when multiple keys are configured', async () => {
      const appWithMultipleKeys = createServer(mockProvider, {
        apiKeys: ['key-1', 'key-2', 'key-3'],
      });

      const res = await request(appWithMultipleKeys)
        .get('/workspaces')
        .set('Authorization', 'Bearer wrong-key');
      expect(res.status).toBe(401);
    });
  });
});
