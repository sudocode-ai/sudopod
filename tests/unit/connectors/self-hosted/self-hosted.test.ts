/**
 * Unit tests for SelfHostedConnector.
 *
 * Tests the connector in isolation using mocked SudopodClient.
 *
 * @see s-xlsw - SelfHostedConnector Implementation specification
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { SelfHostedConnector } from '../../../../src/connectors/self-hosted/index.js';
import { SudopodClient } from '../../../../src/client/index.js';
import { ConnectorError, AuthenticationError } from '../../../../src/core/errors.js';
import type { Workspace } from '../../../../src/types/index.js';
import * as childProcess from 'child_process';

// Mock SudopodClient
vi.mock('../../../../src/client/index.js', () => ({
  SudopodClient: vi.fn().mockImplementation(() => ({
    createWorkspace: vi.fn(),
    getWorkspace: vi.fn(),
    deleteWorkspace: vi.fn(),
    listWorkspaces: vi.fn(),
    startWorkspace: vi.fn(),
    stopWorkspace: vi.fn(),
    health: vi.fn(),
  })),
  SudopodClientError: class SudopodClientError extends Error {
    constructor(
      message: string,
      public code: string,
      public statusCode: number
    ) {
      super(message);
      this.name = 'SudopodClientError';
    }
  },
}));

// Mock child_process
vi.mock('child_process', () => ({
  execSync: vi.fn(),
}));

/**
 * Helper to create a sample workspace for testing.
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

describe('SelfHostedConnector', () => {
  let mockClient: {
    createWorkspace: ReturnType<typeof vi.fn>;
    getWorkspace: ReturnType<typeof vi.fn>;
    deleteWorkspace: ReturnType<typeof vi.fn>;
    listWorkspaces: ReturnType<typeof vi.fn>;
    startWorkspace: ReturnType<typeof vi.fn>;
    stopWorkspace: ReturnType<typeof vi.fn>;
    health: ReturnType<typeof vi.fn>;
  };

  beforeEach(() => {
    vi.clearAllMocks();

    // Get reference to the mock client instance
    mockClient = {
      createWorkspace: vi.fn(),
      getWorkspace: vi.fn(),
      deleteWorkspace: vi.fn(),
      listWorkspaces: vi.fn(),
      startWorkspace: vi.fn(),
      stopWorkspace: vi.fn(),
      health: vi.fn(),
    };

    (SudopodClient as unknown as ReturnType<typeof vi.fn>).mockImplementation(
      () => mockClient
    );
  });

  afterEach(() => {
    // Clean up any env vars set during tests
    delete process.env.TEST_API_KEY;
    delete process.env.TEST_SECRET;
    delete process.env.TEST_URL;
    delete process.env.PREFIX;
    delete process.env.SUFFIX;
  });

  describe('constructor', () => {
    it('creates SudopodClient with correct config', () => {
      new SelfHostedConnector({
        type: 'self-hosted',
        providerUrl: 'https://coder.example.com',
        apiKey: 'test-key',
        basePath: '/api/v1',
        timeout: 30000,
      });

      expect(SudopodClient).toHaveBeenCalledWith({
        providerUrl: 'https://coder.example.com',
        apiKey: 'test-key',
        basePath: '/api/v1',
        timeout: 30000,
      });
    });

    it('uses default timeout of 60000ms', () => {
      new SelfHostedConnector({
        type: 'self-hosted',
        providerUrl: 'https://coder.example.com',
        apiKey: 'test-key',
      });

      expect(SudopodClient).toHaveBeenCalledWith(
        expect.objectContaining({
          timeout: 60000,
        })
      );
    });

    it('expands environment variables in providerUrl', () => {
      process.env.TEST_URL = 'https://coder.example.com';

      new SelfHostedConnector({
        type: 'self-hosted',
        providerUrl: '${TEST_URL}',
        apiKey: 'test-key',
      });

      expect(SudopodClient).toHaveBeenCalledWith(
        expect.objectContaining({
          providerUrl: 'https://coder.example.com',
        })
      );
    });

    it('expands environment variables in apiKey', () => {
      process.env.TEST_API_KEY = 'expanded-key';

      new SelfHostedConnector({
        type: 'self-hosted',
        providerUrl: 'https://coder.example.com',
        apiKey: '${TEST_API_KEY}',
      });

      expect(SudopodClient).toHaveBeenCalledWith(
        expect.objectContaining({
          apiKey: 'expanded-key',
        })
      );
    });

    it('throws on missing environment variable in constructor', () => {
      delete process.env.MISSING_VAR;

      expect(
        () =>
          new SelfHostedConnector({
            type: 'self-hosted',
            providerUrl: '${MISSING_VAR}',
            apiKey: 'test-key',
          })
      ).toThrow('Environment variable MISSING_VAR is not set');
    });

    it('has type property set to self-hosted', () => {
      const connector = new SelfHostedConnector({
        type: 'self-hosted',
        providerUrl: 'https://coder.example.com',
        apiKey: 'test-key',
      });

      expect(connector.type).toBe('self-hosted');
    });
  });

  describe('createWorkspace', () => {
    it('calls client.createWorkspace with full request', async () => {
      mockClient.createWorkspace.mockResolvedValue(createSampleWorkspace());

      const connector = new SelfHostedConnector({
        type: 'self-hosted',
        providerUrl: 'https://coder.example.com',
        apiKey: 'test-key',
        userIdentity: { email: 'user@test.com', username: 'testuser' },
      });

      await connector.createWorkspace({
        repository: 'owner/repo',
        branch: 'main',
        cpuCores: 4,
        memoryGb: 8,
      });

      expect(mockClient.createWorkspace).toHaveBeenCalledWith({
        repository: 'owner/repo',
        branch: 'main',
        cpuCores: 4,
        memoryGb: 8,
        diskSizeGb: undefined,
        idleTimeoutMinutes: undefined,
        maxTtlHours: undefined,
        userIdentity: { email: 'user@test.com', username: 'testuser' },
        githubToken: undefined,
        secrets: undefined,
      });
    });

    it('includes githubToken from config', async () => {
      mockClient.createWorkspace.mockResolvedValue(createSampleWorkspace());

      const connector = new SelfHostedConnector({
        type: 'self-hosted',
        providerUrl: 'https://coder.example.com',
        apiKey: 'test-key',
        githubToken: 'my-github-token',
        userIdentity: { email: 'user@test.com' },
      });

      await connector.createWorkspace({ repository: 'owner/repo' });

      expect(mockClient.createWorkspace).toHaveBeenCalledWith(
        expect.objectContaining({
          githubToken: 'my-github-token',
        })
      );
    });

    it('fetches githubToken from gh CLI when configured', async () => {
      (childProcess.execSync as ReturnType<typeof vi.fn>).mockReturnValue(
        'gh-cli-token\n'
      );
      mockClient.createWorkspace.mockResolvedValue(createSampleWorkspace());

      const connector = new SelfHostedConnector({
        type: 'self-hosted',
        providerUrl: 'https://coder.example.com',
        apiKey: 'test-key',
        githubToken: 'gh-cli',
        userIdentity: { email: 'user@test.com' },
      });

      await connector.createWorkspace({ repository: 'owner/repo' });

      expect(childProcess.execSync).toHaveBeenCalledWith('gh auth token', {
        encoding: 'utf-8',
        stdio: ['pipe', 'pipe', 'pipe'],
      });
      expect(mockClient.createWorkspace).toHaveBeenCalledWith(
        expect.objectContaining({
          githubToken: 'gh-cli-token',
        })
      );
    });

    it('caches GitHub token from gh CLI', async () => {
      (childProcess.execSync as ReturnType<typeof vi.fn>).mockReturnValue(
        'gh-cli-token\n'
      );
      mockClient.createWorkspace.mockResolvedValue(createSampleWorkspace());

      const connector = new SelfHostedConnector({
        type: 'self-hosted',
        providerUrl: 'https://coder.example.com',
        apiKey: 'test-key',
        githubToken: 'gh-cli',
        userIdentity: { email: 'user@test.com' },
      });

      await connector.createWorkspace({ repository: 'owner/repo' });
      await connector.createWorkspace({ repository: 'owner/repo2' });

      // execSync should only be called once due to caching
      expect(childProcess.execSync).toHaveBeenCalledTimes(1);
    });

    it('throws AuthenticationError when gh CLI fails', async () => {
      (childProcess.execSync as ReturnType<typeof vi.fn>).mockImplementation(
        () => {
          throw new Error('gh not logged in');
        }
      );

      const connector = new SelfHostedConnector({
        type: 'self-hosted',
        providerUrl: 'https://coder.example.com',
        apiKey: 'test-key',
        githubToken: 'gh-cli',
        userIdentity: { email: 'user@test.com' },
      });

      await expect(
        connector.createWorkspace({ repository: 'owner/repo' })
      ).rejects.toThrow(AuthenticationError);
    });

    it('throws AuthenticationError when gh CLI returns empty', async () => {
      (childProcess.execSync as ReturnType<typeof vi.fn>).mockReturnValue('');

      const connector = new SelfHostedConnector({
        type: 'self-hosted',
        providerUrl: 'https://coder.example.com',
        apiKey: 'test-key',
        githubToken: 'gh-cli',
        userIdentity: { email: 'user@test.com' },
      });

      await expect(
        connector.createWorkspace({ repository: 'owner/repo' })
      ).rejects.toThrow(AuthenticationError);
    });

    it('includes secrets from config', async () => {
      process.env.TEST_SECRET = 'secret-value';
      mockClient.createWorkspace.mockResolvedValue(createSampleWorkspace());

      const connector = new SelfHostedConnector({
        type: 'self-hosted',
        providerUrl: 'https://coder.example.com',
        apiKey: 'test-key',
        secrets: {
          MY_SECRET: '${TEST_SECRET}',
        },
        userIdentity: { email: 'user@test.com' },
      });

      await connector.createWorkspace({ repository: 'owner/repo' });

      expect(mockClient.createWorkspace).toHaveBeenCalledWith(
        expect.objectContaining({
          secrets: { MY_SECRET: 'secret-value' },
        })
      );
    });

    it('caches resolved secrets', async () => {
      process.env.TEST_SECRET = 'secret-value';
      mockClient.createWorkspace.mockResolvedValue(createSampleWorkspace());

      const connector = new SelfHostedConnector({
        type: 'self-hosted',
        providerUrl: 'https://coder.example.com',
        apiKey: 'test-key',
        secrets: {
          MY_SECRET: '${TEST_SECRET}',
        },
        userIdentity: { email: 'user@test.com' },
      });

      await connector.createWorkspace({ repository: 'owner/repo' });

      // Change env var - should NOT affect cached secrets
      process.env.TEST_SECRET = 'changed-value';

      await connector.createWorkspace({ repository: 'owner/repo2' });

      // Both calls should use the original cached value
      expect(mockClient.createWorkspace).toHaveBeenNthCalledWith(
        2,
        expect.objectContaining({
          secrets: { MY_SECRET: 'secret-value' },
        })
      );
    });

    it('includes userIdentity from config', async () => {
      mockClient.createWorkspace.mockResolvedValue(createSampleWorkspace());

      const connector = new SelfHostedConnector({
        type: 'self-hosted',
        providerUrl: 'https://coder.example.com',
        apiKey: 'test-key',
        userIdentity: {
          email: 'user@company.com',
          username: 'myuser',
          sub: 'oidc-subject-123',
        },
      });

      await connector.createWorkspace({ repository: 'owner/repo' });

      expect(mockClient.createWorkspace).toHaveBeenCalledWith(
        expect.objectContaining({
          userIdentity: {
            email: 'user@company.com',
            username: 'myuser',
            sub: 'oidc-subject-123',
          },
        })
      );
    });

    it('uses default userIdentity when not configured', async () => {
      mockClient.createWorkspace.mockResolvedValue(createSampleWorkspace());

      const connector = new SelfHostedConnector({
        type: 'self-hosted',
        providerUrl: 'https://coder.example.com',
        apiKey: 'test-key',
      });

      await connector.createWorkspace({ repository: 'owner/repo' });

      expect(mockClient.createWorkspace).toHaveBeenCalledWith(
        expect.objectContaining({
          userIdentity: { email: 'anonymous@localhost' },
        })
      );
    });

    it('throws on missing environment variable in secrets', async () => {
      delete process.env.MISSING_VAR;

      const connector = new SelfHostedConnector({
        type: 'self-hosted',
        providerUrl: 'https://coder.example.com',
        apiKey: 'test-key',
        secrets: {
          MY_SECRET: '${MISSING_VAR}',
        },
        userIdentity: { email: 'user@test.com' },
      });

      await expect(
        connector.createWorkspace({ repository: 'owner/repo' })
      ).rejects.toThrow('MISSING_VAR is not set');
    });

    it('returns workspace from client', async () => {
      const mockWorkspace = createSampleWorkspace({ id: 'ws-456' });
      mockClient.createWorkspace.mockResolvedValue(mockWorkspace);

      const connector = new SelfHostedConnector({
        type: 'self-hosted',
        providerUrl: 'https://coder.example.com',
        apiKey: 'test-key',
        userIdentity: { email: 'user@test.com' },
      });

      const result = await connector.createWorkspace({ repository: 'owner/repo' });

      expect(result).toEqual(mockWorkspace);
    });

    it('wraps client errors in ConnectorError', async () => {
      mockClient.createWorkspace.mockRejectedValue(new Error('Network error'));

      const connector = new SelfHostedConnector({
        type: 'self-hosted',
        providerUrl: 'https://coder.example.com',
        apiKey: 'test-key',
        userIdentity: { email: 'user@test.com' },
      });

      await expect(
        connector.createWorkspace({ repository: 'owner/repo' })
      ).rejects.toThrow(ConnectorError);
    });
  });

  describe('getWorkspace', () => {
    it('calls client.getWorkspace', async () => {
      mockClient.getWorkspace.mockResolvedValue(createSampleWorkspace());

      const connector = new SelfHostedConnector({
        type: 'self-hosted',
        providerUrl: 'https://coder.example.com',
        apiKey: 'test-key',
      });

      await connector.getWorkspace('ws-123');

      expect(mockClient.getWorkspace).toHaveBeenCalledWith('ws-123');
    });

    it('returns workspace from client', async () => {
      const mockWorkspace = createSampleWorkspace({ id: 'ws-456' });
      mockClient.getWorkspace.mockResolvedValue(mockWorkspace);

      const connector = new SelfHostedConnector({
        type: 'self-hosted',
        providerUrl: 'https://coder.example.com',
        apiKey: 'test-key',
      });

      const result = await connector.getWorkspace('ws-456');

      expect(result).toEqual(mockWorkspace);
    });

    it('wraps client errors in ConnectorError', async () => {
      mockClient.getWorkspace.mockRejectedValue(new Error('Not found'));

      const connector = new SelfHostedConnector({
        type: 'self-hosted',
        providerUrl: 'https://coder.example.com',
        apiKey: 'test-key',
      });

      await expect(connector.getWorkspace('ws-123')).rejects.toThrow(
        ConnectorError
      );
    });
  });

  describe('deleteWorkspace', () => {
    it('calls client.deleteWorkspace', async () => {
      mockClient.deleteWorkspace.mockResolvedValue(undefined);

      const connector = new SelfHostedConnector({
        type: 'self-hosted',
        providerUrl: 'https://coder.example.com',
        apiKey: 'test-key',
      });

      await connector.deleteWorkspace('ws-123');

      expect(mockClient.deleteWorkspace).toHaveBeenCalledWith('ws-123');
    });

    it('wraps client errors in ConnectorError', async () => {
      mockClient.deleteWorkspace.mockRejectedValue(new Error('Delete failed'));

      const connector = new SelfHostedConnector({
        type: 'self-hosted',
        providerUrl: 'https://coder.example.com',
        apiKey: 'test-key',
      });

      await expect(connector.deleteWorkspace('ws-123')).rejects.toThrow(
        ConnectorError
      );
    });
  });

  describe('listWorkspaces', () => {
    it('calls client.listWorkspaces with filters', async () => {
      mockClient.listWorkspaces.mockResolvedValue([]);

      const connector = new SelfHostedConnector({
        type: 'self-hosted',
        providerUrl: 'https://coder.example.com',
        apiKey: 'test-key',
      });

      await connector.listWorkspaces({ owner: 'testuser', limit: 10 });

      expect(mockClient.listWorkspaces).toHaveBeenCalledWith({
        owner: 'testuser',
        limit: 10,
      });
    });

    it('returns workspaces from client', async () => {
      const mockWorkspaces = [
        createSampleWorkspace({ id: 'ws-1' }),
        createSampleWorkspace({ id: 'ws-2' }),
      ];
      mockClient.listWorkspaces.mockResolvedValue(mockWorkspaces);

      const connector = new SelfHostedConnector({
        type: 'self-hosted',
        providerUrl: 'https://coder.example.com',
        apiKey: 'test-key',
      });

      const result = await connector.listWorkspaces();

      expect(result).toEqual(mockWorkspaces);
    });

    it('wraps client errors in ConnectorError', async () => {
      mockClient.listWorkspaces.mockRejectedValue(new Error('List failed'));

      const connector = new SelfHostedConnector({
        type: 'self-hosted',
        providerUrl: 'https://coder.example.com',
        apiKey: 'test-key',
      });

      await expect(connector.listWorkspaces()).rejects.toThrow(ConnectorError);
    });
  });

  describe('startWorkspace', () => {
    it('calls client.startWorkspace', async () => {
      mockClient.startWorkspace.mockResolvedValue(undefined);

      const connector = new SelfHostedConnector({
        type: 'self-hosted',
        providerUrl: 'https://coder.example.com',
        apiKey: 'test-key',
      });

      await connector.startWorkspace('ws-123');

      expect(mockClient.startWorkspace).toHaveBeenCalledWith('ws-123');
    });

    it('wraps client errors in ConnectorError', async () => {
      mockClient.startWorkspace.mockRejectedValue(new Error('Start failed'));

      const connector = new SelfHostedConnector({
        type: 'self-hosted',
        providerUrl: 'https://coder.example.com',
        apiKey: 'test-key',
      });

      await expect(connector.startWorkspace('ws-123')).rejects.toThrow(
        ConnectorError
      );
    });
  });

  describe('stopWorkspace', () => {
    it('calls client.stopWorkspace', async () => {
      mockClient.stopWorkspace.mockResolvedValue(undefined);

      const connector = new SelfHostedConnector({
        type: 'self-hosted',
        providerUrl: 'https://coder.example.com',
        apiKey: 'test-key',
      });

      await connector.stopWorkspace('ws-123');

      expect(mockClient.stopWorkspace).toHaveBeenCalledWith('ws-123');
    });

    it('wraps client errors in ConnectorError', async () => {
      mockClient.stopWorkspace.mockRejectedValue(new Error('Stop failed'));

      const connector = new SelfHostedConnector({
        type: 'self-hosted',
        providerUrl: 'https://coder.example.com',
        apiKey: 'test-key',
      });

      await expect(connector.stopWorkspace('ws-123')).rejects.toThrow(
        ConnectorError
      );
    });
  });

  describe('validate', () => {
    it('checks provider health', async () => {
      mockClient.health.mockResolvedValue({ ok: true, timestamp: '2026-01-24T12:00:00Z' });

      const connector = new SelfHostedConnector({
        type: 'self-hosted',
        providerUrl: 'https://coder.example.com',
        apiKey: 'test-key',
      });

      await expect(connector.validate()).resolves.toBeUndefined();
      expect(mockClient.health).toHaveBeenCalled();
    });

    it('throws if provider unreachable', async () => {
      mockClient.health.mockRejectedValue(new Error('Connection refused'));

      const connector = new SelfHostedConnector({
        type: 'self-hosted',
        providerUrl: 'https://coder.example.com',
        apiKey: 'test-key',
      });

      await expect(connector.validate()).rejects.toThrow('Cannot reach provider');
    });

    it('checks gh CLI when githubToken is gh-cli', async () => {
      (childProcess.execSync as ReturnType<typeof vi.fn>).mockReturnValue(
        'token\n'
      );
      mockClient.health.mockResolvedValue({ ok: true, timestamp: '2026-01-24T12:00:00Z' });

      const connector = new SelfHostedConnector({
        type: 'self-hosted',
        providerUrl: 'https://coder.example.com',
        apiKey: 'test-key',
        githubToken: 'gh-cli',
      });

      await connector.validate();

      expect(childProcess.execSync).toHaveBeenCalledWith(
        'gh auth token',
        expect.anything()
      );
    });

    it('throws if gh CLI fails during validation', async () => {
      (childProcess.execSync as ReturnType<typeof vi.fn>).mockImplementation(
        () => {
          throw new Error('gh not logged in');
        }
      );
      mockClient.health.mockResolvedValue({ ok: true, timestamp: '2026-01-24T12:00:00Z' });

      const connector = new SelfHostedConnector({
        type: 'self-hosted',
        providerUrl: 'https://coder.example.com',
        apiKey: 'test-key',
        githubToken: 'gh-cli',
      });

      await expect(connector.validate()).rejects.toThrow(
        'Cannot get GitHub token'
      );
    });

    it('warns if userIdentity.email not configured', async () => {
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
      mockClient.health.mockResolvedValue({ ok: true, timestamp: '2026-01-24T12:00:00Z' });

      const connector = new SelfHostedConnector({
        type: 'self-hosted',
        providerUrl: 'https://coder.example.com',
        apiKey: 'test-key',
      });

      await connector.validate();

      expect(warnSpy).toHaveBeenCalledWith(
        expect.stringContaining('No userIdentity.email configured')
      );

      warnSpy.mockRestore();
    });
  });

  describe('environment variable expansion', () => {
    it('expands multiple vars in one value', async () => {
      process.env.PREFIX = 'pre';
      process.env.SUFFIX = 'suf';
      mockClient.createWorkspace.mockResolvedValue(createSampleWorkspace());

      const connector = new SelfHostedConnector({
        type: 'self-hosted',
        providerUrl: 'https://coder.example.com',
        apiKey: 'test-key',
        secrets: {
          COMBINED: '${PREFIX}-middle-${SUFFIX}',
        },
        userIdentity: { email: 'user@test.com' },
      });

      await connector.createWorkspace({ repository: 'owner/repo' });

      expect(mockClient.createWorkspace).toHaveBeenCalledWith(
        expect.objectContaining({
          secrets: { COMBINED: 'pre-middle-suf' },
        })
      );
    });

    it('expands env var in githubToken string', async () => {
      process.env.TEST_SECRET = 'my-token';
      mockClient.createWorkspace.mockResolvedValue(createSampleWorkspace());

      const connector = new SelfHostedConnector({
        type: 'self-hosted',
        providerUrl: 'https://coder.example.com',
        apiKey: 'test-key',
        githubToken: '${TEST_SECRET}',
        userIdentity: { email: 'user@test.com' },
      });

      await connector.createWorkspace({ repository: 'owner/repo' });

      expect(mockClient.createWorkspace).toHaveBeenCalledWith(
        expect.objectContaining({
          githubToken: 'my-token',
        })
      );
    });

    it('handles literal strings without env vars', async () => {
      mockClient.createWorkspace.mockResolvedValue(createSampleWorkspace());

      const connector = new SelfHostedConnector({
        type: 'self-hosted',
        providerUrl: 'https://coder.example.com',
        apiKey: 'literal-key',
        secrets: {
          LITERAL: 'no-expansion-needed',
        },
        userIdentity: { email: 'user@test.com' },
      });

      await connector.createWorkspace({ repository: 'owner/repo' });

      expect(mockClient.createWorkspace).toHaveBeenCalledWith(
        expect.objectContaining({
          secrets: { LITERAL: 'no-expansion-needed' },
        })
      );
    });
  });
});
