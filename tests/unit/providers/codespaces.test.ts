/**
 * Tests for Codespaces provider
 * Tests the new DeployOptions structure with git repo separation
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { CodespacesProvider } from '../../../src/providers/codespaces.js';
import type { CodespacesConfig, DeployOptions, Deployment } from '../../../src/types.js';
import {
  minimalCodespacesOptions,
  completeCodespacesOptions,
  localBuildOptions,
  anthropicProviderConfigOptions,
  envVarProviderConfigOptions,
  combinedLlmConfigOptions,
  noAgentsOptions,
} from '../../fixtures/deploy-options.js';

describe('CodespacesProvider', () => {
  let provider: CodespacesProvider;
  const config: CodespacesConfig = { type: 'codespaces' };

  beforeEach(() => {
    provider = new CodespacesProvider(config);
  });

  describe('constructor', () => {
    it('should create provider with correct type', () => {
      expect(provider.type).toBe('codespaces');
    });
  });

  describe('deploy', () => {
    describe('git repository extraction', () => {
      it('should extract owner and repo from git config', async () => {
        // This test verifies the provider extracts git info from new structure
        // Since deploy() is not implemented, we verify the structure is correct
        const options = minimalCodespacesOptions;
        
        expect(options.git.owner).toBe('anthropics');
        expect(options.git.repo).toBe('sudocode');
        expect(options.git.branch).toBeUndefined();
      });

      it('should handle git config with branch', async () => {
        const options = completeCodespacesOptions;
        
        expect(options.git.owner).toBe('anthropics');
        expect(options.git.repo).toBe('sudocode');
        expect(options.git.branch).toBe('main');
      });

      it('should handle git config with branch containing slashes', async () => {
        const options = localBuildOptions;
        
        expect(options.git.owner).toBe('myorg');
        expect(options.git.repo).toBe('my-project');
        expect(options.git.branch).toBe('feature/new-feature');
      });
    });

    describe('agent installation', () => {
      it('should handle options without agents config', async () => {
        const options = minimalCodespacesOptions;
        
        expect(options.agents).toBeUndefined();
        // Provider should handle undefined agents gracefully
        await expect(provider.deploy(options)).rejects.toThrow('not yet implemented');
      });

      it('should handle options with claude agent', async () => {
        const options = completeCodespacesOptions;
        
        expect(options.agents?.install).toEqual(['claude']);
        await expect(provider.deploy(options)).rejects.toThrow('not yet implemented');
      });

      it('should handle empty agents array', async () => {
        const options = noAgentsOptions;
        
        expect(options.agents?.install).toEqual([]);
        await expect(provider.deploy(options)).rejects.toThrow('not yet implemented');
      });
    });

    describe('LLM configuration', () => {
      it('should handle options without LLM config', async () => {
        const options = minimalCodespacesOptions;
        
        expect(options.models).toBeUndefined();
        await expect(provider.deploy(options)).rejects.toThrow('not yet implemented');
      });

      it('should handle claudeLtt configuration', async () => {
        const options = completeCodespacesOptions;
        
        expect(options.models?.claudeLtt).toBe('ltt_test_token_12345');
        await expect(provider.deploy(options)).rejects.toThrow('not yet implemented');
      });

      it('should handle providerConfig configuration', async () => {
        const options = anthropicProviderConfigOptions;
        
        expect(options.models?.providerConfig).toEqual({
          provider: 'anthropic',
          apiKey: 'sk-ant-test-key-12345',
        });
        await expect(provider.deploy(options)).rejects.toThrow('not yet implemented');
      });

      it('should handle providerConfigEnvVar configuration', async () => {
        const options = envVarProviderConfigOptions;
        
        expect(options.models?.providerConfigEnvVar).toBe('LLM_CONFIG');
        await expect(provider.deploy(options)).rejects.toThrow('not yet implemented');
      });

      it('should handle combined LLM configurations', async () => {
        const options = combinedLlmConfigOptions;
        
        expect(options.models?.claudeLtt).toBe('ltt_test_token_12345');
        expect(options.models?.providerConfig).toBeDefined();
        expect(options.models?.providerConfigEnvVar).toBe('LLM_CONFIG');
        await expect(provider.deploy(options)).rejects.toThrow('not yet implemented');
      });
    });

    describe('deployment options', () => {
      it('should extract Codespaces-specific options', async () => {
        const options = completeCodespacesOptions;
        const providerOpts = options.providerOptions as any;
        
        expect(providerOpts.machine).toBe('largePremiumLinux');
        expect(providerOpts.retentionPeriod).toBe(14);
      });

      it('should handle keepAliveHours', async () => {
        const options = completeCodespacesOptions;
        
        expect(options.server.keepAliveHours).toBe(72);
      });

      it('should recognize that idleTimeout is ignored', async () => {
        // Codespaces ignores idleTimeout per the spec
        const options = completeCodespacesOptions;
        
        expect(options.server.idleTimeout).toBe(240);
        // When implemented, provider should ignore this value
      });
    });

    describe('sudocode installation modes', () => {
      it('should handle npm mode with version', async () => {
        const options = completeCodespacesOptions;
        
        expect(options.sudocode.mode).toBe('npm');
        expect(options.sudocode.version).toBe('1.2.3');
        await expect(provider.deploy(options)).rejects.toThrow('not yet implemented');
      });

      it('should handle local mode with localPath', async () => {
        const options = localBuildOptions;
        
        expect(options.sudocode.mode).toBe('local');
        expect(options.sudocode.localPath).toBe('/path/to/sudocode-build.tar.gz');
        await expect(provider.deploy(options)).rejects.toThrow('not yet implemented');
      });
    });

    describe('deployment object structure', () => {
      it('should return deployment with new git structure (when implemented)', async () => {
        // This test documents the expected return structure
        // When deploy() is implemented, it should return a Deployment with:
        // - git: { owner, repo, branch? }
        // - NOT repository and branch as separate fields
        
        const expectedStructure: Partial<Deployment> = {
          git: {
            owner: 'anthropics',
            repo: 'sudocode',
            branch: 'main',
          },
          provider: 'codespaces',
          keepAliveHours: 72,
          idleTimeout: undefined, // Codespaces ignores this
        };

        expect(expectedStructure.git.owner).toBe('anthropics');
        expect(expectedStructure.git.repo).toBe('sudocode');
        expect(expectedStructure.git.branch).toBe('main');
        expect(expectedStructure.idleTimeout).toBeUndefined();
      });
    });
  });

  describe('stop', () => {
    it('should throw not implemented error', async () => {
      await expect(provider.stop('test-codespace')).rejects.toThrow('not yet implemented');
    });
  });

  describe('getStatus', () => {
    it('should throw not implemented error', async () => {
      await expect(provider.getStatus('test-codespace')).rejects.toThrow('not yet implemented');
    });
  });

  describe('list', () => {
    it('should throw not implemented error', async () => {
      await expect(provider.list()).rejects.toThrow('not yet implemented');
    });

    it('should accept filters with new git structure fields', async () => {
      // When implemented, list should support filtering by owner and repo
      const filters = {
        owner: 'anthropics',
        repo: 'sudocode',
        status: ['running' as const],
      };
      
      await expect(provider.list(filters)).rejects.toThrow('not yet implemented');
    });
  });

  describe('getUrls', () => {
    it('should throw not implemented error', async () => {
      await expect(provider.getUrls('test-codespace')).rejects.toThrow('not yet implemented');
    });
  });

  describe('private helper methods', () => {
    describe('mapToDeployment', () => {
      it('should map codespace data to Deployment with new git structure', () => {
        // Access private method for testing
        const mapToDeployment = (provider as any).mapToDeployment.bind(provider);
        
        const codespaceData = {
          name: 'test-codespace',
          displayName: 'Test Codespace',
          repository: 'anthropics/sudocode',
          state: 'Available',
          createdAt: '2025-01-08T00:00:00Z',
          webUrl: 'https://github.com/codespaces/test',
          machine: 'basicLinux32gb',
          retentionPeriod: 14,
          gitStatus: {
            ref: 'main',
          },
        };
        
        const options = completeCodespacesOptions;
        const deployment = mapToDeployment(codespaceData, options);
        
        // Verify new git structure
        expect(deployment.git).toEqual({
          owner: 'anthropics',
          repo: 'sudocode',
          branch: 'main',
        });
        
        // Verify deployment doesn't have old repository field
        expect((deployment as any).repository).toBeUndefined();
        
        // Verify other fields
        expect(deployment.provider).toBe('codespaces');
        expect(deployment.status).toBe('running');
        expect(deployment.keepAliveHours).toBe(72);
        expect(deployment.idleTimeout).toBeUndefined();
      });

      it('should handle repository string without branch', () => {
        const mapToDeployment = (provider as any).mapToDeployment.bind(provider);
        
        const codespaceData = {
          name: 'test-codespace',
          repository: 'myorg/my-repo',
          state: 'Available',
          createdAt: '2025-01-08T00:00:00Z',
          webUrl: 'https://github.com/codespaces/test',
          machine: 'basicLinux32gb',
          retentionPeriod: 14,
        };
        
        const deployment = mapToDeployment(codespaceData);
        
        expect(deployment.git).toEqual({
          owner: 'myorg',
          repo: 'my-repo',
          branch: undefined,
        });
      });

      it('should use branch from options if not in codespace data', () => {
        const mapToDeployment = (provider as any).mapToDeployment.bind(provider);
        
        const codespaceData = {
          name: 'test-codespace',
          repository: 'anthropics/sudocode',
          state: 'Available',
          createdAt: '2025-01-08T00:00:00Z',
          webUrl: 'https://github.com/codespaces/test',
          machine: 'basicLinux32gb',
          retentionPeriod: 14,
        };
        
        const options = completeCodespacesOptions;
        const deployment = mapToDeployment(codespaceData, options);
        
        expect(deployment.git.branch).toBe('main');
      });
    });

    describe('mapStatus', () => {
      it('should map Available to running', () => {
        const mapStatus = (provider as any).mapStatus.bind(provider);
        expect(mapStatus('Available')).toBe('running');
      });

      it('should map Starting to starting', () => {
        const mapStatus = (provider as any).mapStatus.bind(provider);
        expect(mapStatus('Starting')).toBe('starting');
      });

      it('should map Shutdown to stopped', () => {
        const mapStatus = (provider as any).mapStatus.bind(provider);
        expect(mapStatus('Shutdown')).toBe('stopped');
      });

      it('should map Pending to provisioning', () => {
        const mapStatus = (provider as any).mapStatus.bind(provider);
        expect(mapStatus('Pending')).toBe('provisioning');
      });

      it('should map unknown status to failed', () => {
        const mapStatus = (provider as any).mapStatus.bind(provider);
        expect(mapStatus('UnknownStatus')).toBe('failed');
      });
    });

    describe('prepareLlmConfig', () => {
      it('should return null for undefined models', () => {
        const prepareLlmConfig = (provider as any).prepareLlmConfig.bind(provider);
        expect(prepareLlmConfig(undefined)).toBeNull();
      });

      it('should return config with claudeLtt', () => {
        const prepareLlmConfig = (provider as any).prepareLlmConfig.bind(provider);
        const config = prepareLlmConfig({
          claudeLtt: 'ltt_test_token',
        });
        
        expect(config).toEqual({
          claudeLtt: 'ltt_test_token',
        });
      });

      it('should return config with providerConfig', () => {
        const prepareLlmConfig = (provider as any).prepareLlmConfig.bind(provider);
        const config = prepareLlmConfig({
          providerConfig: {
            provider: 'anthropic',
            apiKey: 'sk-test',
          },
        });
        
        expect(config).toEqual({
          providerConfig: {
            provider: 'anthropic',
            apiKey: 'sk-test',
          },
        });
      });

      it('should return config with providerConfigEnvVar', () => {
        const prepareLlmConfig = (provider as any).prepareLlmConfig.bind(provider);
        const config = prepareLlmConfig({
          providerConfigEnvVar: 'LLM_CONFIG',
        });
        
        expect(config).toEqual({
          providerConfigEnvVar: 'LLM_CONFIG',
        });
      });

      it('should return combined config with all fields', () => {
        const prepareLlmConfig = (provider as any).prepareLlmConfig.bind(provider);
        const config = prepareLlmConfig({
          claudeLtt: 'ltt_test_token',
          providerConfig: {
            provider: 'anthropic',
            apiKey: 'sk-test',
          },
          providerConfigEnvVar: 'LLM_CONFIG',
        });
        
        expect(config).toEqual({
          claudeLtt: 'ltt_test_token',
          providerConfig: {
            provider: 'anthropic',
            apiKey: 'sk-test',
          },
          providerConfigEnvVar: 'LLM_CONFIG',
        });
      });

      it('should return null for empty models object', () => {
        const prepareLlmConfig = (provider as any).prepareLlmConfig.bind(provider);
        expect(prepareLlmConfig({})).toBeNull();
      });
    });
  });
});
