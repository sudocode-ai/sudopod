/**
 * CoderClient user operations tests (i-26k1)
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { CoderClient } from '../../../src/coder-sdk/client.js';

describe('CoderClient user operations', () => {
  const mockFetch = vi.fn();
  let client: CoderClient;

  beforeEach(() => {
    vi.stubGlobal('fetch', mockFetch);
    client = new CoderClient({
      baseUrl: 'https://coder.example.com',
      token: 'test-token',
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('getCurrentUser', () => {
    it('calls GET /api/v2/users/me', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        status: 200,
        json: () => Promise.resolve({ id: 'user-1', username: 'admin' }),
      });

      await client.getCurrentUser();

      const [url, init] = mockFetch.mock.calls[0];
      expect(url).toBe('https://coder.example.com/api/v2/users/me');
      expect(init.method).toBe('GET');
    });
  });

  describe('getUser', () => {
    it('URI-encodes the username', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        status: 200,
        json: () => Promise.resolve({ id: 'user-2', username: 'user@email.com' }),
      });

      await client.getUser('user@email.com');

      const [url] = mockFetch.mock.calls[0];
      expect(url).toBe('https://coder.example.com/api/v2/users/user%40email.com');
    });

    it('passes simple usernames without encoding', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        status: 200,
        json: () => Promise.resolve({ id: 'user-3', username: 'admin' }),
      });

      await client.getUser('admin');

      const [url] = mockFetch.mock.calls[0];
      expect(url).toBe('https://coder.example.com/api/v2/users/admin');
    });
  });

  describe('listUsers', () => {
    it('builds query params correctly', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        status: 200,
        json: () => Promise.resolve({ users: [], count: 0 }),
      });

      await client.listUsers({ query: 'email:test@example.com', limit: 5, offset: 0 });

      const [url] = mockFetch.mock.calls[0];
      const parsed = new URL(url);
      expect(parsed.searchParams.get('q')).toBe('email:test@example.com');
      expect(parsed.searchParams.get('limit')).toBe('5');
      expect(parsed.searchParams.get('offset')).toBe('0');
    });

    it('omits undefined query params', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        status: 200,
        json: () => Promise.resolve({ users: [], count: 0 }),
      });

      await client.listUsers();

      const [url] = mockFetch.mock.calls[0];
      const parsed = new URL(url);
      expect(parsed.searchParams.toString()).toBe('');
    });
  });

  describe('createUser', () => {
    it('sends correct body with default login_type "none"', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        status: 200,
        json: () => Promise.resolve({ id: 'new-user', username: 'headless' }),
      });

      await client.createUser({
        email: 'new@example.com',
        username: 'headless',
        name: 'Headless User',
      });

      const [url, init] = mockFetch.mock.calls[0];
      expect(url).toBe('https://coder.example.com/api/v2/users');
      expect(init.method).toBe('POST');

      const body = JSON.parse(init.body);
      expect(body.email).toBe('new@example.com');
      expect(body.username).toBe('headless');
      expect(body.name).toBe('Headless User');
      expect(body.login_type).toBe('none');
    });

    it('respects explicit loginType', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        status: 200,
        json: () => Promise.resolve({ id: 'user-pw' }),
      });

      await client.createUser({
        email: 'pw@example.com',
        username: 'pwuser',
        loginType: 'password',
      });

      const body = JSON.parse(mockFetch.mock.calls[0][1].body);
      expect(body.login_type).toBe('password');
    });

    it('passes organization IDs', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        status: 200,
        json: () => Promise.resolve({ id: 'user-org' }),
      });

      await client.createUser({
        email: 'org@example.com',
        username: 'orguser',
        organizationIds: ['org-1', 'org-2'],
      });

      const body = JSON.parse(mockFetch.mock.calls[0][1].body);
      expect(body.organization_ids).toEqual(['org-1', 'org-2']);
    });
  });
});
