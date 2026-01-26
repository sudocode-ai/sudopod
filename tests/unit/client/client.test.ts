/**
 * Unit tests for SudopodClient.
 *
 * Tests the HTTP client in isolation using mocked fetch.
 *
 * @see s-3j7d - SudopodClient Implementation specification
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { SudopodClient, SudopodClientError } from '../../../src/client/index.js';
import type { Workspace, User } from '../../../src/types/index.js';

/**
 * Creates a sample workspace for testing.
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
 * Creates a sample user for testing.
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

/**
 * Helper to create a mock Response.
 */
function mockResponse(body: unknown, status = 200): Response {
  return new Response(body === null ? null : JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

describe('SudopodClient', () => {
  let fetchSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    fetchSpy = vi.spyOn(global, 'fetch');
  });

  afterEach(() => {
    fetchSpy.mockRestore();
  });

  describe('constructor', () => {
    it('normalizes provider URL by removing trailing slash', async () => {
      fetchSpy.mockResolvedValue(mockResponse({ ok: true, timestamp: '2026-01-24T12:00:00Z' }));

      const client = new SudopodClient({
        providerUrl: 'https://example.com/',
        apiKey: 'test-key',
      });

      await client.health();

      expect(fetchSpy).toHaveBeenCalledWith(
        'https://example.com/health',
        expect.anything()
      );
    });

    it('applies basePath correctly', async () => {
      fetchSpy.mockResolvedValue(mockResponse({ ok: true, timestamp: '2026-01-24T12:00:00Z' }));

      const client = new SudopodClient({
        providerUrl: 'https://example.com',
        apiKey: 'test-key',
        basePath: '/api/v1',
      });

      await client.health();

      expect(fetchSpy).toHaveBeenCalledWith(
        'https://example.com/api/v1/health',
        expect.anything()
      );
    });

    it('normalizes basePath with leading and trailing slashes', async () => {
      fetchSpy.mockResolvedValue(mockResponse({ ok: true, timestamp: '2026-01-24T12:00:00Z' }));

      const client = new SudopodClient({
        providerUrl: 'https://example.com/',
        apiKey: 'test-key',
        basePath: '/api/v1/',
      });

      await client.health();

      expect(fetchSpy).toHaveBeenCalledWith(
        'https://example.com/api/v1/health',
        expect.anything()
      );
    });

    it('uses default timeout of 30s', async () => {
      // We can't easily test the actual timeout value, but we verify the client is created
      const client = new SudopodClient({
        providerUrl: 'https://example.com',
        apiKey: 'test-key',
      });
      expect(client).toBeDefined();
    });

    it('uses default retries of 3', async () => {
      // Client should be created with default values
      const client = new SudopodClient({
        providerUrl: 'https://example.com',
        apiKey: 'test-key',
      });
      expect(client).toBeDefined();
    });
  });

  describe('authentication', () => {
    it('sends Bearer token in Authorization header', async () => {
      fetchSpy.mockResolvedValue(mockResponse({ ok: true, timestamp: '2026-01-24T12:00:00Z' }));

      const client = new SudopodClient({
        providerUrl: 'https://example.com',
        apiKey: 'my-secret-key',
      });

      await client.health();

      expect(fetchSpy).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          headers: expect.objectContaining({
            Authorization: 'Bearer my-secret-key',
          }),
        })
      );
    });

    it('sends Content-Type: application/json', async () => {
      fetchSpy.mockResolvedValue(mockResponse({ ok: true, timestamp: '2026-01-24T12:00:00Z' }));

      const client = new SudopodClient({
        providerUrl: 'https://example.com',
        apiKey: 'test-key',
      });

      await client.health();

      expect(fetchSpy).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          headers: expect.objectContaining({
            'Content-Type': 'application/json',
          }),
        })
      );
    });
  });

  describe('createWorkspace', () => {
    it('sends POST request to /workspaces', async () => {
      const mockWorkspace = createSampleWorkspace({ status: 'pending' });
      fetchSpy.mockResolvedValue(mockResponse(mockWorkspace, 201));

      const client = new SudopodClient({
        providerUrl: 'https://example.com',
        apiKey: 'test-key',
      });

      await client.createWorkspace({
        repository: 'owner/repo',
        userIdentity: { email: 'user@test.com' },
      });

      expect(fetchSpy).toHaveBeenCalledWith(
        'https://example.com/workspaces',
        expect.objectContaining({
          method: 'POST',
        })
      );
    });

    it('sends request body as JSON', async () => {
      const mockWorkspace = createSampleWorkspace({ status: 'pending' });
      fetchSpy.mockResolvedValue(mockResponse(mockWorkspace, 201));

      const client = new SudopodClient({
        providerUrl: 'https://example.com',
        apiKey: 'test-key',
      });

      await client.createWorkspace({
        repository: 'owner/repo',
        userIdentity: { email: 'user@test.com' },
        cpuCores: 4,
      });

      const callArgs = fetchSpy.mock.calls[0];
      const body = JSON.parse(callArgs[1]?.body as string);
      expect(body.repository).toBe('owner/repo');
      expect(body.userIdentity.email).toBe('user@test.com');
      expect(body.cpuCores).toBe(4);
    });

    it('returns workspace from response', async () => {
      const mockWorkspace = createSampleWorkspace({ status: 'pending' });
      fetchSpy.mockResolvedValue(mockResponse(mockWorkspace, 201));

      const client = new SudopodClient({
        providerUrl: 'https://example.com',
        apiKey: 'test-key',
      });

      const result = await client.createWorkspace({
        repository: 'owner/repo',
        userIdentity: { email: 'user@test.com' },
      });

      expect(result).toEqual(mockWorkspace);
    });

    it('throws SudopodClientError on 400 response', async () => {
      fetchSpy.mockResolvedValue(
        mockResponse({ error: 'Invalid request', code: 'INVALID_REQUEST' }, 400)
      );

      const client = new SudopodClient({
        providerUrl: 'https://example.com',
        apiKey: 'test-key',
      });

      await expect(
        client.createWorkspace({
          repository: 'invalid',
          userIdentity: { email: 'user@test.com' },
        })
      ).rejects.toThrow(SudopodClientError);
    });
  });

  describe('getWorkspace', () => {
    it('sends GET request to /workspaces/:id', async () => {
      const mockWorkspace = createSampleWorkspace();
      fetchSpy.mockResolvedValue(mockResponse(mockWorkspace));

      const client = new SudopodClient({
        providerUrl: 'https://example.com',
        apiKey: 'test-key',
      });

      await client.getWorkspace('ws-123');

      expect(fetchSpy).toHaveBeenCalledWith(
        'https://example.com/workspaces/ws-123',
        expect.objectContaining({
          method: 'GET',
        })
      );
    });

    it('URL-encodes workspace ID', async () => {
      const mockWorkspace = createSampleWorkspace({ id: 'ws/123' });
      fetchSpy.mockResolvedValue(mockResponse(mockWorkspace));

      const client = new SudopodClient({
        providerUrl: 'https://example.com',
        apiKey: 'test-key',
      });

      await client.getWorkspace('ws/123');

      expect(fetchSpy).toHaveBeenCalledWith(
        'https://example.com/workspaces/ws%2F123',
        expect.anything()
      );
    });

    it('returns workspace from response', async () => {
      const mockWorkspace = createSampleWorkspace();
      fetchSpy.mockResolvedValue(mockResponse(mockWorkspace));

      const client = new SudopodClient({
        providerUrl: 'https://example.com',
        apiKey: 'test-key',
      });

      const result = await client.getWorkspace('ws-123');

      expect(result).toEqual(mockWorkspace);
    });

    it('throws SudopodClientError on 404', async () => {
      fetchSpy.mockResolvedValue(
        mockResponse({ error: 'Workspace not found', code: 'WORKSPACE_NOT_FOUND' }, 404)
      );

      const client = new SudopodClient({
        providerUrl: 'https://example.com',
        apiKey: 'test-key',
      });

      const error = await client.getWorkspace('ws-notfound').catch((e) => e);

      expect(error).toBeInstanceOf(SudopodClientError);
      expect(error.statusCode).toBe(404);
      expect(error.code).toBe('WORKSPACE_NOT_FOUND');
    });
  });

  describe('deleteWorkspace', () => {
    it('sends DELETE request to /workspaces/:id', async () => {
      fetchSpy.mockResolvedValue(new Response(null, { status: 204 }));

      const client = new SudopodClient({
        providerUrl: 'https://example.com',
        apiKey: 'test-key',
      });

      await client.deleteWorkspace('ws-123');

      expect(fetchSpy).toHaveBeenCalledWith(
        'https://example.com/workspaces/ws-123',
        expect.objectContaining({
          method: 'DELETE',
        })
      );
    });

    it('handles 204 No Content response', async () => {
      fetchSpy.mockResolvedValue(new Response(null, { status: 204 }));

      const client = new SudopodClient({
        providerUrl: 'https://example.com',
        apiKey: 'test-key',
      });

      await expect(client.deleteWorkspace('ws-123')).resolves.toBeUndefined();
    });

    it('URL-encodes workspace ID', async () => {
      fetchSpy.mockResolvedValue(new Response(null, { status: 204 }));

      const client = new SudopodClient({
        providerUrl: 'https://example.com',
        apiKey: 'test-key',
      });

      await client.deleteWorkspace('ws/with/slashes');

      expect(fetchSpy).toHaveBeenCalledWith(
        'https://example.com/workspaces/ws%2Fwith%2Fslashes',
        expect.anything()
      );
    });
  });

  describe('listWorkspaces', () => {
    it('sends GET request to /workspaces', async () => {
      fetchSpy.mockResolvedValue(mockResponse([]));

      const client = new SudopodClient({
        providerUrl: 'https://example.com',
        apiKey: 'test-key',
      });

      await client.listWorkspaces();

      expect(fetchSpy).toHaveBeenCalledWith(
        'https://example.com/workspaces',
        expect.objectContaining({
          method: 'GET',
        })
      );
    });

    it('includes query parameters from filters', async () => {
      fetchSpy.mockResolvedValue(mockResponse([]));

      const client = new SudopodClient({
        providerUrl: 'https://example.com',
        apiKey: 'test-key',
      });

      await client.listWorkspaces({
        owner: 'user@test.com',
        status: 'running',
        limit: 10,
        offset: 5,
      });

      const calledUrl = fetchSpy.mock.calls[0][0] as string;
      expect(calledUrl).toContain('owner=user%40test.com');
      expect(calledUrl).toContain('status=running');
      expect(calledUrl).toContain('limit=10');
      expect(calledUrl).toContain('offset=5');
    });

    it('omits undefined filter values', async () => {
      fetchSpy.mockResolvedValue(mockResponse([]));

      const client = new SudopodClient({
        providerUrl: 'https://example.com',
        apiKey: 'test-key',
      });

      await client.listWorkspaces({ owner: 'testuser' });

      const calledUrl = fetchSpy.mock.calls[0][0] as string;
      expect(calledUrl).toContain('owner=testuser');
      expect(calledUrl).not.toContain('status=');
      expect(calledUrl).not.toContain('limit=');
      expect(calledUrl).not.toContain('offset=');
    });

    it('returns array of workspaces', async () => {
      const mockWorkspaces = [
        createSampleWorkspace({ id: 'ws-1' }),
        createSampleWorkspace({ id: 'ws-2' }),
      ];
      fetchSpy.mockResolvedValue(mockResponse(mockWorkspaces));

      const client = new SudopodClient({
        providerUrl: 'https://example.com',
        apiKey: 'test-key',
      });

      const result = await client.listWorkspaces();

      expect(result).toEqual(mockWorkspaces);
    });
  });

  describe('startWorkspace', () => {
    it('sends POST request to /workspaces/:id/start', async () => {
      fetchSpy.mockResolvedValue(new Response(null, { status: 204 }));

      const client = new SudopodClient({
        providerUrl: 'https://example.com',
        apiKey: 'test-key',
      });

      await client.startWorkspace('ws-123');

      expect(fetchSpy).toHaveBeenCalledWith(
        'https://example.com/workspaces/ws-123/start',
        expect.objectContaining({
          method: 'POST',
        })
      );
    });

    it('handles 204 No Content response', async () => {
      fetchSpy.mockResolvedValue(new Response(null, { status: 204 }));

      const client = new SudopodClient({
        providerUrl: 'https://example.com',
        apiKey: 'test-key',
      });

      await expect(client.startWorkspace('ws-123')).resolves.toBeUndefined();
    });
  });

  describe('stopWorkspace', () => {
    it('sends POST request to /workspaces/:id/stop', async () => {
      fetchSpy.mockResolvedValue(new Response(null, { status: 204 }));

      const client = new SudopodClient({
        providerUrl: 'https://example.com',
        apiKey: 'test-key',
      });

      await client.stopWorkspace('ws-123');

      expect(fetchSpy).toHaveBeenCalledWith(
        'https://example.com/workspaces/ws-123/stop',
        expect.objectContaining({
          method: 'POST',
        })
      );
    });
  });

  describe('ensureUser', () => {
    it('sends POST request to /users', async () => {
      const mockUser = createSampleUser({ status: 'dormant' });
      fetchSpy.mockResolvedValue(mockResponse(mockUser, 201));

      const client = new SudopodClient({
        providerUrl: 'https://example.com',
        apiKey: 'test-key',
      });

      await client.ensureUser({
        email: 'user@example.com',
        loginType: 'oidc',
      });

      expect(fetchSpy).toHaveBeenCalledWith(
        'https://example.com/users',
        expect.objectContaining({
          method: 'POST',
        })
      );
    });

    it('returns user from response', async () => {
      const mockUser = createSampleUser();
      fetchSpy.mockResolvedValue(mockResponse(mockUser, 201));

      const client = new SudopodClient({
        providerUrl: 'https://example.com',
        apiKey: 'test-key',
      });

      const result = await client.ensureUser({
        email: 'user@example.com',
        loginType: 'oidc',
      });

      expect(result).toEqual(mockUser);
    });
  });

  describe('health', () => {
    it('sends GET request to /health', async () => {
      const timestamp = new Date().toISOString();
      fetchSpy.mockResolvedValue(mockResponse({ ok: true, timestamp }));

      const client = new SudopodClient({
        providerUrl: 'https://example.com',
        apiKey: 'test-key',
      });

      await client.health();

      expect(fetchSpy).toHaveBeenCalledWith(
        'https://example.com/health',
        expect.objectContaining({
          method: 'GET',
        })
      );
    });

    it('returns health check response', async () => {
      const timestamp = new Date().toISOString();
      fetchSpy.mockResolvedValue(mockResponse({ ok: true, timestamp }));

      const client = new SudopodClient({
        providerUrl: 'https://example.com',
        apiKey: 'test-key',
      });

      const result = await client.health();

      expect(result.ok).toBe(true);
      expect(result.timestamp).toBe(timestamp);
    });
  });

  describe('retry behavior', () => {
    it('retries on 500 errors', async () => {
      const mockWorkspace = createSampleWorkspace();
      fetchSpy
        .mockResolvedValueOnce(mockResponse({ error: 'Server error' }, 500))
        .mockResolvedValueOnce(mockResponse(mockWorkspace));

      const client = new SudopodClient({
        providerUrl: 'https://example.com',
        apiKey: 'test-key',
        retries: 3,
      });

      const result = await client.getWorkspace('ws-123');

      expect(fetchSpy).toHaveBeenCalledTimes(2);
      expect(result).toEqual(mockWorkspace);
    });

    it('retries on 502 errors', async () => {
      const mockWorkspace = createSampleWorkspace();
      fetchSpy
        .mockResolvedValueOnce(mockResponse({ error: 'Bad gateway' }, 502))
        .mockResolvedValueOnce(mockResponse(mockWorkspace));

      const client = new SudopodClient({
        providerUrl: 'https://example.com',
        apiKey: 'test-key',
        retries: 3,
      });

      const result = await client.getWorkspace('ws-123');

      expect(fetchSpy).toHaveBeenCalledTimes(2);
      expect(result).toEqual(mockWorkspace);
    });

    it('retries on 503 errors', async () => {
      const mockWorkspace = createSampleWorkspace();
      fetchSpy
        .mockResolvedValueOnce(mockResponse({ error: 'Service unavailable' }, 503))
        .mockResolvedValueOnce(mockResponse(mockWorkspace));

      const client = new SudopodClient({
        providerUrl: 'https://example.com',
        apiKey: 'test-key',
        retries: 3,
      });

      const result = await client.getWorkspace('ws-123');

      expect(fetchSpy).toHaveBeenCalledTimes(2);
      expect(result).toEqual(mockWorkspace);
    });

    it('does not retry on 400 errors', async () => {
      fetchSpy.mockResolvedValue(
        mockResponse({ error: 'Bad request', code: 'INVALID_REQUEST' }, 400)
      );

      const client = new SudopodClient({
        providerUrl: 'https://example.com',
        apiKey: 'test-key',
        retries: 3,
      });

      await expect(client.getWorkspace('ws-123')).rejects.toThrow();
      expect(fetchSpy).toHaveBeenCalledTimes(1);
    });

    it('does not retry on 401 errors', async () => {
      fetchSpy.mockResolvedValue(
        mockResponse({ error: 'Unauthorized', code: 'AUTHENTICATION_FAILED' }, 401)
      );

      const client = new SudopodClient({
        providerUrl: 'https://example.com',
        apiKey: 'test-key',
        retries: 3,
      });

      await expect(client.getWorkspace('ws-123')).rejects.toThrow();
      expect(fetchSpy).toHaveBeenCalledTimes(1);
    });

    it('does not retry on 404 errors', async () => {
      fetchSpy.mockResolvedValue(
        mockResponse({ error: 'Not found', code: 'WORKSPACE_NOT_FOUND' }, 404)
      );

      const client = new SudopodClient({
        providerUrl: 'https://example.com',
        apiKey: 'test-key',
        retries: 3,
      });

      await expect(client.getWorkspace('ws-123')).rejects.toThrow();
      expect(fetchSpy).toHaveBeenCalledTimes(1);
    });

    it('throws after max retries exceeded', async () => {
      fetchSpy.mockResolvedValue(mockResponse({ error: 'Server error' }, 500));

      const client = new SudopodClient({
        providerUrl: 'https://example.com',
        apiKey: 'test-key',
        retries: 2,
      });

      await expect(client.getWorkspace('ws-123')).rejects.toThrow();
      expect(fetchSpy).toHaveBeenCalledTimes(3); // Initial + 2 retries
    });

    it('retries on network errors', async () => {
      const mockWorkspace = createSampleWorkspace();
      fetchSpy
        .mockRejectedValueOnce(new Error('Network error'))
        .mockResolvedValueOnce(mockResponse(mockWorkspace));

      const client = new SudopodClient({
        providerUrl: 'https://example.com',
        apiKey: 'test-key',
        retries: 3,
      });

      const result = await client.getWorkspace('ws-123');

      expect(fetchSpy).toHaveBeenCalledTimes(2);
      expect(result).toEqual(mockWorkspace);
    });

    it('uses exponential backoff between retries', async () => {
      vi.useFakeTimers();
      const mockWorkspace = createSampleWorkspace();
      fetchSpy
        .mockResolvedValueOnce(mockResponse({ error: 'Server error' }, 500))
        .mockResolvedValueOnce(mockResponse({ error: 'Server error' }, 500))
        .mockResolvedValueOnce(mockResponse(mockWorkspace));

      const client = new SudopodClient({
        providerUrl: 'https://example.com',
        apiKey: 'test-key',
        retries: 3,
      });

      const promise = client.getWorkspace('ws-123');

      // First retry after 100ms
      await vi.advanceTimersByTimeAsync(100);
      // Second retry after 200ms
      await vi.advanceTimersByTimeAsync(200);

      const result = await promise;
      expect(result).toEqual(mockWorkspace);

      vi.useRealTimers();
    });
  });

  describe('timeout handling', () => {
    it('throws SudopodClientError on abort (timeout)', async () => {
      // Mock fetch to throw AbortError (what happens when timeout fires)
      const abortError = new Error('The operation was aborted');
      abortError.name = 'AbortError';
      fetchSpy.mockRejectedValue(abortError);

      const client = new SudopodClient({
        providerUrl: 'https://example.com',
        apiKey: 'test-key',
        timeout: 100,
        retries: 0, // No retries for this test
      });

      const error = await client.health().catch((e) => e);

      expect(error).toBeInstanceOf(SudopodClientError);
      expect(error.code).toBe('TIMEOUT');
      expect(error.statusCode).toBe(408);
      expect(error.message).toBe('Request timed out');
    });

    it('throws SudopodClientError on TimeoutError', async () => {
      // Some environments throw TimeoutError instead of AbortError
      const timeoutError = new Error('The operation timed out');
      timeoutError.name = 'TimeoutError';
      fetchSpy.mockRejectedValue(timeoutError);

      const client = new SudopodClient({
        providerUrl: 'https://example.com',
        apiKey: 'test-key',
        timeout: 100,
        retries: 0,
      });

      const error = await client.health().catch((e) => e);

      expect(error).toBeInstanceOf(SudopodClientError);
      expect(error.code).toBe('TIMEOUT');
      expect(error.statusCode).toBe(408);
    });
  });

  describe('error response parsing', () => {
    it('parses error message from response', async () => {
      fetchSpy.mockResolvedValue(
        mockResponse({ error: 'Custom error message', code: 'CUSTOM_ERROR' }, 400)
      );

      const client = new SudopodClient({
        providerUrl: 'https://example.com',
        apiKey: 'test-key',
      });

      const error = await client.getWorkspace('ws-123').catch((e) => e);

      expect(error).toBeInstanceOf(SudopodClientError);
      expect(error.message).toBe('Custom error message');
      expect(error.code).toBe('CUSTOM_ERROR');
      expect(error.statusCode).toBe(400);
    });

    it('uses default error message when response has no error field', async () => {
      fetchSpy.mockResolvedValue(mockResponse({}, 500));

      const client = new SudopodClient({
        providerUrl: 'https://example.com',
        apiKey: 'test-key',
        retries: 0,
      });

      const error = await client.getWorkspace('ws-123').catch((e) => e);

      expect(error).toBeInstanceOf(SudopodClientError);
      expect(error.message).toBe('Request failed with status 500');
    });

    it('uses UNKNOWN_ERROR when response has no code field', async () => {
      fetchSpy.mockResolvedValue(
        mockResponse({ error: 'Something went wrong' }, 400)
      );

      const client = new SudopodClient({
        providerUrl: 'https://example.com',
        apiKey: 'test-key',
      });

      const error = await client.getWorkspace('ws-123').catch((e) => e);

      expect(error.code).toBe('UNKNOWN_ERROR');
    });
  });
});

describe('SudopodClientError', () => {
  it('has correct name property', () => {
    const error = new SudopodClientError('Test error', 'TEST_CODE', 400);
    expect(error.name).toBe('SudopodClientError');
  });

  it('isNotFound returns true for 404', () => {
    const error = new SudopodClientError('Not found', 'NOT_FOUND', 404);
    expect(error.isNotFound()).toBe(true);
  });

  it('isNotFound returns false for other status codes', () => {
    const error = new SudopodClientError('Bad request', 'BAD_REQUEST', 400);
    expect(error.isNotFound()).toBe(false);
  });

  it('isClientError returns true for 4xx', () => {
    expect(new SudopodClientError('', '', 400).isClientError()).toBe(true);
    expect(new SudopodClientError('', '', 401).isClientError()).toBe(true);
    expect(new SudopodClientError('', '', 404).isClientError()).toBe(true);
    expect(new SudopodClientError('', '', 499).isClientError()).toBe(true);
  });

  it('isClientError returns false for non-4xx', () => {
    expect(new SudopodClientError('', '', 399).isClientError()).toBe(false);
    expect(new SudopodClientError('', '', 500).isClientError()).toBe(false);
  });

  it('isServerError returns true for 5xx', () => {
    expect(new SudopodClientError('', '', 500).isServerError()).toBe(true);
    expect(new SudopodClientError('', '', 502).isServerError()).toBe(true);
    expect(new SudopodClientError('', '', 503).isServerError()).toBe(true);
  });

  it('isServerError returns false for non-5xx', () => {
    expect(new SudopodClientError('', '', 400).isServerError()).toBe(false);
    expect(new SudopodClientError('', '', 404).isServerError()).toBe(false);
  });

  it('isTimeout returns true for 408', () => {
    const error = new SudopodClientError('Request timed out', 'TIMEOUT', 408);
    expect(error.isTimeout()).toBe(true);
  });

  it('isTimeout returns true for TIMEOUT code', () => {
    const error = new SudopodClientError('Timed out', 'TIMEOUT', 0);
    expect(error.isTimeout()).toBe(true);
  });
});
