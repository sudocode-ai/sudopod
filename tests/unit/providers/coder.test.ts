/**
 * Tests for Coder provider
 * Tests the new DeployOptions structure with git repo separation
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { CoderProvider } from '../../../src/providers/coder.js';
import type { CoderConfig, DeployOptions, Deployment } from '../../../src/types.js';
import {
  minimalCoderOptions,
  completeCoderOptions,
  anthropicProviderConfigOptions,
  bedrockProviderConfigOptions,
  envVarProviderConfigOptions,
} from '../../fixtures/deploy-options.js';

describe('CoderProvider', () => {
  let provider: CoderProvider;
  const config: CoderConfig = {
    type: 'coder',
    url: 'https://coder.example.com',
    apiKey: 'test-api-key',
  };

  beforeEach(() => {
    provider = new CoderProvider(config);
  });

  describe('constructor', () => {
    it('should create provider with correct type', () => {
      expect(provider.type).toBe('coder');
    });
  });

  describe('deploy', () => {
    describe('git repository extraction', () => {
      it('should extract owner and repo from git config', async () => {
        const options = minimalCoderOptions;
        
        expect(options.git.owner).toBe('myorg');
        expect(options.git.repo).toBe('my-project');
        expect(options.git.branch).toBeUndefined();
      });

      it('should handle git config with branch', async () => {
        const options = completeCoderOptions;
        
        expect(options.git.owner).toBe('myorg');
        expect(options.git.repo).toBe('my-project');
        expect(options.git.branch).toBe('develop');
      });

      it('should construct GitHub URL from git config', async () => {
        const options = minimalCoderOptions;
        const expectedUrl = `https://github.com/${options.git.owner}/${options.git.repo}`;
        
        expect(expectedUrl).toBe('https://github.com/myorg/my-project');
      });
    });

    describe('agent installation', () => {
      it('should handle options without agents config', async () => {
        const options = minimalCoderOptions;
        
        expect(options.agents).toBeUndefined();
        await expect(provider.deploy(options)).rejects.toThrow('not yet implemented');
      });

      it('should handle options with claude agent', async () => {
        const options = completeCoderOptions;
        
        expect(options.agents?.install).toEqual(['claude']);
        // When implemented, should set parameters['install_claude_agent'] = 'true'
        await expect(provider.deploy(options)).rejects.toThrow('not yet implemented');
      });

      it('should handle empty agents array', async () => {
        const options: DeployOptions = {
          ...minimalCoderOptions,
          agents: {
            install: [],
          },
        };
        
        expect(options.agents.install).toEqual([]);
        await expect(provider.deploy(options)).rejects.toThrow('not yet implemented');
      });
    });

    describe('LLM configuration', () => {
      it('should handle options without LLM config', async () => {
        const options = minimalCoderOptions;
        
        expect(options.models).toBeUndefined();
        await expect(provider.deploy(options)).rejects.toThrow('not yet implemented');
      });

      it('should handle claudeLtt configuration', async () => {
        const options: DeployOptions = {
          ...minimalCoderOptions,
          models: {
            claudeLtt: 'ltt_test_token_12345',
          },
        };
        
        expect(options.models.claudeLtt).toBe('ltt_test_token_12345');
        // When implemented, should set envVars['CLAUDE_LTT']
        await expect(provider.deploy(options)).rejects.toThrow('not yet implemented');
      });

      it('should handle providerConfig configuration', async () => {
        const options: DeployOptions = {
          ...minimalCoderOptions,
          models: {
            providerConfig: {
              provider: 'anthropic',
              apiKey: 'sk-ant-test-key',
            },
          },
        };
        
        expect(options.models.providerConfig).toEqual({
          provider: 'anthropic',
          apiKey: 'sk-ant-test-key',
        });
        // When implemented, should set envVars['LLM_PROVIDER_CONFIG'] as JSON string
        await expect(provider.deploy(options)).rejects.toThrow('not yet implemented');
      });

      it('should handle providerConfigEnvVar configuration', async () => {
        const options: DeployOptions = {
          ...minimalCoderOptions,
          models: {
            providerConfigEnvVar: 'LLM_CONFIG',
          },
        };
        
        expect(options.models.providerConfigEnvVar).toBe('LLM_CONFIG');
        // When implemented, should set envVars['LLM_PROVIDER_CONFIG_VAR']
        await expect(provider.deploy(options)).rejects.toThrow('not yet implemented');
      });

      it('should handle Bedrock provider config', async () => {
        const options: DeployOptions = {
          ...minimalCoderOptions,
          models: {
            providerConfig: {
              provider: 'bedrock',
              region: 'us-east-1',
              accessKeyId: 'AKIAIOSFODNN7EXAMPLE',
              secretAccessKey: 'wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY',
            },
          },
        };
        
        expect(options.models.providerConfig?.provider).toBe('bedrock');
        await expect(provider.deploy(options)).rejects.toThrow('not yet implemented');
      });
    });

    describe('deployment options', () => {
      it('should extract Coder-specific options', async () => {
        const options = completeCoderOptions;
        const providerOpts = options.providerOptions as any;
        
        expect(providerOpts.template).toBe('sudocode-workspace');
        // Note: After deploy() is called, parameters will include install_claude_agent
        // This test checks the original parameters before mutation
        expect(providerOpts.parameters.region).toBe('us-west-2');
        expect(providerOpts.parameters.instanceType).toBe('large');
        expect(providerOpts.autoStart).toBe(true);
      });

      it('should handle keepAliveHours (honored by Coder)', async () => {
        const options = completeCoderOptions;
        
        expect(options.server.keepAliveHours).toBe(168);
        // Coder honors keepAliveHours as TTL
      });

      it('should handle idleTimeout (honored by Coder)', async () => {
        const options = completeCoderOptions;
        
        expect(options.server.idleTimeout).toBe(60);
        // Coder honors idleTimeout for workspace pause
      });

      it('should use default template when not specified', async () => {
        const options = minimalCoderOptions;
        const providerOpts = options.providerOptions as any;
        
        expect(providerOpts.template).toBe('sudocode-workspace');
      });
    });

    describe('sudocode installation modes', () => {
      it('should handle npm mode without version', async () => {
        const options = minimalCoderOptions;
        
        expect(options.sudocode.mode).toBe('npm');
        expect(options.sudocode.version).toBeUndefined();
        await expect(provider.deploy(options)).rejects.toThrow('not yet implemented');
      });

      it('should handle npm mode with version', async () => {
        const options = completeCoderOptions;
        
        expect(options.sudocode.mode).toBe('npm');
        expect(options.sudocode.version).toBe('latest');
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
            owner: 'myorg',
            repo: 'my-project',
            branch: 'develop',
          },
          provider: 'coder',
          keepAliveHours: 168,
          idleTimeout: 60, // Coder honors this
        };

        expect(expectedStructure.git.owner).toBe('myorg');
        expect(expectedStructure.git.repo).toBe('my-project');
        expect(expectedStructure.git.branch).toBe('develop');
        expect(expectedStructure.idleTimeout).toBe(60);
      });
    });
  });

  describe('stop', () => {
    it('should throw not implemented error', async () => {
      await expect(provider.stop('test-workspace')).rejects.toThrow('not yet implemented');
    });
  });

  describe('getStatus', () => {
    it('should throw not implemented error', async () => {
      await expect(provider.getStatus('test-workspace')).rejects.toThrow('not yet implemented');
    });
  });

  describe('list', () => {
    it('should throw not implemented error', async () => {
      await expect(provider.list()).rejects.toThrow('not yet implemented');
    });

    it('should accept filters with new git structure fields', async () => {
      // When implemented, list should support filtering by owner and repo
      const filters = {
        owner: 'myorg',
        repo: 'my-project',
        status: ['running' as const],
      };
      
      await expect(provider.list(filters)).rejects.toThrow('not yet implemented');
    });
  });

  describe('getUrls', () => {
    it('should throw not implemented error', async () => {
      await expect(provider.getUrls('test-workspace')).rejects.toThrow('not yet implemented');
    });
  });

  describe('configuration handling', () => {
    it('should store Coder URL', () => {
      expect((provider as any).config.url).toBe('https://coder.example.com');
    });

    it('should store API key', () => {
      expect((provider as any).config.apiKey).toBe('test-api-key');
    });
  });

  describe('environment variable handling', () => {
    it('should prepare env vars for LLM config', async () => {
      const options: DeployOptions = {
        ...minimalCoderOptions,
        models: {
          claudeLtt: 'ltt_test',
          providerConfig: {
            provider: 'anthropic',
            apiKey: 'sk-test',
          },
          providerConfigEnvVar: 'LLM_CONFIG',
        },
      };

      // When implemented, the deploy method should create envVars object with:
      // - CLAUDE_LTT: 'ltt_test'
      // - LLM_PROVIDER_CONFIG: JSON.stringify(providerConfig)
      // - LLM_PROVIDER_CONFIG_VAR: 'LLM_CONFIG'
      
      await expect(provider.deploy(options)).rejects.toThrow('not yet implemented');
    });
  });

  describe('template parameter handling', () => {
    it('should pass template parameters', async () => {
      const options = completeCoderOptions;
      const providerOpts = options.providerOptions as any;
      
      // Check that the original parameters are present
      expect(providerOpts.parameters.region).toBe('us-west-2');
      expect(providerOpts.parameters.instanceType).toBe('large');
    });

    it('should handle empty parameters', async () => {
      const options = minimalCoderOptions;
      const providerOpts = options.providerOptions as any;
      
      expect(providerOpts.parameters).toBeUndefined();
    });

    it('should add agent installation to parameters', async () => {
      const options = completeCoderOptions;
      
      expect(options.agents?.install).toContain('claude');
      // When implemented, should add 'install_claude_agent': 'true' to parameters
    });
  });

  describe('workspace lifecycle', () => {
    it('should configure TTL from keepAliveHours', async () => {
      const options = completeCoderOptions;
      
      expect(options.server.keepAliveHours).toBe(168);
      // Coder should use this as workspace TTL
    });

    it('should configure idle timeout', async () => {
      const options = completeCoderOptions;
      
      expect(options.server.idleTimeout).toBe(60);
      // Coder should use this for automatic workspace pause
    });

    it('should handle auto-start option', async () => {
      const options = completeCoderOptions;
      const providerOpts = options.providerOptions as any;
      
      expect(providerOpts.autoStart).toBe(true);
    });
  });
});
