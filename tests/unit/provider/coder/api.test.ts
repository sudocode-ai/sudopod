/**
 * Coder API Client Unit Tests
 *
 * Tests CoderApiClient and CoderApiError without a real Coder instance.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { CoderApiClient, CoderApiError } from '../../../../src/provider/providers/coder/api.js';

describe('CoderApiClient (Unit)', () => {
  const mockFetch = vi.fn();

  beforeEach(() => {
    vi.stubGlobal('fetch', mockFetch);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    mockFetch.mockReset();
  });

  describe('request', () => {
    it('should include Coder-Session-Token header', async () => {
      const client = new CoderApiClient('https://coder.example.com', 'test-token');

      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: () => Promise.resolve({ id: 'user-123' }),
      });

      await client.getMe();

      expect(mockFetch).toHaveBeenCalledWith(
        'https://coder.example.com/api/v2/users/me',
        expect.objectContaining({
          headers: expect.objectContaining({
            'Coder-Session-Token': 'test-token',
          }),
        })
      );
    });

    it('should strip trailing slash from URL', async () => {
      const client = new CoderApiClient('https://coder.example.com/', 'test-token');

      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: () => Promise.resolve({ id: 'user-123' }),
      });

      await client.getMe();

      expect(mockFetch).toHaveBeenCalledWith(
        'https://coder.example.com/api/v2/users/me',
        expect.anything()
      );
    });

    it('should JSON stringify body for POST requests', async () => {
      const client = new CoderApiClient('https://coder.example.com', 'test-token');

      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: () => Promise.resolve({ id: 'ws-123' }),
      });

      await client.createWorkspace('org-1', 'testuser', {
        name: 'test-ws',
        template_id: 'tmpl-123',
      });

      const callArgs = mockFetch.mock.calls[0];
      expect(callArgs[1].body).toBe(
        JSON.stringify({
          name: 'test-ws',
          template_id: 'tmpl-123',
        })
      );
      expect(callArgs[1].headers['Content-Type']).toBe('application/json');
    });

    it('should handle 204 No Content responses', async () => {
      const client = new CoderApiClient('https://coder.example.com', 'test-token');

      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 204,
      });

      const result = await client.stopWorkspace('ws-123');

      expect(result).toBeUndefined();
    });
  });

  describe('CoderApiError', () => {
    it('should create error with status and body', () => {
      const error = new CoderApiError(404, 'Workspace not found');

      expect(error.status).toBe(404);
      expect(error.body).toBe('Workspace not found');
      expect(error.message).toBe('Coder API error (404): Workspace not found');
    });

    it('should use parsed message when available', () => {
      const error = new CoderApiError(
        400,
        '{"message":"Invalid name","detail":"Name cannot contain spaces"}',
        { message: 'Invalid name', detail: 'Name cannot contain spaces' }
      );

      expect(error.message).toBe('Coder API error (400): Invalid name');
    });

    it('should identify 401 as unauthorized', () => {
      const error = new CoderApiError(401, 'Token invalid');
      expect(error.isUnauthorized()).toBe(true);
      expect(error.isForbidden()).toBe(false);
    });

    it('should identify 403 as forbidden', () => {
      const error = new CoderApiError(403, 'No permission');
      expect(error.isForbidden()).toBe(true);
      expect(error.isUnauthorized()).toBe(false);
    });

    it('should identify 404 as not found', () => {
      const error = new CoderApiError(404, 'Not found');
      expect(error.isNotFound()).toBe(true);
    });

    it('should identify 409 as conflict', () => {
      const error = new CoderApiError(409, 'Workspace name exists');
      expect(error.isConflict()).toBe(true);
    });

    it('should identify 5xx as server error', () => {
      expect(new CoderApiError(500, 'Internal error').isServerError()).toBe(true);
      expect(new CoderApiError(502, 'Bad gateway').isServerError()).toBe(true);
      expect(new CoderApiError(503, 'Unavailable').isServerError()).toBe(true);
      expect(new CoderApiError(400, 'Bad request').isServerError()).toBe(false);
    });
  });

  describe('error handling', () => {
    it('should throw CoderApiError on non-2xx response', async () => {
      const client = new CoderApiClient('https://coder.example.com', 'test-token');

      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 404,
        text: () => Promise.resolve('{"message":"Workspace not found"}'),
      });

      await expect(client.getWorkspace('ws-123')).rejects.toThrow(CoderApiError);
    });

    it('should parse JSON error response when available', async () => {
      const client = new CoderApiClient('https://coder.example.com', 'test-token');

      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 400,
        text: () =>
          Promise.resolve(
            JSON.stringify({
              message: 'Invalid workspace name',
              detail: 'Name must be alphanumeric',
              validations: [{ field: 'name', error: 'invalid format' }],
            })
          ),
      });

      try {
        await client.createWorkspace('org-1', 'user', {
          name: 'invalid name!',
          template_id: 'tmpl-1',
        });
      } catch (error) {
        expect(error).toBeInstanceOf(CoderApiError);
        const apiError = error as CoderApiError;
        expect(apiError.response?.message).toBe('Invalid workspace name');
        expect(apiError.response?.validations).toHaveLength(1);
      }
    });

    it('should handle non-JSON error response', async () => {
      const client = new CoderApiClient('https://coder.example.com', 'test-token');

      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 502,
        text: () => Promise.resolve('Bad Gateway'),
      });

      try {
        await client.getMe();
      } catch (error) {
        expect(error).toBeInstanceOf(CoderApiError);
        const apiError = error as CoderApiError;
        expect(apiError.body).toBe('Bad Gateway');
        expect(apiError.response).toBeUndefined();
      }
    });
  });

  describe('listWorkspaces', () => {
    it('should build query string correctly', async () => {
      const client = new CoderApiClient('https://coder.example.com', 'test-token');

      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: () => Promise.resolve({ workspaces: [], count: 0 }),
      });

      await client.listWorkspaces('owner:me status:running', 25);

      expect(mockFetch).toHaveBeenCalledWith(
        'https://coder.example.com/api/v2/workspaces?q=owner%3Ame+status%3Arunning&limit=25',
        expect.anything()
      );
    });

    it('should return workspaces array from response', async () => {
      const client = new CoderApiClient('https://coder.example.com', 'test-token');

      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: () =>
          Promise.resolve({
            workspaces: [
              { id: 'ws-1', name: 'workspace-1' },
              { id: 'ws-2', name: 'workspace-2' },
            ],
            count: 2,
          }),
      });

      const result = await client.listWorkspaces();

      expect(result).toHaveLength(2);
      expect(result[0].name).toBe('workspace-1');
    });
  });

  describe('waitForStatus', () => {
    it('should return immediately if already in target status', async () => {
      const client = new CoderApiClient('https://coder.example.com', 'test-token');

      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: () =>
          Promise.resolve({
            id: 'ws-123',
            latest_build: { status: 'running' },
          }),
      });

      const workspace = await client.waitForStatus('ws-123', 'running');

      expect(workspace.latest_build.status).toBe('running');
      expect(mockFetch).toHaveBeenCalledTimes(1);
    });

    it('should throw on terminal failure state', async () => {
      const client = new CoderApiClient('https://coder.example.com', 'test-token');

      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: () =>
          Promise.resolve({
            id: 'ws-123',
            latest_build: { status: 'failed' },
          }),
      });

      await expect(
        client.waitForStatus('ws-123', 'running', 1000)
      ).rejects.toThrow('Workspace build failed while waiting for running');
    });

    it('should accept array of target statuses', async () => {
      const client = new CoderApiClient('https://coder.example.com', 'test-token');

      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: () =>
          Promise.resolve({
            id: 'ws-123',
            latest_build: { status: 'stopped' },
          }),
      });

      const workspace = await client.waitForStatus(
        'ws-123',
        ['running', 'stopped']
      );

      expect(workspace.latest_build.status).toBe('stopped');
    });
  });
});
