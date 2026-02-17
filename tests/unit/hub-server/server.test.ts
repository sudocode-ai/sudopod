/**
 * Unit tests for the mock hub server.
 *
 * Tests the Express server with a mocked CoderOrchestrator.
 * Uses supertest for HTTP assertions.
 *
 * @see s-7utm - Mock Hub Server + HubProvider Implementation
 */

import { describe, it, expect, vi, beforeEach, beforeAll } from 'vitest';
import request from 'supertest';
import type { Express } from 'express';
import {
  WorkspaceNotFoundError,
  AuthenticationError,
  AuthorizationError,
  WorkspaceCreationError,
  WorkspaceStateError,
  WorkspaceTimeoutError,
  ProviderError,
} from '../../../src/provider/errors.js';

// Mock CoderOrchestrator before importing the server
const mockOrchestrator = {
  create: vi.fn(),
  resume: vi.fn(),
  stop: vi.fn(),
  delete: vi.fn(),
  get: vi.fn(),
  list: vi.fn(),
};

vi.mock('../../../src/coder-sdk/orchestrator.js', () => ({
  CoderOrchestrator: vi.fn().mockImplementation(() => mockOrchestrator),
}));

import { createHubServer } from '../../../src/hub-server/index.js';

const TEST_API_KEY = 'test-key-123';

const mockWorkspace = {
  id: 'ws-abc',
  name: 'test-workspace',
  status: 'running',
  repository: { owner: 'test', repo: 'repo' },
  createdAt: new Date('2026-01-01'),
  connection: {
    ssh: { command: 'ssh test@example.com' },
  },
};

describe('Mock Hub Server', () => {
  let app: Express;

  beforeAll(() => {
    app = createHubServer({
      coderUrl: 'https://coder.example.com',
      coderToken: 'coder-token',
      apiKeys: [TEST_API_KEY],
    });
  });

  beforeEach(() => {
    vi.clearAllMocks();
  });

  // ── Health Check ──

  describe('GET /health', () => {
    it('returns ok without auth', async () => {
      const res = await request(app).get('/health');
      expect(res.status).toBe(200);
      expect(res.body.ok).toBe(true);
      expect(res.body.timestamp).toBeDefined();
    });

    it('returns ok even with invalid auth', async () => {
      const res = await request(app)
        .get('/health')
        .set('Authorization', 'Bearer invalid');
      expect(res.status).toBe(200);
      expect(res.body.ok).toBe(true);
    });
  });

  // ── Authentication ──

  describe('API Key Auth', () => {
    it('rejects missing Authorization header', async () => {
      const res = await request(app).get('/workspaces');
      expect(res.status).toBe(401);
      expect(res.body.code).toBe('AUTHENTICATION_FAILED');
    });

    it('rejects non-Bearer scheme', async () => {
      const res = await request(app)
        .get('/workspaces')
        .set('Authorization', 'Basic abc123');
      expect(res.status).toBe(401);
      expect(res.body.code).toBe('AUTHENTICATION_FAILED');
    });

    it('rejects invalid API key', async () => {
      const res = await request(app)
        .get('/workspaces')
        .set('Authorization', 'Bearer wrong-key');
      expect(res.status).toBe(401);
      expect(res.body.code).toBe('AUTHENTICATION_FAILED');
    });

    it('accepts valid API key', async () => {
      mockOrchestrator.list.mockResolvedValue([]);
      const res = await request(app)
        .get('/workspaces')
        .set('Authorization', `Bearer ${TEST_API_KEY}`);
      expect(res.status).toBe(200);
    });
  });

  // ── POST /workspaces (create) ──

  describe('POST /workspaces', () => {
    it('creates workspace and returns 201', async () => {
      mockOrchestrator.create.mockResolvedValue(mockWorkspace);
      const res = await request(app)
        .post('/workspaces')
        .set('Authorization', `Bearer ${TEST_API_KEY}`)
        .send({
          name: 'test-ws',
          repository: { owner: 'test', repo: 'repo' },
          retentionDays: 1,
        });
      expect(res.status).toBe(201);
      expect(res.body.id).toBe('ws-abc');
      expect(res.body.status).toBe('running');
    });

    it('passes CreateOptions through to orchestrator', async () => {
      mockOrchestrator.create.mockResolvedValue(mockWorkspace);
      const options = {
        name: 'my-ws',
        repository: { owner: 'org', repo: 'project', branch: 'main' },
        retentionDays: 7,
        setup: { services: [{ name: 'sudocode', port: 3000 }] },
      };
      await request(app)
        .post('/workspaces')
        .set('Authorization', `Bearer ${TEST_API_KEY}`)
        .send(options);
      expect(mockOrchestrator.create).toHaveBeenCalledWith(options);
    });

    it('returns error on orchestrator failure', async () => {
      mockOrchestrator.create.mockRejectedValue(
        new WorkspaceCreationError('coder', 'Template not found'),
      );
      const res = await request(app)
        .post('/workspaces')
        .set('Authorization', `Bearer ${TEST_API_KEY}`)
        .send({
          name: 'test',
          repository: { owner: 'test', repo: 'repo' },
          retentionDays: 1,
        });
      expect(res.status).toBe(409);
      expect(res.body.code).toBe('WORKSPACE_CREATION_FAILED');
    });
  });

  // ── POST /workspaces/:id/resume ──

  describe('POST /workspaces/:id/resume', () => {
    it('resumes workspace and returns 200', async () => {
      mockOrchestrator.resume.mockResolvedValue(mockWorkspace);
      const res = await request(app)
        .post('/workspaces/ws-abc/resume')
        .set('Authorization', `Bearer ${TEST_API_KEY}`);
      expect(res.status).toBe(200);
      expect(res.body.id).toBe('ws-abc');
      expect(mockOrchestrator.resume).toHaveBeenCalledWith('ws-abc');
    });

    it('returns 404 when workspace not found', async () => {
      mockOrchestrator.resume.mockRejectedValue(
        new WorkspaceNotFoundError('coder', 'ws-missing'),
      );
      const res = await request(app)
        .post('/workspaces/ws-missing/resume')
        .set('Authorization', `Bearer ${TEST_API_KEY}`);
      expect(res.status).toBe(404);
      expect(res.body.code).toBe('WORKSPACE_NOT_FOUND');
    });
  });

  // ── POST /workspaces/:id/stop ──

  describe('POST /workspaces/:id/stop', () => {
    it('stops workspace and returns 204', async () => {
      mockOrchestrator.stop.mockResolvedValue(undefined);
      const res = await request(app)
        .post('/workspaces/ws-abc/stop')
        .set('Authorization', `Bearer ${TEST_API_KEY}`);
      expect(res.status).toBe(204);
      expect(mockOrchestrator.stop).toHaveBeenCalledWith('ws-abc');
    });

    it('returns 404 when workspace not found', async () => {
      mockOrchestrator.stop.mockRejectedValue(
        new WorkspaceNotFoundError('coder', 'ws-missing'),
      );
      const res = await request(app)
        .post('/workspaces/ws-missing/stop')
        .set('Authorization', `Bearer ${TEST_API_KEY}`);
      expect(res.status).toBe(404);
    });
  });

  // ── DELETE /workspaces/:id ──

  describe('DELETE /workspaces/:id', () => {
    it('deletes workspace and returns 204', async () => {
      mockOrchestrator.delete.mockResolvedValue(undefined);
      const res = await request(app)
        .delete('/workspaces/ws-abc')
        .set('Authorization', `Bearer ${TEST_API_KEY}`);
      expect(res.status).toBe(204);
      expect(mockOrchestrator.delete).toHaveBeenCalledWith('ws-abc');
    });

    it('returns 404 when workspace not found', async () => {
      mockOrchestrator.delete.mockRejectedValue(
        new WorkspaceNotFoundError('coder', 'ws-missing'),
      );
      const res = await request(app)
        .delete('/workspaces/ws-missing')
        .set('Authorization', `Bearer ${TEST_API_KEY}`);
      expect(res.status).toBe(404);
    });
  });

  // ── GET /workspaces/:id ──

  describe('GET /workspaces/:id', () => {
    it('returns workspace with 200', async () => {
      mockOrchestrator.get.mockResolvedValue(mockWorkspace);
      const res = await request(app)
        .get('/workspaces/ws-abc')
        .set('Authorization', `Bearer ${TEST_API_KEY}`);
      expect(res.status).toBe(200);
      expect(res.body.id).toBe('ws-abc');
      expect(mockOrchestrator.get).toHaveBeenCalledWith('ws-abc');
    });

    it('returns 404 when workspace not found', async () => {
      mockOrchestrator.get.mockRejectedValue(
        new WorkspaceNotFoundError('coder', 'ws-missing'),
      );
      const res = await request(app)
        .get('/workspaces/ws-missing')
        .set('Authorization', `Bearer ${TEST_API_KEY}`);
      expect(res.status).toBe(404);
    });
  });

  // ── GET /workspaces (list) ──

  describe('GET /workspaces', () => {
    it('returns array of workspaces with 200', async () => {
      mockOrchestrator.list.mockResolvedValue([mockWorkspace]);
      const res = await request(app)
        .get('/workspaces')
        .set('Authorization', `Bearer ${TEST_API_KEY}`);
      expect(res.status).toBe(200);
      expect(res.body).toHaveLength(1);
      expect(res.body[0].id).toBe('ws-abc');
    });

    it('passes query params as list filters', async () => {
      mockOrchestrator.list.mockResolvedValue([]);
      await request(app)
        .get('/workspaces?status=running,stopped&owner=test&repo=myrepo&limit=10')
        .set('Authorization', `Bearer ${TEST_API_KEY}`);
      expect(mockOrchestrator.list).toHaveBeenCalledWith({
        status: ['running', 'stopped'],
        owner: 'test',
        repo: 'myrepo',
        limit: 10,
      });
    });

    it('returns empty array when no workspaces', async () => {
      mockOrchestrator.list.mockResolvedValue([]);
      const res = await request(app)
        .get('/workspaces')
        .set('Authorization', `Bearer ${TEST_API_KEY}`);
      expect(res.status).toBe(200);
      expect(res.body).toEqual([]);
    });
  });

  // ── Error Mapping ──

  describe('Error Handling', () => {
    it('maps WorkspaceNotFoundError to 404', async () => {
      mockOrchestrator.get.mockRejectedValue(new WorkspaceNotFoundError('coder', 'ws-x'));
      const res = await request(app)
        .get('/workspaces/ws-x')
        .set('Authorization', `Bearer ${TEST_API_KEY}`);
      expect(res.status).toBe(404);
      expect(res.body.code).toBe('WORKSPACE_NOT_FOUND');
    });

    it('maps AuthenticationError to 401', async () => {
      mockOrchestrator.list.mockRejectedValue(new AuthenticationError('coder', 'Bad token'));
      const res = await request(app)
        .get('/workspaces')
        .set('Authorization', `Bearer ${TEST_API_KEY}`);
      expect(res.status).toBe(401);
      expect(res.body.code).toBe('AUTHENTICATION_FAILED');
    });

    it('maps AuthorizationError to 403', async () => {
      mockOrchestrator.list.mockRejectedValue(new AuthorizationError('coder', 'list', 'Forbidden'));
      const res = await request(app)
        .get('/workspaces')
        .set('Authorization', `Bearer ${TEST_API_KEY}`);
      expect(res.status).toBe(403);
      expect(res.body.code).toBe('AUTHORIZATION_FAILED');
    });

    it('maps WorkspaceStateError to 409', async () => {
      mockOrchestrator.resume.mockRejectedValue(
        new WorkspaceStateError('coder', 'resume', 'ws-x', 'failed', ['running', 'stopped']),
      );
      const res = await request(app)
        .post('/workspaces/ws-x/resume')
        .set('Authorization', `Bearer ${TEST_API_KEY}`);
      expect(res.status).toBe(409);
      expect(res.body.code).toBe('WORKSPACE_STATE_ERROR');
    });

    it('maps WorkspaceTimeoutError to 504', async () => {
      mockOrchestrator.create.mockRejectedValue(new WorkspaceTimeoutError('coder', 'create', 60000));
      const res = await request(app)
        .post('/workspaces')
        .set('Authorization', `Bearer ${TEST_API_KEY}`)
        .send({ name: 'x', repository: { owner: 'a', repo: 'b' }, retentionDays: 1 });
      expect(res.status).toBe(504);
      expect(res.body.code).toBe('TIMEOUT');
    });

    it('maps generic ProviderError to 500', async () => {
      mockOrchestrator.list.mockRejectedValue(new ProviderError('Something broke', 'coder', 'list'));
      const res = await request(app)
        .get('/workspaces')
        .set('Authorization', `Bearer ${TEST_API_KEY}`);
      expect(res.status).toBe(500);
      expect(res.body.code).toBe('PROVIDER_ERROR');
    });

    it('maps unknown errors to 500 without leaking details', async () => {
      mockOrchestrator.list.mockRejectedValue(new Error('secret internal error'));
      const res = await request(app)
        .get('/workspaces')
        .set('Authorization', `Bearer ${TEST_API_KEY}`);
      expect(res.status).toBe(500);
      expect(res.body.code).toBe('INTERNAL_ERROR');
      expect(res.body.error).toBe('Internal server error');
      expect(res.body.error).not.toContain('secret');
    });
  });
});
