/**
 * CoderClient workspace operations tests (i-155u)
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { CoderClient } from '../../../src/coder-sdk/client.js';

describe('CoderClient workspace operations', () => {
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

  describe('createWorkspace', () => {
    it('constructs correct URL and maps camelCase to snake_case body', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        status: 200,
        json: () => Promise.resolve({ id: 'ws-1', name: 'test-ws' }),
      });

      await client.createWorkspace({
        organizationId: 'org-1',
        username: 'me',
        name: 'test-ws',
        templateId: 'tmpl-1',
        richParameterValues: [{ name: 'cpu', value: '4' }],
        ttlMs: 86400000,
        autostartSchedule: 'CRON_TZ=US/Central 30 9 * * 1-5',
      });

      const [url, init] = mockFetch.mock.calls[0];
      expect(url).toBe(
        'https://coder.example.com/api/v2/organizations/org-1/members/me/workspaces',
      );
      expect(init.method).toBe('POST');

      const body = JSON.parse(init.body);
      expect(body.name).toBe('test-ws');
      expect(body.template_id).toBe('tmpl-1');
      expect(body.rich_parameter_values).toEqual([{ name: 'cpu', value: '4' }]);
      expect(body.ttl_ms).toBe(86400000);
      expect(body.autostart_schedule).toBe('CRON_TZ=US/Central 30 9 * * 1-5');
    });
  });

  describe('getWorkspace', () => {
    it('calls GET /api/v2/workspaces/{id}', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        status: 200,
        json: () => Promise.resolve({ id: 'ws-1' }),
      });

      await client.getWorkspace('ws-1');

      const [url] = mockFetch.mock.calls[0];
      expect(url).toBe('https://coder.example.com/api/v2/workspaces/ws-1');
    });
  });

  describe('getWorkspaceByOwnerAndName', () => {
    it('calls GET /api/v2/users/{owner}/workspace/{name}', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        status: 200,
        json: () => Promise.resolve({ id: 'ws-1', name: 'my-ws' }),
      });

      await client.getWorkspaceByOwnerAndName('me', 'my-ws');

      const [url] = mockFetch.mock.calls[0];
      expect(url).toBe('https://coder.example.com/api/v2/users/me/workspace/my-ws');
    });
  });

  describe('listWorkspaces', () => {
    it('builds query params from params', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        status: 200,
        json: () => Promise.resolve({ workspaces: [], count: 0 }),
      });

      await client.listWorkspaces({ query: 'owner:me status:running', limit: 25, offset: 0 });

      const [url] = mockFetch.mock.calls[0];
      const parsed = new URL(url);
      expect(parsed.searchParams.get('q')).toBe('owner:me status:running');
      expect(parsed.searchParams.get('limit')).toBe('25');
      expect(parsed.searchParams.get('offset')).toBe('0');
    });

    it('works with no params', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        status: 200,
        json: () => Promise.resolve({ workspaces: [], count: 0 }),
      });

      await client.listWorkspaces();

      const [url] = mockFetch.mock.calls[0];
      expect(new URL(url).searchParams.toString()).toBe('');
    });
  });

  describe('createWorkspaceBuild', () => {
    it('maps camelCase to snake_case body', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        status: 200,
        json: () => Promise.resolve({ id: 'build-1' }),
      });

      await client.createWorkspaceBuild({
        workspaceId: 'ws-1',
        transition: 'start',
        templateVersionId: 'ver-2',
        richParameterValues: [{ name: 'cpu', value: '8' }],
      });

      const [url, init] = mockFetch.mock.calls[0];
      expect(url).toBe('https://coder.example.com/api/v2/workspaces/ws-1/builds');
      expect(init.method).toBe('POST');

      const body = JSON.parse(init.body);
      expect(body.transition).toBe('start');
      expect(body.template_version_id).toBe('ver-2');
      expect(body.rich_parameter_values).toEqual([{ name: 'cpu', value: '8' }]);
    });
  });

  describe('convenience methods', () => {
    it('startWorkspace delegates to createWorkspaceBuild with transition "start"', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        status: 200,
        json: () => Promise.resolve({ id: 'build-1', transition: 'start' }),
      });

      await client.startWorkspace('ws-1');

      const body = JSON.parse(mockFetch.mock.calls[0][1].body);
      expect(body.transition).toBe('start');
    });

    it('stopWorkspace delegates with transition "stop"', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        status: 200,
        json: () => Promise.resolve({ id: 'build-2', transition: 'stop' }),
      });

      await client.stopWorkspace('ws-1');

      const body = JSON.parse(mockFetch.mock.calls[0][1].body);
      expect(body.transition).toBe('stop');
    });

    it('deleteWorkspace delegates with transition "delete"', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        status: 200,
        json: () => Promise.resolve({ id: 'build-3', transition: 'delete' }),
      });

      await client.deleteWorkspace('ws-1');

      const body = JSON.parse(mockFetch.mock.calls[0][1].body);
      expect(body.transition).toBe('delete');
    });
  });

  describe('extendWorkspaceDeadline', () => {
    it('serializes Date to ISO string', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        status: 204,
      });

      const deadline = new Date('2025-06-15T12:00:00.000Z');
      await client.extendWorkspaceDeadline('ws-1', deadline);

      const [url, init] = mockFetch.mock.calls[0];
      expect(url).toBe('https://coder.example.com/api/v2/workspaces/ws-1/extend');
      expect(init.method).toBe('PUT');

      const body = JSON.parse(init.body);
      expect(body.deadline).toBe('2025-06-15T12:00:00.000Z');
    });
  });
});
