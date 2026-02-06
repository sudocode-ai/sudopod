/**
 * CoderProvider Unit Tests (i-68mw)
 *
 * Tests CoderProvider logic with a mocked CoderClient.
 * No Docker or real Coder instance needed.
 *
 * @see s-6q31 - Self-Hosted Coder Provider spec
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { CoderProvider } from '../../../../src/provider/coder/index.js';
import { CoderApiError } from '../../../../src/coder-sdk/errors.js';
import {
  WorkspaceNotFoundError,
  WorkspaceCreationError,
  WorkspaceStateError,
  AuthenticationError,
  AuthorizationError,
  ProviderError,
} from '../../../../src/provider/errors.js';
import type { CoderWorkspace, CoderWorkspaceBuild, CoderUser } from '../../../../src/coder-sdk/types.js';

// =============================================================================
// Test Fixtures
// =============================================================================

function mockUser(overrides?: Partial<CoderUser>): CoderUser {
  return {
    id: 'user-1',
    username: 'admin',
    name: 'Admin',
    email: 'admin@test.com',
    status: 'active',
    login_type: 'password',
    organization_ids: ['org-1'],
    created_at: '2026-01-01T00:00:00Z',
    ...overrides,
  };
}

function mockBuild(overrides?: Partial<CoderWorkspaceBuild>): CoderWorkspaceBuild {
  return {
    id: 'build-1',
    build_number: 1,
    transition: 'start',
    status: 'running',
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
    resources: [
      {
        id: 'res-1',
        name: 'main',
        type: 'docker_container',
        agents: [
          {
            id: 'agent-1',
            name: 'main',
            status: 'connected',
            lifecycle_state: 'ready',
            architecture: 'amd64',
            operating_system: 'linux',
            apps: [],
          },
        ],
        metadata: [
          { key: 'repository', value: 'octocat/Hello-World', sensitive: false },
        ],
      },
    ],
    job: { id: 'job-1', status: 'succeeded' },
    ...overrides,
  };
}

function mockWorkspace(overrides?: Partial<CoderWorkspace>): CoderWorkspace {
  return {
    id: 'ws-1',
    name: 'test-workspace',
    owner_id: 'user-1',
    owner_name: 'admin',
    organization_id: 'org-1',
    template_id: 'tpl-1',
    template_name: 'default',
    template_display_name: 'Default',
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
    last_used_at: '2026-01-01T00:00:00Z',
    latest_build: mockBuild(),
    health: { healthy: true, failing_agents: [] },
    ...overrides,
  };
}

// =============================================================================
// Mock Client Setup
// =============================================================================

function createMockedProvider() {
  const provider = new CoderProvider({
    url: 'https://coder.test',
    authToken: 'test-token',
  });

  // Access the private client and mock its methods
  const client = (provider as any).client;
  const mocks = {
    getCurrentUser: vi.spyOn(client, 'getCurrentUser'),
    getTemplateByName: vi.spyOn(client, 'getTemplateByName'),
    createWorkspace: vi.spyOn(client, 'createWorkspace'),
    getWorkspace: vi.spyOn(client, 'getWorkspace'),
    listWorkspaces: vi.spyOn(client, 'listWorkspaces'),
    startWorkspace: vi.spyOn(client, 'startWorkspace'),
    stopWorkspace: vi.spyOn(client, 'stopWorkspace'),
    deleteWorkspace: vi.spyOn(client, 'deleteWorkspace'),
    waitForWorkspaceStatus: vi.spyOn(client, 'waitForWorkspaceStatus'),
  };

  return { provider, mocks };
}

// =============================================================================
// Tests
// =============================================================================

describe('CoderProvider', () => {
  let provider: CoderProvider;
  let mocks: ReturnType<typeof createMockedProvider>['mocks'];

  beforeEach(() => {
    const setup = createMockedProvider();
    provider = setup.provider;
    mocks = setup.mocks;
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  // ---------------------------------------------------------------------------
  // Metadata
  // ---------------------------------------------------------------------------

  it('has name "Coder"', () => {
    expect(provider.name).toBe('Coder');
  });

  // ---------------------------------------------------------------------------
  // create()
  // ---------------------------------------------------------------------------

  describe('create()', () => {
    it('resolves template and creates workspace as "me"', async () => {
      mocks.getCurrentUser.mockResolvedValue(mockUser());
      mocks.getTemplateByName.mockResolvedValue({ id: 'tpl-1', name: 'default' });
      mocks.createWorkspace.mockResolvedValue(mockWorkspace({ latest_build: mockBuild({ status: 'starting' }) }));
      mocks.waitForWorkspaceStatus.mockResolvedValue(mockWorkspace());

      const ws = await provider.create({
        name: 'test-ws',
        repository: { owner: 'octocat', repo: 'Hello-World' },
        retentionDays: 7,
      });

      expect(mocks.createWorkspace).toHaveBeenCalledWith(
        expect.objectContaining({
          username: 'me',
          organizationId: 'org-1',
          name: 'test-ws',
          templateId: 'tpl-1',
        }),
      );
      expect(ws.status).toBe('running');
      expect(ws.name).toBe('test-workspace');
    });

    it('uses custom template name from templateParams', async () => {
      mocks.getCurrentUser.mockResolvedValue(mockUser());
      mocks.getTemplateByName.mockResolvedValue({ id: 'tpl-custom', name: 'custom' });
      mocks.createWorkspace.mockResolvedValue(mockWorkspace());
      mocks.waitForWorkspaceStatus.mockResolvedValue(mockWorkspace());

      await provider.create({
        name: 'test-ws',
        repository: { owner: 'org', repo: 'app' },
        retentionDays: 7,
        templateParams: { template: 'custom' },
      });

      expect(mocks.getTemplateByName).toHaveBeenCalledWith('org-1', 'custom');
    });

    it('forwards repository, branch, machineType, and extra templateParams as rich params', async () => {
      mocks.getCurrentUser.mockResolvedValue(mockUser());
      mocks.getTemplateByName.mockResolvedValue({ id: 'tpl-1', name: 'default' });
      mocks.createWorkspace.mockResolvedValue(mockWorkspace());
      mocks.waitForWorkspaceStatus.mockResolvedValue(mockWorkspace());

      await provider.create({
        name: 'test-ws',
        repository: { owner: 'org', repo: 'app', branch: 'develop' },
        retentionDays: 7,
        machineType: 'large',
        templateParams: { template: 'default', claude_ltt: 'some-token', sudocode_port: 3000 },
      });

      const call = mocks.createWorkspace.mock.calls[0][0];
      expect(call.richParameterValues).toEqual(
        expect.arrayContaining([
          { name: 'repository', value: 'org/app' },
          { name: 'branch', value: 'develop' },
          { name: 'machine_type', value: 'large' },
          { name: 'claude_ltt', value: 'some-token' },
          { name: 'sudocode_port', value: '3000' },
        ]),
      );
      // "template" should NOT be forwarded as a rich param
      expect(call.richParameterValues).not.toEqual(
        expect.arrayContaining([expect.objectContaining({ name: 'template' })]),
      );
    });

    it('computes TTL from retentionDays', async () => {
      mocks.getCurrentUser.mockResolvedValue(mockUser());
      mocks.getTemplateByName.mockResolvedValue({ id: 'tpl-1', name: 'default' });
      mocks.createWorkspace.mockResolvedValue(mockWorkspace());
      mocks.waitForWorkspaceStatus.mockResolvedValue(mockWorkspace());

      await provider.create({
        name: 'test-ws',
        repository: { owner: 'org', repo: 'app' },
        retentionDays: 3,
      });

      const call = mocks.createWorkspace.mock.calls[0][0];
      expect(call.ttlMs).toBe(3 * 24 * 60 * 60 * 1000);
    });
  });

  // ---------------------------------------------------------------------------
  // resume()
  // ---------------------------------------------------------------------------

  describe('resume()', () => {
    it('starts stopped workspace and waits for running', async () => {
      mocks.getWorkspace.mockResolvedValue(
        mockWorkspace({ latest_build: mockBuild({ status: 'stopped', transition: 'stop' }) }),
      );
      mocks.startWorkspace.mockResolvedValue(mockBuild());
      mocks.waitForWorkspaceStatus.mockResolvedValue(mockWorkspace());

      const ws = await provider.resume('ws-1');

      expect(mocks.startWorkspace).toHaveBeenCalledWith('ws-1');
      expect(mocks.waitForWorkspaceStatus).toHaveBeenCalledWith(
        expect.objectContaining({ workspaceId: 'ws-1', targetStatus: 'running' }),
      );
      expect(ws.status).toBe('running');
    });

    it('returns as-is if already running', async () => {
      mocks.getWorkspace.mockResolvedValue(mockWorkspace());

      const ws = await provider.resume('ws-1');

      expect(mocks.startWorkspace).not.toHaveBeenCalled();
      expect(ws.status).toBe('running');
    });

    it('lists workspaces and resumes most recent when no workspaceId', async () => {
      mocks.listWorkspaces.mockResolvedValue({
        workspaces: [mockWorkspace({ id: 'ws-recent' })],
        count: 1,
      });
      mocks.getWorkspace.mockResolvedValue(mockWorkspace({ id: 'ws-recent' }));

      const ws = await provider.resume();

      expect(mocks.listWorkspaces).toHaveBeenCalledWith(
        expect.objectContaining({ query: 'owner:me', limit: 1 }),
      );
      expect(mocks.getWorkspace).toHaveBeenCalledWith('ws-recent');
      expect(ws.id).toBe('ws-recent');
    });

    it('throws WorkspaceNotFoundError when no workspaces exist', async () => {
      mocks.listWorkspaces.mockResolvedValue({ workspaces: [], count: 0 });

      await expect(provider.resume()).rejects.toThrow(WorkspaceNotFoundError);
    });

    it('waits through transitional state (starting)', async () => {
      mocks.getWorkspace.mockResolvedValue(
        mockWorkspace({ latest_build: mockBuild({ status: 'starting', transition: 'start' }) }),
      );
      mocks.waitForWorkspaceStatus.mockResolvedValue(mockWorkspace());

      const ws = await provider.resume('ws-1');

      expect(mocks.waitForWorkspaceStatus).toHaveBeenCalledWith(
        expect.objectContaining({ workspaceId: 'ws-1', targetStatus: 'running' }),
      );
      expect(ws.status).toBe('running');
    });

    it('waits for stopping to settle, then starts', async () => {
      // First call: workspace is stopping
      mocks.getWorkspace.mockResolvedValueOnce(
        mockWorkspace({ latest_build: mockBuild({ status: 'stopping', transition: 'stop' }) }),
      );
      // First wait: settling to stopped
      mocks.waitForWorkspaceStatus.mockResolvedValueOnce(
        mockWorkspace({ latest_build: mockBuild({ status: 'stopped', transition: 'stop' }) }),
      );
      // Recursive resume: getWorkspace returns stopped
      mocks.getWorkspace.mockResolvedValueOnce(
        mockWorkspace({ latest_build: mockBuild({ status: 'stopped', transition: 'stop' }) }),
      );
      mocks.startWorkspace.mockResolvedValue(mockBuild());
      // Second wait: starting → running
      mocks.waitForWorkspaceStatus.mockResolvedValueOnce(mockWorkspace());

      const ws = await provider.resume('ws-1');

      expect(mocks.startWorkspace).toHaveBeenCalled();
      expect(ws.status).toBe('running');
    });

    it('throws WorkspaceStateError for failed workspace', async () => {
      mocks.getWorkspace.mockResolvedValue(
        mockWorkspace({ latest_build: mockBuild({ status: 'failed', transition: 'start' }) }),
      );

      await expect(provider.resume('ws-1')).rejects.toThrow(WorkspaceStateError);
    });
  });

  // ---------------------------------------------------------------------------
  // stop()
  // ---------------------------------------------------------------------------

  describe('stop()', () => {
    it('stops workspace and waits for stopped', async () => {
      mocks.stopWorkspace.mockResolvedValue(mockBuild({ transition: 'stop' }));
      mocks.waitForWorkspaceStatus.mockResolvedValue(
        mockWorkspace({ latest_build: mockBuild({ status: 'stopped' }) }),
      );

      await provider.stop('ws-1');

      expect(mocks.stopWorkspace).toHaveBeenCalledWith('ws-1');
      expect(mocks.waitForWorkspaceStatus).toHaveBeenCalledWith(
        expect.objectContaining({ workspaceId: 'ws-1', targetStatus: 'stopped' }),
      );
    });
  });

  // ---------------------------------------------------------------------------
  // delete()
  // ---------------------------------------------------------------------------

  describe('delete()', () => {
    it('fires delete and does not wait', async () => {
      mocks.deleteWorkspace.mockResolvedValue(mockBuild({ transition: 'delete' }));

      await provider.delete('ws-1');

      expect(mocks.deleteWorkspace).toHaveBeenCalledWith('ws-1');
      expect(mocks.waitForWorkspaceStatus).not.toHaveBeenCalled();
    });
  });

  // ---------------------------------------------------------------------------
  // get()
  // ---------------------------------------------------------------------------

  describe('get()', () => {
    it('returns mapped workspace', async () => {
      mocks.getWorkspace.mockResolvedValue(mockWorkspace());

      const ws = await provider.get('ws-1');

      expect(ws.id).toBe('ws-1');
      expect(ws.name).toBe('test-workspace');
      expect(ws.status).toBe('running');
      expect(ws.connection.ssh.command).toBe('ssh coder.test-workspace');
      expect(ws.connection.urls?.dashboard).toBe('https://coder.test/@admin/test-workspace');
    });
  });

  // ---------------------------------------------------------------------------
  // list()
  // ---------------------------------------------------------------------------

  describe('list()', () => {
    it('builds query from filters and maps results', async () => {
      mocks.listWorkspaces.mockResolvedValue({
        workspaces: [mockWorkspace()],
        count: 1,
      });

      const result = await provider.list();

      expect(mocks.listWorkspaces).toHaveBeenCalledWith(
        expect.objectContaining({ query: 'owner:me', limit: 50 }),
      );
      expect(result).toHaveLength(1);
      expect(result[0].name).toBe('test-workspace');
    });

    it('maps Provider status filters to Coder query statuses', async () => {
      mocks.listWorkspaces.mockResolvedValue({ workspaces: [], count: 0 });

      await provider.list({ status: ['running', 'stopped'] });

      expect(mocks.listWorkspaces).toHaveBeenCalledWith(
        expect.objectContaining({ query: 'owner:me status:running,stopped' }),
      );
    });

    it('maps "creating" status to "pending" in query', async () => {
      mocks.listWorkspaces.mockResolvedValue({ workspaces: [], count: 0 });

      await provider.list({ status: ['creating'] });

      expect(mocks.listWorkspaces).toHaveBeenCalledWith(
        expect.objectContaining({ query: 'owner:me status:pending' }),
      );
    });

    it('filters by owner/repo from resource metadata', async () => {
      const ws1 = mockWorkspace({ name: 'ws-match' });
      const ws2 = mockWorkspace({
        name: 'ws-nomatch',
        latest_build: mockBuild({
          resources: [{
            id: 'res-2', name: 'main', type: 'docker_container',
            metadata: [{ key: 'repository', value: 'other/repo', sensitive: false }],
          }],
        }),
      });

      mocks.listWorkspaces.mockResolvedValue({ workspaces: [ws1, ws2], count: 2 });

      const result = await provider.list({ owner: 'octocat' });

      expect(result).toHaveLength(1);
      expect(result[0].name).toBe('ws-match');
    });

    it('respects limit filter', async () => {
      mocks.listWorkspaces.mockResolvedValue({ workspaces: [], count: 0 });

      await provider.list({ limit: 10 });

      expect(mocks.listWorkspaces).toHaveBeenCalledWith(
        expect.objectContaining({ limit: 10 }),
      );
    });
  });

  // ---------------------------------------------------------------------------
  // Lazy Context Resolution
  // ---------------------------------------------------------------------------

  describe('lazy context resolution', () => {
    it('calls getCurrentUser only once across multiple operations', async () => {
      mocks.getCurrentUser.mockResolvedValue(mockUser());
      mocks.getTemplateByName.mockResolvedValue({ id: 'tpl-1', name: 'default' });
      mocks.createWorkspace.mockResolvedValue(mockWorkspace());
      mocks.waitForWorkspaceStatus.mockResolvedValue(mockWorkspace());

      await provider.create({
        name: 'ws-1',
        repository: { owner: 'org', repo: 'app' },
        retentionDays: 7,
      });
      await provider.create({
        name: 'ws-2',
        repository: { owner: 'org', repo: 'app' },
        retentionDays: 7,
      });

      expect(mocks.getCurrentUser).toHaveBeenCalledTimes(1);
    });
  });

  // ---------------------------------------------------------------------------
  // Error Mapping
  // ---------------------------------------------------------------------------

  describe('error mapping', () => {
    it('maps 404 CoderApiError to WorkspaceNotFoundError', async () => {
      mocks.getWorkspace.mockRejectedValue(
        new CoderApiError(404, 'not found', 'GET', '/api/v2/workspaces/x'),
      );

      await expect(provider.get('x')).rejects.toThrow(WorkspaceNotFoundError);
    });

    it('maps 401 CoderApiError to AuthenticationError', async () => {
      mocks.getWorkspace.mockRejectedValue(
        new CoderApiError(401, 'unauthorized', 'GET', '/api/v2/workspaces/x'),
      );

      await expect(provider.get('x')).rejects.toThrow(AuthenticationError);
    });

    it('maps 403 CoderApiError to AuthorizationError', async () => {
      mocks.getWorkspace.mockRejectedValue(
        new CoderApiError(403, 'forbidden', 'GET', '/api/v2/workspaces/x'),
      );

      await expect(provider.get('x')).rejects.toThrow(AuthorizationError);
    });

    it('maps 409 CoderApiError to WorkspaceCreationError', async () => {
      mocks.getCurrentUser.mockResolvedValue(mockUser());
      mocks.getTemplateByName.mockResolvedValue({ id: 'tpl-1', name: 'default' });
      mocks.createWorkspace.mockRejectedValue(
        new CoderApiError(409, 'workspace already exists', 'POST', '/api/v2/workspaces'),
      );

      await expect(
        provider.create({
          name: 'duplicate',
          repository: { owner: 'org', repo: 'app' },
          retentionDays: 7,
        }),
      ).rejects.toThrow(WorkspaceCreationError);
    });

    it('maps unknown CoderApiError to ProviderError', async () => {
      mocks.getWorkspace.mockRejectedValue(
        new CoderApiError(500, 'internal error', 'GET', '/api/v2/workspaces/x'),
      );

      await expect(provider.get('x')).rejects.toThrow(ProviderError);
    });

    it('maps non-CoderApiError to ProviderError', async () => {
      mocks.getWorkspace.mockRejectedValue(new Error('network failure'));

      await expect(provider.get('x')).rejects.toThrow(ProviderError);
    });

    it('does not double-wrap ProviderError', async () => {
      mocks.listWorkspaces.mockResolvedValue({ workspaces: [], count: 0 });

      // resume() throws WorkspaceNotFoundError internally, which should pass through
      try {
        await provider.resume();
        expect.fail('Expected error');
      } catch (err) {
        expect(err).toBeInstanceOf(WorkspaceNotFoundError);
        // Should NOT be wrapped in another ProviderError
        expect((err as any).cause).toBeUndefined();
      }
    });
  });

  // ---------------------------------------------------------------------------
  // Factory integration
  // ---------------------------------------------------------------------------

  describe('factory', () => {
    it('createProvider("coder") returns a CoderProvider', async () => {
      const { createProvider } = await import('../../../../src/provider/factory.js');

      const p = createProvider('coder', {
        url: 'https://coder.test',
        authToken: 'test-token',
      });

      expect(p).toBeInstanceOf(CoderProvider);
      expect(p.name).toBe('Coder');
    });
  });
});
