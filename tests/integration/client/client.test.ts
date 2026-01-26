/**
 * Integration tests for SudopodClient.
 *
 * Tests the client against a real sudopod server with a mock provider.
 *
 * @see s-3j7d - SudopodClient Implementation specification
 */

import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { SudopodClient, SudopodClientError } from '../../../src/client/index.js';
import { createServer } from '../../../src/server/index.js';
import type { Provider, Workspace, User } from '../../../src/types/index.js';
import { WorkspaceNotFoundError } from '../../../src/types/index.js';
import type { Server } from 'http';

const TEST_API_KEY = 'integration-test-key';
const PORT = 9876;

/**
 * Creates a sample workspace for testing.
 */
function createSampleWorkspace(overrides: Partial<Workspace> = {}): Workspace {
  return {
    id: 'ws-test',
    name: 'test-workspace',
    status: 'pending',
    urls: { workspace: 'https://example.com/ws' },
    createdAt: new Date().toISOString(),
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
    id: 'user-test',
    username: 'testuser',
    email: 'user@example.com',
    status: 'dormant',
    createdAt: new Date().toISOString(),
    ...overrides,
  };
}

describe('SudopodClient Integration', () => {
  let server: Server;
  let client: SudopodClient;
  let mockProvider: Provider & {
    createWorkspace: ReturnType<typeof vi.fn>;
    getWorkspace: ReturnType<typeof vi.fn>;
    deleteWorkspace: ReturnType<typeof vi.fn>;
    listWorkspaces: ReturnType<typeof vi.fn>;
    startWorkspace: ReturnType<typeof vi.fn>;
    stopWorkspace: ReturnType<typeof vi.fn>;
    ensureUser: ReturnType<typeof vi.fn>;
  };

  beforeAll(async () => {
    // Create mock provider
    mockProvider = {
      createWorkspace: vi.fn(),
      getWorkspace: vi.fn(),
      deleteWorkspace: vi.fn(),
      listWorkspaces: vi.fn(),
      startWorkspace: vi.fn(),
      stopWorkspace: vi.fn(),
      ensureUser: vi.fn(),
    };

    // Start test server
    const app = createServer(mockProvider, { apiKeys: [TEST_API_KEY] });
    server = app.listen(PORT);

    // Create client
    client = new SudopodClient({
      providerUrl: `http://localhost:${PORT}`,
      apiKey: TEST_API_KEY,
    });
  });

  afterAll(() => {
    server?.close();
  });

  describe('health', () => {
    it('returns health status from server', async () => {
      const result = await client.health();

      expect(result.ok).toBe(true);
      expect(result.timestamp).toBeDefined();
    });
  });

  describe('createWorkspace', () => {
    it('creates workspace via server', async () => {
      const mockWorkspace = createSampleWorkspace();
      mockProvider.createWorkspace.mockResolvedValue(mockWorkspace);

      const result = await client.createWorkspace({
        repository: 'owner/repo',
        userIdentity: { email: 'user@example.com' },
      });

      expect(result).toEqual(mockWorkspace);
      expect(mockProvider.createWorkspace).toHaveBeenCalledWith({
        repository: 'owner/repo',
        userIdentity: { email: 'user@example.com' },
      });
    });

    it('passes all fields to server', async () => {
      const mockWorkspace = createSampleWorkspace();
      mockProvider.createWorkspace.mockResolvedValue(mockWorkspace);

      await client.createWorkspace({
        repository: 'owner/repo',
        branch: 'feature-branch',
        userIdentity: { email: 'user@example.com', username: 'testuser' },
        cpuCores: 4,
        memoryGb: 8,
        githubToken: 'ghp_xxx',
        secrets: { MY_SECRET: 'value' },
      });

      expect(mockProvider.createWorkspace).toHaveBeenCalledWith({
        repository: 'owner/repo',
        branch: 'feature-branch',
        userIdentity: { email: 'user@example.com', username: 'testuser' },
        cpuCores: 4,
        memoryGb: 8,
        githubToken: 'ghp_xxx',
        secrets: { MY_SECRET: 'value' },
      });
    });

    it('throws SudopodClientError on validation failure', async () => {
      // Server validates request, so this should fail
      await expect(
        client.createWorkspace({
          repository: 'invalid', // Not in owner/repo format
          userIdentity: { email: 'user@example.com' },
        })
      ).rejects.toThrow(SudopodClientError);
    });
  });

  describe('getWorkspace', () => {
    it('gets workspace by ID via server', async () => {
      const mockWorkspace = createSampleWorkspace({ id: 'ws-get-test', status: 'running' });
      mockProvider.getWorkspace.mockResolvedValue(mockWorkspace);

      const result = await client.getWorkspace('ws-get-test');

      expect(result).toEqual(mockWorkspace);
      expect(mockProvider.getWorkspace).toHaveBeenCalledWith('ws-get-test');
    });

    it('throws SudopodClientError on 404', async () => {
      mockProvider.getWorkspace.mockRejectedValue(new WorkspaceNotFoundError('ws-notfound'));

      const error = await client.getWorkspace('ws-notfound').catch((e) => e);

      expect(error).toBeInstanceOf(SudopodClientError);
      expect(error.statusCode).toBe(404);
      expect(error.isNotFound()).toBe(true);
    });
  });

  describe('deleteWorkspace', () => {
    it('deletes workspace via server', async () => {
      mockProvider.deleteWorkspace.mockResolvedValue(undefined);

      await expect(client.deleteWorkspace('ws-delete-test')).resolves.toBeUndefined();

      expect(mockProvider.deleteWorkspace).toHaveBeenCalledWith('ws-delete-test');
    });

    it('throws SudopodClientError on 404', async () => {
      mockProvider.deleteWorkspace.mockRejectedValue(new WorkspaceNotFoundError('ws-notfound'));

      await expect(client.deleteWorkspace('ws-notfound')).rejects.toThrow(SudopodClientError);
    });
  });

  describe('listWorkspaces', () => {
    it('lists workspaces via server', async () => {
      const mockWorkspaces = [
        createSampleWorkspace({ id: 'ws-1', name: 'workspace-1' }),
        createSampleWorkspace({ id: 'ws-2', name: 'workspace-2' }),
      ];
      mockProvider.listWorkspaces.mockResolvedValue(mockWorkspaces);

      const result = await client.listWorkspaces();

      expect(result).toEqual(mockWorkspaces);
    });

    it('passes filters to server', async () => {
      mockProvider.listWorkspaces.mockResolvedValue([]);

      await client.listWorkspaces({
        owner: 'testuser',
        status: 'running',
        limit: 10,
        offset: 5,
      });

      expect(mockProvider.listWorkspaces).toHaveBeenCalledWith({
        owner: 'testuser',
        status: 'running',
        limit: 10,
        offset: 5,
      });
    });

    it('returns empty array when no workspaces', async () => {
      mockProvider.listWorkspaces.mockResolvedValue([]);

      const result = await client.listWorkspaces();

      expect(result).toEqual([]);
    });
  });

  describe('startWorkspace', () => {
    it('starts workspace via server', async () => {
      mockProvider.startWorkspace.mockResolvedValue(undefined);

      await expect(client.startWorkspace('ws-start-test')).resolves.toBeUndefined();

      expect(mockProvider.startWorkspace).toHaveBeenCalledWith('ws-start-test');
    });
  });

  describe('stopWorkspace', () => {
    it('stops workspace via server', async () => {
      mockProvider.stopWorkspace.mockResolvedValue(undefined);

      await expect(client.stopWorkspace('ws-stop-test')).resolves.toBeUndefined();

      expect(mockProvider.stopWorkspace).toHaveBeenCalledWith('ws-stop-test');
    });
  });

  describe('ensureUser', () => {
    it('ensures user via server', async () => {
      const mockUser = createSampleUser();
      mockProvider.ensureUser.mockResolvedValue(mockUser);

      const result = await client.ensureUser({
        email: 'user@example.com',
        loginType: 'oidc',
      });

      expect(result).toEqual(mockUser);
      expect(mockProvider.ensureUser).toHaveBeenCalledWith({
        email: 'user@example.com',
        loginType: 'oidc',
      });
    });

    it('passes optional fields to server', async () => {
      const mockUser = createSampleUser();
      mockProvider.ensureUser.mockResolvedValue(mockUser);

      await client.ensureUser({
        email: 'user@example.com',
        username: 'customuser',
        loginType: 'oidc',
        organizationIds: ['org-1', 'org-2'],
      });

      expect(mockProvider.ensureUser).toHaveBeenCalledWith({
        email: 'user@example.com',
        username: 'customuser',
        loginType: 'oidc',
        organizationIds: ['org-1', 'org-2'],
      });
    });
  });

  describe('authentication', () => {
    it('requests with invalid API key are rejected', async () => {
      const badClient = new SudopodClient({
        providerUrl: `http://localhost:${PORT}`,
        apiKey: 'wrong-key',
      });

      // Use listWorkspaces since health endpoint bypasses auth
      const error = await badClient.listWorkspaces().catch((e) => e);

      expect(error).toBeInstanceOf(SudopodClientError);
      expect(error.statusCode).toBe(401);
    });

    it('health endpoint works without auth', async () => {
      const noAuthClient = new SudopodClient({
        providerUrl: `http://localhost:${PORT}`,
        apiKey: 'any-key-works-for-health',
      });

      // Health endpoint bypasses auth by design
      const result = await noAuthClient.health();
      expect(result.ok).toBe(true);
    });
  });

  describe('basePath configuration', () => {
    let basePathServer: Server;
    let basePathClient: SudopodClient;
    const BASE_PATH_PORT = 9877;

    beforeAll(() => {
      const app = createServer(mockProvider, {
        apiKeys: [TEST_API_KEY],
        basePath: '/api/v1',
      });
      basePathServer = app.listen(BASE_PATH_PORT);

      basePathClient = new SudopodClient({
        providerUrl: `http://localhost:${BASE_PATH_PORT}`,
        apiKey: TEST_API_KEY,
        basePath: '/api/v1',
      });
    });

    afterAll(() => {
      basePathServer?.close();
    });

    it('works with basePath configuration', async () => {
      const result = await basePathClient.health();

      expect(result.ok).toBe(true);
    });

    it('lists workspaces at basePath', async () => {
      mockProvider.listWorkspaces.mockResolvedValue([]);

      const result = await basePathClient.listWorkspaces();

      expect(result).toEqual([]);
    });
  });
});
