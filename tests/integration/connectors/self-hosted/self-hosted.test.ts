/**
 * Integration tests for SelfHostedConnector.
 *
 * Tests the connector against a real sudopod server with a mock provider.
 *
 * @see s-xlsw - SelfHostedConnector Implementation specification
 */

import { describe, it, expect, beforeAll, afterAll, vi, afterEach } from 'vitest';
import { SelfHostedConnector } from '../../../../src/connectors/self-hosted/index.js';
import { createServer } from '../../../../src/server/index.js';
import { ConnectorError } from '../../../../src/core/errors.js';
import type { Provider, Workspace, User } from '../../../../src/types/index.js';
import { WorkspaceNotFoundError } from '../../../../src/types/index.js';
import type { Server } from 'http';

const TEST_API_KEY = 'integration-test-key';
const PORT = 9878;

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

describe('SelfHostedConnector Integration', () => {
  let server: Server;
  let connector: SelfHostedConnector;
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

    // Create connector
    connector = new SelfHostedConnector({
      type: 'self-hosted',
      providerUrl: `http://localhost:${PORT}`,
      apiKey: TEST_API_KEY,
      userIdentity: { email: 'test@example.com', username: 'testuser' },
    });
  });

  afterAll(() => {
    server?.close();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('validate', () => {
    it('validates connection to provider', async () => {
      await expect(connector.validate()).resolves.toBeUndefined();
    });

    it('fails validation with wrong URL', async () => {
      const badConnector = new SelfHostedConnector({
        type: 'self-hosted',
        providerUrl: 'http://localhost:9999', // Non-existent server
        apiKey: TEST_API_KEY,
        userIdentity: { email: 'test@example.com' },
      });

      await expect(badConnector.validate()).rejects.toThrow('Cannot reach provider');
    });
  });

  describe('createWorkspace', () => {
    it('creates workspace via server with injected userIdentity', async () => {
      const mockWorkspace = createSampleWorkspace({ owner: 'test@example.com' });
      mockProvider.createWorkspace.mockResolvedValue(mockWorkspace);

      const result = await connector.createWorkspace({
        repository: 'owner/repo',
        branch: 'main',
      });

      expect(result).toEqual(mockWorkspace);
      expect(mockProvider.createWorkspace).toHaveBeenCalledWith(
        expect.objectContaining({
          repository: 'owner/repo',
          branch: 'main',
          userIdentity: { email: 'test@example.com', username: 'testuser' },
        })
      );
    });

    it('passes resource options to provider', async () => {
      const mockWorkspace = createSampleWorkspace();
      mockProvider.createWorkspace.mockResolvedValue(mockWorkspace);

      await connector.createWorkspace({
        repository: 'owner/repo',
        cpuCores: 4,
        memoryGb: 8,
        diskSizeGb: 50,
        idleTimeoutMinutes: 30,
        maxTtlHours: 24,
      });

      expect(mockProvider.createWorkspace).toHaveBeenCalledWith(
        expect.objectContaining({
          cpuCores: 4,
          memoryGb: 8,
          diskSizeGb: 50,
          idleTimeoutMinutes: 30,
          maxTtlHours: 24,
        })
      );
    });
  });

  describe('getWorkspace', () => {
    it('gets workspace by ID', async () => {
      const mockWorkspace = createSampleWorkspace({ id: 'ws-get-test', status: 'running' });
      mockProvider.getWorkspace.mockResolvedValue(mockWorkspace);

      const result = await connector.getWorkspace('ws-get-test');

      expect(result).toEqual(mockWorkspace);
      expect(mockProvider.getWorkspace).toHaveBeenCalledWith('ws-get-test');
    });

    it('throws ConnectorError on 404', async () => {
      mockProvider.getWorkspace.mockRejectedValue(new WorkspaceNotFoundError('ws-notfound'));

      await expect(connector.getWorkspace('ws-notfound')).rejects.toThrow(ConnectorError);
    });
  });

  describe('deleteWorkspace', () => {
    it('deletes workspace', async () => {
      mockProvider.deleteWorkspace.mockResolvedValue(undefined);

      await expect(connector.deleteWorkspace('ws-delete-test')).resolves.toBeUndefined();

      expect(mockProvider.deleteWorkspace).toHaveBeenCalledWith('ws-delete-test');
    });
  });

  describe('listWorkspaces', () => {
    it('lists workspaces', async () => {
      const mockWorkspaces = [
        createSampleWorkspace({ id: 'ws-1', name: 'workspace-1' }),
        createSampleWorkspace({ id: 'ws-2', name: 'workspace-2' }),
      ];
      mockProvider.listWorkspaces.mockResolvedValue(mockWorkspaces);

      const result = await connector.listWorkspaces();

      expect(result).toEqual(mockWorkspaces);
    });

    it('passes filters to server', async () => {
      mockProvider.listWorkspaces.mockResolvedValue([]);

      await connector.listWorkspaces({
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
  });

  describe('startWorkspace', () => {
    it('starts workspace', async () => {
      mockProvider.startWorkspace.mockResolvedValue(undefined);

      await expect(connector.startWorkspace('ws-start-test')).resolves.toBeUndefined();

      expect(mockProvider.startWorkspace).toHaveBeenCalledWith('ws-start-test');
    });
  });

  describe('stopWorkspace', () => {
    it('stops workspace', async () => {
      mockProvider.stopWorkspace.mockResolvedValue(undefined);

      await expect(connector.stopWorkspace('ws-stop-test')).resolves.toBeUndefined();

      expect(mockProvider.stopWorkspace).toHaveBeenCalledWith('ws-stop-test');
    });
  });

  describe('authentication', () => {
    it('requests with invalid API key are rejected', async () => {
      const badConnector = new SelfHostedConnector({
        type: 'self-hosted',
        providerUrl: `http://localhost:${PORT}`,
        apiKey: 'wrong-key',
        userIdentity: { email: 'test@example.com' },
      });

      await expect(badConnector.listWorkspaces()).rejects.toThrow(ConnectorError);
    });
  });

  describe('secrets injection', () => {
    let connectorWithSecrets: SelfHostedConnector;

    beforeAll(() => {
      process.env.TEST_SECRET_VALUE = 'my-secret-value';
      process.env.ANOTHER_SECRET = 'another-value';

      connectorWithSecrets = new SelfHostedConnector({
        type: 'self-hosted',
        providerUrl: `http://localhost:${PORT}`,
        apiKey: TEST_API_KEY,
        userIdentity: { email: 'test@example.com' },
        secrets: {
          API_KEY: '${TEST_SECRET_VALUE}',
          OTHER_KEY: '${ANOTHER_SECRET}',
        },
      });
    });

    afterAll(() => {
      delete process.env.TEST_SECRET_VALUE;
      delete process.env.ANOTHER_SECRET;
    });

    it('injects expanded secrets into createWorkspace', async () => {
      const mockWorkspace = createSampleWorkspace();
      mockProvider.createWorkspace.mockResolvedValue(mockWorkspace);

      await connectorWithSecrets.createWorkspace({
        repository: 'owner/repo',
      });

      expect(mockProvider.createWorkspace).toHaveBeenCalledWith(
        expect.objectContaining({
          secrets: {
            API_KEY: 'my-secret-value',
            OTHER_KEY: 'another-value',
          },
        })
      );
    });
  });

  describe('explicit github token', () => {
    let connectorWithToken: SelfHostedConnector;

    beforeAll(() => {
      process.env.TEST_GITHUB_TOKEN = 'ghp_test123';

      connectorWithToken = new SelfHostedConnector({
        type: 'self-hosted',
        providerUrl: `http://localhost:${PORT}`,
        apiKey: TEST_API_KEY,
        userIdentity: { email: 'test@example.com' },
        githubToken: '${TEST_GITHUB_TOKEN}',
      });
    });

    afterAll(() => {
      delete process.env.TEST_GITHUB_TOKEN;
    });

    it('injects github token into createWorkspace', async () => {
      const mockWorkspace = createSampleWorkspace();
      mockProvider.createWorkspace.mockResolvedValue(mockWorkspace);

      await connectorWithToken.createWorkspace({
        repository: 'owner/repo',
      });

      expect(mockProvider.createWorkspace).toHaveBeenCalledWith(
        expect.objectContaining({
          githubToken: 'ghp_test123',
        })
      );
    });
  });

  describe('basePath configuration', () => {
    let basePathServer: Server;
    let basePathConnector: SelfHostedConnector;
    const BASE_PATH_PORT = 9879;

    beforeAll(() => {
      const app = createServer(mockProvider, {
        apiKeys: [TEST_API_KEY],
        basePath: '/api/v1',
      });
      basePathServer = app.listen(BASE_PATH_PORT);

      basePathConnector = new SelfHostedConnector({
        type: 'self-hosted',
        providerUrl: `http://localhost:${BASE_PATH_PORT}`,
        apiKey: TEST_API_KEY,
        basePath: '/api/v1',
        userIdentity: { email: 'test@example.com' },
      });
    });

    afterAll(() => {
      basePathServer?.close();
    });

    it('works with basePath configuration', async () => {
      await expect(basePathConnector.validate()).resolves.toBeUndefined();
    });

    it('lists workspaces at basePath', async () => {
      mockProvider.listWorkspaces.mockResolvedValue([]);

      const result = await basePathConnector.listWorkspaces();

      expect(result).toEqual([]);
    });
  });

  describe('environment variable expansion in config', () => {
    let envConnector: SelfHostedConnector;
    const ENV_PORT = 9880;
    let envServer: Server;

    beforeAll(() => {
      process.env.TEST_PROVIDER_URL = `http://localhost:${ENV_PORT}`;
      process.env.TEST_API_KEY_ENV = 'env-api-key';

      const app = createServer(mockProvider, {
        apiKeys: ['env-api-key'],
      });
      envServer = app.listen(ENV_PORT);

      envConnector = new SelfHostedConnector({
        type: 'self-hosted',
        providerUrl: '${TEST_PROVIDER_URL}',
        apiKey: '${TEST_API_KEY_ENV}',
        userIdentity: { email: 'test@example.com' },
      });
    });

    afterAll(() => {
      delete process.env.TEST_PROVIDER_URL;
      delete process.env.TEST_API_KEY_ENV;
      envServer?.close();
    });

    it('expands env vars in providerUrl and apiKey', async () => {
      await expect(envConnector.validate()).resolves.toBeUndefined();
    });

    it('can list workspaces with expanded config', async () => {
      mockProvider.listWorkspaces.mockResolvedValue([]);

      const result = await envConnector.listWorkspaces();

      expect(result).toEqual([]);
    });
  });
});
