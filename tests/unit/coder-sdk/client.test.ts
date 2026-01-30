/**
 * CoderClient HTTP core tests (i-6omf)
 *
 * Tests the private request() method behavior via public API surface.
 * Mocks native fetch to verify HTTP plumbing.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { CoderClient } from '../../../src/coder-sdk/client.js';
import { CoderApiError } from '../../../src/coder-sdk/errors.js';

describe('CoderClient HTTP core', () => {
  const mockFetch = vi.fn();
  let client: CoderClient;

  beforeEach(() => {
    vi.stubGlobal('fetch', mockFetch);
    client = new CoderClient({
      baseUrl: 'https://coder.example.com',
      token: 'test-token-abc',
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('sends Coder-Session-Token header on all requests', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      status: 200,
      json: () => Promise.resolve({ id: 'user-1', username: 'me' }),
    });

    await client.getCurrentUser();

    expect(mockFetch).toHaveBeenCalledOnce();
    const [, init] = mockFetch.mock.calls[0];
    expect(init.headers['Coder-Session-Token']).toBe('test-token-abc');
  });

  it('constructs URL from baseUrl + path', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      status: 200,
      json: () => Promise.resolve({ id: 'user-1' }),
    });

    await client.getCurrentUser();

    const [url] = mockFetch.mock.calls[0];
    expect(url).toBe('https://coder.example.com/api/v2/users/me');
  });

  it('appends query params to URL', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      status: 200,
      json: () => Promise.resolve({ workspaces: [], count: 0 }),
    });

    await client.listWorkspaces({ query: 'owner:me', limit: 10, offset: 5 });

    const [url] = mockFetch.mock.calls[0];
    const parsed = new URL(url);
    expect(parsed.searchParams.get('q')).toBe('owner:me');
    expect(parsed.searchParams.get('limit')).toBe('10');
    expect(parsed.searchParams.get('offset')).toBe('5');
  });

  it('returns parsed JSON for successful response', async () => {
    const userData = { id: 'user-1', username: 'admin', email: 'admin@test.com' };
    mockFetch.mockResolvedValue({
      ok: true,
      status: 200,
      json: () => Promise.resolve(userData),
    });

    const result = await client.getCurrentUser();
    expect(result).toEqual(userData);
  });

  it('returns undefined for 204 No Content', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      status: 204,
    });

    const result = await client.extendWorkspaceDeadline('ws-1', new Date('2025-01-01T00:00:00Z'));
    expect(result).toBeUndefined();
  });

  it('throws CoderApiError on non-ok response', async () => {
    mockFetch.mockResolvedValue({
      ok: false,
      status: 404,
      text: () => Promise.resolve('{"message":"workspace not found"}'),
    });

    await expect(client.getWorkspace('nonexistent')).rejects.toThrow(CoderApiError);
    await expect(client.getWorkspace('nonexistent')).rejects.toMatchObject({
      status: 404,
      method: 'GET',
      path: '/api/v2/workspaces/nonexistent',
    });
  });

  it('sends Content-Type header only when body is present', async () => {
    // GET — no body
    mockFetch.mockResolvedValue({
      ok: true,
      status: 200,
      json: () => Promise.resolve({ id: 'user-1' }),
    });

    await client.getCurrentUser();
    const getHeaders = mockFetch.mock.calls[0][1].headers;
    expect(getHeaders['Content-Type']).toBeUndefined();

    mockFetch.mockClear();

    // POST — with body
    mockFetch.mockResolvedValue({
      ok: true,
      status: 200,
      json: () => Promise.resolve({ id: 'user-2' }),
    });

    await client.createUser({ email: 'a@b.com', username: 'test' });
    const postHeaders = mockFetch.mock.calls[0][1].headers;
    expect(postHeaders['Content-Type']).toBe('application/json');
  });

  it('serializes body as JSON', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      status: 200,
      json: () => Promise.resolve({ id: 'user-2' }),
    });

    await client.createUser({ email: 'a@b.com', username: 'testuser', name: 'Test' });

    const [, init] = mockFetch.mock.calls[0];
    const parsed = JSON.parse(init.body);
    expect(parsed.email).toBe('a@b.com');
    expect(parsed.username).toBe('testuser');
    expect(parsed.name).toBe('Test');
  });
});
