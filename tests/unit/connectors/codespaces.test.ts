/**
 * Unit tests for Codespaces connector
 * Tests the Connector interface implementation with mocked primitives
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { CodespacesConnector } from '../../../src/connectors/codespaces.js';
import type { CodespacesConfig, DeployOptions, Deployment, DeploymentStatus } from '../../../src/types.js';
import { ConnectorError, AuthenticationError, DeploymentFailedError } from '../../../src/core/errors.js';
import {
  minimalCodespacesOptions,
  completeCodespacesOptions,
  devModeOptions,
} from '../../fixtures/deploy-options.js';

// Mock all the utility modules
vi.mock('../../../src/utils/codespaces/management.js', () => ({
  checkGhCliInstalled: vi.fn(),
  checkGhAuthenticated: vi.fn(),
  createCodespace: vi.fn(),
  waitForCodespaceReady: vi.fn(),
  deleteCodespace: vi.fn(),
  listCodespaces: vi.fn(),
  getCodespaceInfo: vi.fn(),
}));

vi.mock('../../../src/utils/codespaces/ports.js', () => ({
  waitForPortListening: vi.fn(),
  forwardPort: vi.fn(),
  getCodespacePortUrl: vi.fn(),
}));

vi.mock('../../../src/utils/codespaces/installation.js', () => ({
  installClaudeCode: vi.fn(),
  installSudocodeGlobally: vi.fn(),
  installSudocodeFromLocal: vi.fn(),
  initializeSudocodeProject: vi.fn(),
}));

vi.mock('../../../src/utils/codespaces/server.js', () => ({
  startSudocodeServer: vi.fn(),
}));

vi.mock('../../../src/utils/codespaces/keepalive.js', () => ({
  startIdleTimeoutDaemon: vi.fn(),
}));

describe('CodespacesConnector', () => {
  let connector: CodespacesConnector;
  const config: CodespacesConfig = { type: 'codespaces' };

  beforeEach(() => {
    connector = new CodespacesConnector(config);
    vi.clearAllMocks();
  });

  describe('constructor', () => {
    it('should create connector with correct type', () => {
      expect(connector.type).toBe('codespaces');
    });
  });

  describe('mapStatus', () => {
    it('should map Available to running', () => {
      const mapStatus = (connector as any).mapStatus.bind(connector);
      expect(mapStatus('Available')).toBe('running');
    });

    it('should map Starting to starting', () => {
      const mapStatus = (connector as any).mapStatus.bind(connector);
      expect(mapStatus('Starting')).toBe('starting');
    });

    it('should map Shutdown to stopped', () => {
      const mapStatus = (connector as any).mapStatus.bind(connector);
      expect(mapStatus('Shutdown')).toBe('stopped');
    });

    it('should map Unavailable to stopped', () => {
      const mapStatus = (connector as any).mapStatus.bind(connector);
      expect(mapStatus('Unavailable')).toBe('stopped');
    });

    it('should map Pending to provisioning', () => {
      const mapStatus = (connector as any).mapStatus.bind(connector);
      expect(mapStatus('Pending')).toBe('provisioning');
    });

    it('should map unknown status to failed', () => {
      const mapStatus = (connector as any).mapStatus.bind(connector);
      expect(mapStatus('UnknownStatus')).toBe('failed');
    });
  });

  describe('mapToDeployment', () => {
    it('should map codespace data to Deployment with git structure', () => {
      const mapToDeployment = (connector as any).mapToDeployment.bind(connector);
      
      const codespaceData = {
        name: 'test-codespace-abc123',
        displayName: 'My Test Codespace',
        repository: 'anthropics/sudocode',
        state: 'Available',
        branch: 'main',
        createdAt: '2025-01-08T00:00:00Z',
        url: 'https://github.com/codespaces/test',
        machine: 'basicLinux32gb',
      };
      
      const deployment = mapToDeployment(codespaceData);
      
      // Verify git structure
      expect(deployment.git).toEqual({
        owner: 'anthropics',
        repo: 'sudocode',
        branch: 'main',
      });
      
      // Verify other fields
      expect(deployment.id).toBe('test-codespace-abc123');
      expect(deployment.name).toBe('My Test Codespace');
      expect(deployment.provider).toBe('codespaces');
      expect(deployment.status).toBe('running');
      expect(deployment.keepAliveHours).toBe(72);
      expect(deployment.idleTimeout).toBeUndefined();
      expect(deployment.urls.workspace).toBe('https://github.com/codespaces/test');
      expect(deployment.urls.ssh).toBe('gh codespace ssh --codespace test-codespace-abc123');
    });

    it('should handle repository string without branch', () => {
      const mapToDeployment = (connector as any).mapToDeployment.bind(connector);
      
      const codespaceData = {
        name: 'test-codespace',
        repository: 'myorg/my-repo',
        state: 'Available',
        createdAt: '2025-01-08T00:00:00Z',
        url: 'https://github.com/codespaces/test',
        machine: 'basicLinux32gb',
      };
      
      const deployment = mapToDeployment(codespaceData);
      
      expect(deployment.git).toEqual({
        owner: 'myorg',
        repo: 'my-repo',
        branch: undefined,
      });
    });

    it('should handle missing optional fields with defaults', () => {
      const mapToDeployment = (connector as any).mapToDeployment.bind(connector);
      
      const codespaceData = {
        name: 'test-codespace',
        repository: 'owner/repo',
        state: 'Available',
      };
      
      const deployment = mapToDeployment(codespaceData);
      
      expect(deployment.name).toBe('test-codespace');
      expect(deployment.urls.workspace).toBe('https://test-codespace.github.dev');
      expect(deployment.metadata.codespaces?.machine).toBe('basicLinux32gb');
      expect(deployment.metadata.codespaces?.retentionPeriod).toBe(14);
    });
  });

  describe('stop', () => {
    it('should call deleteCodespace and succeed', async () => {
      const { deleteCodespace } = await import('../../../src/utils/codespaces/management.js');
      vi.mocked(deleteCodespace).mockResolvedValueOnce();

      await connector.stop('test-codespace');

      expect(deleteCodespace).toHaveBeenCalledWith('test-codespace');
    });

    it('should throw ConnectorError on failure', async () => {
      const { deleteCodespace } = await import('../../../src/utils/codespaces/management.js');
      vi.mocked(deleteCodespace).mockRejectedValue(new Error('Delete failed'));

      try {
        await connector.stop('test-codespace');
        expect.fail('Should have thrown ConnectorError');
      } catch (error: any) {
        expect(error).toBeInstanceOf(ConnectorError);
        expect(error.message).toContain('Delete failed');
      }
      
      // Clean up
      vi.mocked(deleteCodespace).mockReset();
    });
  });

  describe('getStatus', () => {
    it('should return running status for Available codespace', async () => {
      const { getCodespaceInfo } = await import('../../../src/utils/codespaces/management.js');
      vi.mocked(getCodespaceInfo).mockResolvedValueOnce({
        name: 'test-codespace',
        repository: 'owner/repo',
        state: 'Available',
        createdAt: '2025-01-08T00:00:00Z',
        url: 'https://test.github.dev',
        machine: 'basicLinux32gb',
      });

      const status = await connector.getStatus('test-codespace');

      expect(status).toBe('running');
      expect(getCodespaceInfo).toHaveBeenCalledWith('test-codespace');
    });

    it('should return starting status for Starting codespace', async () => {
      const { getCodespaceInfo } = await import('../../../src/utils/codespaces/management.js');
      vi.mocked(getCodespaceInfo).mockResolvedValueOnce({
        name: 'test-codespace',
        repository: 'owner/repo',
        state: 'Starting',
        createdAt: '2025-01-08T00:00:00Z',
        url: 'https://test.github.dev',
        machine: 'basicLinux32gb',
      });

      const status = await connector.getStatus('test-codespace');

      expect(status).toBe('starting');
    });

    it('should throw ConnectorError on failure', async () => {
      const { getCodespaceInfo } = await import('../../../src/utils/codespaces/management.js');
      vi.mocked(getCodespaceInfo).mockRejectedValueOnce(new Error('Not found'));

      await expect(connector.getStatus('test-codespace')).rejects.toThrow(ConnectorError);
    });
  });

  describe('list', () => {
    const mockCodespaces = [
      {
        name: 'codespace-1',
        repository: 'anthropics/sudocode',
        state: 'Available',
        branch: 'main',
        createdAt: '2025-01-08T00:00:00Z',
        url: 'https://codespace-1.github.dev',
        machine: 'basicLinux32gb',
      },
      {
        name: 'codespace-2',
        repository: 'myorg/my-repo',
        state: 'Shutdown',
        branch: 'develop',
        createdAt: '2025-01-09T00:00:00Z',
        url: 'https://codespace-2.github.dev',
        machine: 'largePremiumLinux',
      },
    ];

    it('should return all codespaces without filters', async () => {
      const { listCodespaces } = await import('../../../src/utils/codespaces/management.js');
      vi.mocked(listCodespaces).mockResolvedValueOnce(mockCodespaces);

      const deployments = await connector.list();

      expect(deployments).toHaveLength(2);
      expect(deployments[0].git.owner).toBe('anthropics');
      expect(deployments[0].git.repo).toBe('sudocode');
      expect(deployments[1].git.owner).toBe('myorg');
      expect(deployments[1].git.repo).toBe('my-repo');
    });

    it('should filter by status', async () => {
      const { listCodespaces } = await import('../../../src/utils/codespaces/management.js');
      vi.mocked(listCodespaces).mockResolvedValueOnce(mockCodespaces);

      const deployments = await connector.list({ status: ['running'] });

      expect(deployments).toHaveLength(1);
      expect(deployments[0].name).toBe('codespace-1');
      expect(deployments[0].status).toBe('running');
    });

    it('should filter by owner', async () => {
      const { listCodespaces } = await import('../../../src/utils/codespaces/management.js');
      vi.mocked(listCodespaces).mockResolvedValueOnce(mockCodespaces);

      const deployments = await connector.list({ owner: 'anthropics' });

      expect(deployments).toHaveLength(1);
      expect(deployments[0].git.owner).toBe('anthropics');
    });

    it('should filter by repo', async () => {
      const { listCodespaces } = await import('../../../src/utils/codespaces/management.js');
      vi.mocked(listCodespaces).mockResolvedValueOnce(mockCodespaces);

      const deployments = await connector.list({ repo: 'sudocode' });

      expect(deployments).toHaveLength(1);
      expect(deployments[0].git.repo).toBe('sudocode');
    });

    it('should filter by createdAfter', async () => {
      const { listCodespaces } = await import('../../../src/utils/codespaces/management.js');
      vi.mocked(listCodespaces).mockResolvedValueOnce(mockCodespaces);

      const deployments = await connector.list({ createdAfter: '2025-01-08T12:00:00Z' });

      expect(deployments).toHaveLength(1);
      expect(deployments[0].name).toBe('codespace-2');
    });

    it('should filter by createdBefore', async () => {
      const { listCodespaces } = await import('../../../src/utils/codespaces/management.js');
      vi.mocked(listCodespaces).mockResolvedValueOnce(mockCodespaces);

      const deployments = await connector.list({ createdBefore: '2025-01-08T12:00:00Z' });

      expect(deployments).toHaveLength(1);
      expect(deployments[0].name).toBe('codespace-1');
    });

    it('should combine multiple filters', async () => {
      const { listCodespaces } = await import('../../../src/utils/codespaces/management.js');
      vi.mocked(listCodespaces).mockResolvedValueOnce(mockCodespaces);

      const deployments = await connector.list({
        status: ['stopped'],
        owner: 'myorg',
      });

      expect(deployments).toHaveLength(1);
      expect(deployments[0].name).toBe('codespace-2');
      expect(deployments[0].status).toBe('stopped');
      expect(deployments[0].git.owner).toBe('myorg');
    });

    it('should throw ConnectorError on failure', async () => {
      const { listCodespaces } = await import('../../../src/utils/codespaces/management.js');
      vi.mocked(listCodespaces).mockRejectedValueOnce(new Error('API error'));

      await expect(connector.list()).rejects.toThrow(ConnectorError);
    });
  });

  describe('getUrls', () => {
    it('should return URLs for a codespace', async () => {
      const { getCodespaceInfo } = await import('../../../src/utils/codespaces/management.js');
      vi.mocked(getCodespaceInfo).mockResolvedValueOnce({
        name: 'test-codespace',
        repository: 'owner/repo',
        state: 'Available',
        createdAt: '2025-01-08T00:00:00Z',
        url: 'https://test.github.dev',
        machine: 'basicLinux32gb',
      });
      
      const { getCodespacePortUrl } = await import('../../../src/utils/codespaces/ports.js');
      vi.mocked(getCodespacePortUrl).mockResolvedValueOnce('https://test-codespace-3000.app.github.dev');

      const urls = await connector.getUrls('test-codespace', 3000);

      expect(urls.workspace).toBe('https://test-codespace.github.dev');
      expect(urls.sudocode).toBe('https://test-codespace-3000.app.github.dev');
      expect(urls.ssh).toBe('gh codespace ssh --codespace test-codespace');
    });

    it('should use default port if not specified', async () => {
      const { getCodespaceInfo } = await import('../../../src/utils/codespaces/management.js');
      vi.mocked(getCodespaceInfo).mockResolvedValueOnce({
        name: 'test-codespace',
        repository: 'owner/repo',
        state: 'Available',
        createdAt: '2025-01-08T00:00:00Z',
        url: 'https://test.github.dev',
        machine: 'basicLinux32gb',
      });
      
      const { getCodespacePortUrl } = await import('../../../src/utils/codespaces/ports.js');
      vi.mocked(getCodespacePortUrl).mockResolvedValueOnce('https://test-codespace-3000.app.github.dev');

      const urls = await connector.getUrls('test-codespace');

      expect(getCodespacePortUrl).toHaveBeenCalledWith('test-codespace', 3000);
    });
  });

  describe('checkPrerequisites', () => {
    it('should succeed when gh CLI is installed and authenticated', async () => {
      const { checkGhCliInstalled, checkGhAuthenticated } = await import('../../../src/utils/codespaces/management.js');
      vi.mocked(checkGhCliInstalled).mockResolvedValue(undefined);
      vi.mocked(checkGhAuthenticated).mockResolvedValue(undefined);

      const checkPrerequisites = (connector as any).checkPrerequisites.bind(connector);
      await expect(checkPrerequisites()).resolves.toBeUndefined();
      
      // Clean up
      vi.mocked(checkGhCliInstalled).mockReset();
      vi.mocked(checkGhAuthenticated).mockReset();
    });

    it('should throw AuthenticationError when gh CLI not installed', async () => {
      const { checkGhCliInstalled } = await import('../../../src/utils/codespaces/management.js');
      vi.mocked(checkGhCliInstalled).mockRejectedValue(new Error('Not found'));

      const checkPrerequisites = (connector as any).checkPrerequisites.bind(connector);
      
      try {
        await checkPrerequisites();
        expect.fail('Should have thrown AuthenticationError');
      } catch (error: any) {
        expect(error).toBeInstanceOf(AuthenticationError);
        expect(error.message).toContain('GitHub CLI not found');
      }
      
      // Clean up
      vi.mocked(checkGhCliInstalled).mockReset();
    });

    it('should throw AuthenticationError when not authenticated', async () => {
      const { checkGhCliInstalled, checkGhAuthenticated } = await import('../../../src/utils/codespaces/management.js');
      vi.mocked(checkGhCliInstalled).mockResolvedValue(undefined);
      vi.mocked(checkGhAuthenticated).mockRejectedValue(new Error('Not authenticated'));

      const checkPrerequisites = (connector as any).checkPrerequisites.bind(connector);
      
      try {
        await checkPrerequisites();
        expect.fail('Should have thrown AuthenticationError');
      } catch (error: any) {
        expect(error).toBeInstanceOf(AuthenticationError);
        expect(error.message).toContain('Not authenticated with GitHub');
      }
      
      // Clean up
      vi.mocked(checkGhCliInstalled).mockReset();
      vi.mocked(checkGhAuthenticated).mockReset();
    });
  });

  describe('deploy - Claude auth token integration', () => {
    // Helper to setup successful deployment mocks
    async function setupDeploymentMocks() {
      const { checkGhCliInstalled, checkGhAuthenticated, createCodespace, waitForCodespaceReady } = await import('../../../src/utils/codespaces/management.js');
      const { waitForPortListening, forwardPort, getCodespacePortUrl } = await import('../../../src/utils/codespaces/ports.js');
      const { installClaudeCode, installSudocodeGlobally, initializeSudocodeProject } = await import('../../../src/utils/codespaces/installation.js');
      const { startSudocodeServer } = await import('../../../src/utils/codespaces/server.js');
      const { startIdleTimeoutDaemon } = await import('../../../src/utils/codespaces/keepalive.js');

      // Mock prerequisites
      vi.mocked(checkGhCliInstalled).mockResolvedValue(undefined);
      vi.mocked(checkGhAuthenticated).mockResolvedValue(undefined);

      // Mock codespace creation
      vi.mocked(createCodespace).mockResolvedValue({
        name: 'test-codespace-abc123',
        repository: 'anthropics/sudocode',
        state: 'Available',
        createdAt: new Date().toISOString(),
        url: 'https://test-codespace.github.dev',
        machine: 'basicLinux32gb',
      });

      vi.mocked(waitForCodespaceReady).mockResolvedValue();

      // Mock installation
      vi.mocked(installClaudeCode).mockResolvedValue();
      vi.mocked(installSudocodeGlobally).mockResolvedValue();
      vi.mocked(initializeSudocodeProject).mockResolvedValue();

      // Mock server startup
      vi.mocked(startSudocodeServer).mockResolvedValue();
      vi.mocked(waitForPortListening).mockResolvedValue();
      vi.mocked(startIdleTimeoutDaemon).mockResolvedValue();

      // Mock port forwarding
      vi.mocked(forwardPort).mockResolvedValue();
      vi.mocked(getCodespacePortUrl).mockResolvedValue('https://test-codespace-3000.app.github.dev');
    }

    it('should pass claudeLtt token to startSudocodeServer when provided', async () => {
      await setupDeploymentMocks();
      const { startSudocodeServer } = await import('../../../src/utils/codespaces/server.js');

      const options: DeployOptions = {
        ...completeCodespacesOptions,
        models: {
          claudeLtt: 'ltt_test_token_abc123'
        }
      };

      await connector.deploy(options);

      // Verify startSudocodeServer was called with claudeAuthToken option
      expect(startSudocodeServer).toHaveBeenCalledWith(
        'test-codespace-abc123',
        3000,
        {
          claudeAuthToken: 'ltt_test_token_abc123'
        }
      );
    });

    it('should start server without auth token when claudeLtt not provided', async () => {
      await setupDeploymentMocks();
      const { startSudocodeServer } = await import('../../../src/utils/codespaces/server.js');

      const options: DeployOptions = {
        ...minimalCodespacesOptions,
        models: undefined
      };

      await connector.deploy(options);

      // Verify startSudocodeServer was called without claudeAuthToken
      expect(startSudocodeServer).toHaveBeenCalledWith(
        'test-codespace-abc123',
        3000,
        {
          claudeAuthToken: undefined
        }
      );
    });

    it('should start server without auth token when models object exists but claudeLtt is undefined', async () => {
      await setupDeploymentMocks();
      const { startSudocodeServer } = await import('../../../src/utils/codespaces/server.js');

      const options: DeployOptions = {
        ...minimalCodespacesOptions,
        models: {
          providerConfig: {
            provider: 'anthropic',
            apiKey: 'sk-ant-test'
          }
        }
      };

      await connector.deploy(options);

      // Verify startSudocodeServer was called without claudeAuthToken
      expect(startSudocodeServer).toHaveBeenCalledWith(
        'test-codespace-abc123',
        3000,
        {
          claudeAuthToken: undefined
        }
      );
    });

    it('should create deployment successfully with auth token', async () => {
      await setupDeploymentMocks();

      const options: DeployOptions = {
        ...completeCodespacesOptions,
        models: {
          claudeLtt: 'ltt_test_token_abc123'
        }
      };

      const deployment = await connector.deploy(options);

      // Verify deployment structure
      expect(deployment.id).toBe('test-codespace-abc123');
      expect(deployment.name).toBe('test-codespace-abc123');
      expect(deployment.provider).toBe('codespaces');
      expect(deployment.status).toBe('running');
      expect(deployment.git).toEqual({
        owner: 'anthropics',
        repo: 'sudocode',
        branch: 'main',
      });
    });
  });
});

describe('Backward compatibility', () => {
  it('should export CodespacesProvider as alias', async () => {
    const { CodespacesProvider, CodespacesConnector } = await import('../../../src/connectors/codespaces.js');
    expect(CodespacesProvider).toBe(CodespacesConnector);
  });
});
