/**
 * Tests for validation utilities
 * Tests the new DeployOptions structure with git repo separation
 */

import { describe, it, expect } from 'vitest';
import {
  validateGitConfig,
  validateAgentConfig,
  validateModelConfig,
  validateSudocodeConfig,
  validateServerConfig,
  validateDeployOptions,
  ValidationError,
} from '../../../src/utils/validation.js';
import type { DeployOptions } from '../../../src/types.js';
import {
  minimalCodespacesOptions,
  completeCodespacesOptions,
  noAgentsOptions,
  anthropicProviderConfigOptions,
  openaiProviderConfigOptions,
  bedrockProviderConfigOptions,
  envVarProviderConfigOptions,
  combinedLlmConfigOptions,
} from '../../fixtures/deploy-options.js';

describe('validateGitConfig', () => {
  describe('valid git configurations', () => {
    it('should accept valid git config with owner and repo', () => {
      expect(() => validateGitConfig({
        owner: 'anthropics',
        repo: 'sudocode',
      })).not.toThrow();
    });

    it('should accept git config with optional branch', () => {
      expect(() => validateGitConfig({
        owner: 'anthropics',
        repo: 'sudocode',
        branch: 'main',
      })).not.toThrow();
    });

    it('should accept git config with branch containing slashes', () => {
      expect(() => validateGitConfig({
        owner: 'anthropics',
        repo: 'sudocode',
        branch: 'feature/new-feature',
      })).not.toThrow();
    });

    it('should accept git config with branch containing dashes', () => {
      expect(() => validateGitConfig({
        owner: 'anthropics',
        repo: 'sudocode',
        branch: 'feature-branch',
      })).not.toThrow();
    });
  });

  describe('invalid git configurations', () => {
    it('should reject missing git config', () => {
      expect(() => validateGitConfig(undefined as any))
        .toThrow(ValidationError);
    });

    it('should reject missing owner', () => {
      expect(() => validateGitConfig({
        owner: '',
        repo: 'sudocode',
      }))
        .toThrow(ValidationError);
    });

    it('should reject empty owner', () => {
      expect(() => validateGitConfig({
        owner: '   ',
        repo: 'sudocode',
      }))
        .toThrow(ValidationError);
    });

    it('should reject missing repo', () => {
      expect(() => validateGitConfig({
        owner: 'anthropics',
        repo: '',
      }))
        .toThrow(ValidationError);
    });

    it('should reject empty repo', () => {
      expect(() => validateGitConfig({
        owner: 'anthropics',
        repo: '   ',
      }))
        .toThrow(ValidationError);
    });

    it('should reject non-string owner', () => {
      expect(() => validateGitConfig({
        owner: 123 as any,
        repo: 'sudocode',
      }))
        .toThrow(ValidationError);
    });

    it('should reject non-string repo', () => {
      expect(() => validateGitConfig({
        owner: 'anthropics',
        repo: 123 as any,
      }))
        .toThrow(ValidationError);
    });

    it('should reject empty branch string', () => {
      expect(() => validateGitConfig({
        owner: 'anthropics',
        repo: 'sudocode',
        branch: '',
      }))
        .toThrow(ValidationError);
    });

    it('should reject branch with spaces', () => {
      expect(() => validateGitConfig({
        owner: 'anthropics',
        repo: 'sudocode',
        branch: 'feature branch',
      }))
        .toThrow(ValidationError);
    });

    it('should reject branch with invalid characters (~)', () => {
      expect(() => validateGitConfig({
        owner: 'anthropics',
        repo: 'sudocode',
        branch: 'feature~1',
      }))
        .toThrow(ValidationError);
    });

    it('should reject branch with invalid characters (^)', () => {
      expect(() => validateGitConfig({
        owner: 'anthropics',
        repo: 'sudocode',
        branch: 'feature^1',
      }))
        .toThrow(ValidationError);
    });

    it('should reject branch with invalid characters (:)', () => {
      expect(() => validateGitConfig({
        owner: 'anthropics',
        repo: 'sudocode',
        branch: 'feature:branch',
      }))
        .toThrow(ValidationError);
    });
  });
});

describe('validateAgentConfig', () => {
  describe('valid agent configurations', () => {
    it('should accept undefined agents config (optional)', () => {
      expect(() => validateAgentConfig(undefined)).not.toThrow();
    });

    it('should accept empty install array', () => {
      expect(() => validateAgentConfig({
        install: [],
      })).not.toThrow();
    });

    it('should accept claude agent', () => {
      expect(() => validateAgentConfig({
        install: ['claude'],
      })).not.toThrow();
    });

    it('should accept multiple supported agents', () => {
      expect(() => validateAgentConfig({
        install: ['claude'],
      })).not.toThrow();
    });
  });

  describe('invalid agent configurations', () => {
    it('should reject missing install array', () => {
      expect(() => validateAgentConfig({} as any))
        .toThrow(ValidationError);
    });

    it('should reject non-array install', () => {
      expect(() => validateAgentConfig({
        install: 'claude' as any,
      }))
        .toThrow(ValidationError);
    });

    it('should reject unsupported agent identifier', () => {
      expect(() => validateAgentConfig({
        install: ['unknown-agent'],
      }))
        .toThrow(ValidationError);
    });

    it('should reject non-string agent identifiers', () => {
      expect(() => validateAgentConfig({
        install: [123] as any,
      }))
        .toThrow(ValidationError);
    });

    it('should reject mix of valid and invalid agents', () => {
      expect(() => validateAgentConfig({
        install: ['claude', 'invalid-agent'],
      }))
        .toThrow(ValidationError);
    });
  });
});

describe('validateModelConfig', () => {
  describe('valid model configurations', () => {
    it('should accept undefined models config (optional)', () => {
      expect(() => validateModelConfig(undefined)).not.toThrow();
    });

    it('should accept claudeLtt', () => {
      expect(() => validateModelConfig({
        claudeLtt: 'ltt_test_token_12345',
      })).not.toThrow();
    });

    it('should accept providerConfig with Anthropic', () => {
      expect(() => validateModelConfig({
        providerConfig: {
          provider: 'anthropic',
          apiKey: 'sk-ant-test-key',
        },
      })).not.toThrow();
    });

    it('should accept providerConfig with OpenAI', () => {
      expect(() => validateModelConfig({
        providerConfig: {
          provider: 'openai',
          apiKey: 'sk-test-key',
          baseUrl: 'https://api.openai.com/v1',
        },
      })).not.toThrow();
    });

    it('should accept providerConfig with AWS Bedrock', () => {
      expect(() => validateModelConfig({
        providerConfig: {
          provider: 'bedrock',
          region: 'us-east-1',
          accessKeyId: 'AKIAIOSFODNN7EXAMPLE',
          secretAccessKey: 'wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY',
        },
      })).not.toThrow();
    });

    it('should accept providerConfigEnvVar', () => {
      expect(() => validateModelConfig({
        providerConfigEnvVar: 'LLM_CONFIG',
      })).not.toThrow();
    });

    it('should accept all LLM config options combined', () => {
      expect(() => validateModelConfig({
        claudeLtt: 'ltt_test_token',
        providerConfig: {
          provider: 'anthropic',
          apiKey: 'sk-ant-test-key',
        },
        providerConfigEnvVar: 'LLM_CONFIG',
      })).not.toThrow();
    });

    it('should accept providerConfig without provider field', () => {
      expect(() => validateModelConfig({
        providerConfig: {
          apiKey: 'sk-test-key',
          customField: 'value',
        },
      })).not.toThrow();
    });
  });

  describe('invalid model configurations', () => {
    it('should reject empty claudeLtt', () => {
      expect(() => validateModelConfig({
        claudeLtt: '',
      }))
        .toThrow(ValidationError);
    });

    it('should reject claudeLtt without ltt_ prefix', () => {
      expect(() => validateModelConfig({
        claudeLtt: 'invalid_token',
      }))
        .toThrow(ValidationError);
    });

    it('should reject non-string claudeLtt', () => {
      expect(() => validateModelConfig({
        claudeLtt: 123 as any,
      }))
        .toThrow(ValidationError);
    });

    it('should reject null providerConfig', () => {
      expect(() => validateModelConfig({
        providerConfig: null as any,
      }))
        .toThrow(ValidationError);
    });

    it('should reject array providerConfig', () => {
      expect(() => validateModelConfig({
        providerConfig: [] as any,
      }))
        .toThrow(ValidationError);
    });

    it('should reject empty providerConfig object', () => {
      expect(() => validateModelConfig({
        providerConfig: {},
      }))
        .toThrow(ValidationError);
    });

    it('should reject Anthropic provider without apiKey', () => {
      expect(() => validateModelConfig({
        providerConfig: {
          provider: 'anthropic',
        },
      }))
        .toThrow(ValidationError);
    });

    it('should reject OpenAI provider without apiKey', () => {
      expect(() => validateModelConfig({
        providerConfig: {
          provider: 'openai',
        },
      }))
        .toThrow(ValidationError);
    });

    it('should reject Bedrock provider without region', () => {
      expect(() => validateModelConfig({
        providerConfig: {
          provider: 'bedrock',
          accessKeyId: 'AKIAIOSFODNN7EXAMPLE',
          secretAccessKey: 'wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY',
        },
      }))
        .toThrow(ValidationError);
    });

    it('should reject Bedrock provider without credentials', () => {
      expect(() => validateModelConfig({
        providerConfig: {
          provider: 'bedrock',
          region: 'us-east-1',
        },
      }))
        .toThrow(ValidationError);
    });

    it('should reject empty providerConfigEnvVar', () => {
      expect(() => validateModelConfig({
        providerConfigEnvVar: '',
      }))
        .toThrow(ValidationError);
    });

    it('should reject lowercase providerConfigEnvVar', () => {
      expect(() => validateModelConfig({
        providerConfigEnvVar: 'llm_config',
      }))
        .toThrow(ValidationError);
    });

    it('should reject providerConfigEnvVar with invalid characters', () => {
      expect(() => validateModelConfig({
        providerConfigEnvVar: 'LLM-CONFIG',
      }))
        .toThrow(ValidationError);
    });
  });
});

describe('validateSudocodeConfig', () => {
  describe('valid sudocode configurations', () => {
    it('should accept npm mode without version', () => {
      expect(() => validateSudocodeConfig({
        mode: 'npm',
      })).not.toThrow();
    });

    it('should accept npm mode with version', () => {
      expect(() => validateSudocodeConfig({
        mode: 'npm',
        version: '1.2.3',
      })).not.toThrow();
    });

    it('should accept npm mode with latest version', () => {
      expect(() => validateSudocodeConfig({
        mode: 'npm',
        version: 'latest',
      })).not.toThrow();
    });

    it('should accept local mode with localPath', () => {
      expect(() => validateSudocodeConfig({
        mode: 'local',
        localPath: '/path/to/build.tar.gz',
      })).not.toThrow();
    });
  });

  describe('invalid sudocode configurations', () => {
    it('should reject missing sudocode config', () => {
      expect(() => validateSudocodeConfig(undefined as any))
        .toThrow(ValidationError);
    });

    it('should reject missing mode', () => {
      expect(() => validateSudocodeConfig({} as any))
        .toThrow(ValidationError);
    });

    it('should reject invalid mode', () => {
      expect(() => validateSudocodeConfig({
        mode: 'invalid' as any,
      }))
        .toThrow(ValidationError);
    });

    it('should reject local mode without localPath', () => {
      expect(() => validateSudocodeConfig({
        mode: 'local',
      } as any))
        .toThrow(ValidationError);
    });

    it('should reject local mode with empty localPath', () => {
      expect(() => validateSudocodeConfig({
        mode: 'local',
        localPath: '',
      }))
        .toThrow(ValidationError);
    });

    it('should reject non-string version', () => {
      expect(() => validateSudocodeConfig({
        mode: 'npm',
        version: 123 as any,
      }))
        .toThrow(ValidationError);
    });
  });
});

describe('validateServerConfig', () => {
  describe('valid server configurations', () => {
    it('should accept minimal server config', () => {
      expect(() => validateServerConfig({})).not.toThrow();
    });

    it('should accept valid port', () => {
      expect(() => validateServerConfig({
        port: 3000,
      })).not.toThrow();
    });

    it('should accept valid keepAliveHours', () => {
      expect(() => validateServerConfig({
        keepAliveHours: 72,
      })).not.toThrow();
    });

    it('should accept valid idleTimeout', () => {
      expect(() => validateServerConfig({
        idleTimeout: 60,
      })).not.toThrow();
    });

    it('should accept all server options', () => {
      expect(() => validateServerConfig({
        port: 3000,
        keepAliveHours: 168,
        idleTimeout: 30,
      })).not.toThrow();
    });
  });

  describe('invalid server configurations', () => {
    it('should reject missing server config', () => {
      expect(() => validateServerConfig(undefined as any))
        .toThrow(ValidationError);
    });

    it('should reject non-integer port', () => {
      expect(() => validateServerConfig({
        port: 3000.5,
      }))
        .toThrow(ValidationError);
    });

    it('should reject port below 1', () => {
      expect(() => validateServerConfig({
        port: 0,
      }))
        .toThrow(ValidationError);
    });

    it('should reject port above 65535', () => {
      expect(() => validateServerConfig({
        port: 65536,
      }))
        .toThrow(ValidationError);
    });

    it('should reject negative keepAliveHours', () => {
      expect(() => validateServerConfig({
        keepAliveHours: -1,
      }))
        .toThrow(ValidationError);
    });

    it('should reject zero keepAliveHours', () => {
      expect(() => validateServerConfig({
        keepAliveHours: 0,
      }))
        .toThrow(ValidationError);
    });

    it('should reject negative idleTimeout', () => {
      expect(() => validateServerConfig({
        idleTimeout: -1,
      }))
        .toThrow(ValidationError);
    });

    it('should reject zero idleTimeout', () => {
      expect(() => validateServerConfig({
        idleTimeout: 0,
      }))
        .toThrow(ValidationError);
    });
  });
});

describe('validateDeployOptions', () => {
  describe('valid deploy options', () => {
    it('should accept minimal Codespaces options', () => {
      expect(() => validateDeployOptions(minimalCodespacesOptions)).not.toThrow();
    });

    it('should accept complete Codespaces options', () => {
      expect(() => validateDeployOptions(completeCodespacesOptions)).not.toThrow();
    });

    it('should accept options with no agents', () => {
      expect(() => validateDeployOptions(noAgentsOptions)).not.toThrow();
    });

    it('should accept options with Anthropic provider config', () => {
      expect(() => validateDeployOptions(anthropicProviderConfigOptions)).not.toThrow();
    });

    it('should accept options with OpenAI provider config', () => {
      expect(() => validateDeployOptions(openaiProviderConfigOptions)).not.toThrow();
    });

    it('should accept options with Bedrock provider config', () => {
      expect(() => validateDeployOptions(bedrockProviderConfigOptions)).not.toThrow();
    });

    it('should accept options with env var provider config', () => {
      expect(() => validateDeployOptions(envVarProviderConfigOptions)).not.toThrow();
    });

    it('should accept options with combined LLM configs', () => {
      expect(() => validateDeployOptions(combinedLlmConfigOptions)).not.toThrow();
    });

    it('should accept options with workspaceDir', () => {
      const options: DeployOptions = {
        ...minimalCodespacesOptions,
        workspaceDir: '/workspace/custom',
      };
      expect(() => validateDeployOptions(options)).not.toThrow();
    });
  });

  describe('invalid deploy options', () => {
    it('should reject null options', () => {
      expect(() => validateDeployOptions(null as any))
        .toThrow(ValidationError);
    });

    it('should reject non-object options', () => {
      expect(() => validateDeployOptions('invalid' as any))
        .toThrow(ValidationError);
    });

    it('should reject options with invalid git config', () => {
      const options = {
        ...minimalCodespacesOptions,
        git: {
          owner: '',
          repo: 'sudocode',
        },
      };
      expect(() => validateDeployOptions(options))
        .toThrow(ValidationError);
    });

    it('should reject options with invalid agent config', () => {
      const options = {
        ...minimalCodespacesOptions,
        agents: {
          install: ['invalid-agent'],
        },
      };
      expect(() => validateDeployOptions(options))
        .toThrow(ValidationError);
    });

    it('should reject options with invalid model config', () => {
      const options = {
        ...minimalCodespacesOptions,
        models: {
          claudeLtt: 'invalid_token',
        },
      };
      expect(() => validateDeployOptions(options))
        .toThrow(ValidationError);
    });

    it('should reject options with missing providerOptions', () => {
      const options = {
        ...minimalCodespacesOptions,
        providerOptions: undefined as any,
      };
      expect(() => validateDeployOptions(options))
        .toThrow(ValidationError);
    });

    it('should reject options with empty workspaceDir', () => {
      const options = {
        ...minimalCodespacesOptions,
        workspaceDir: '',
      };
      expect(() => validateDeployOptions(options))
        .toThrow(ValidationError);
    });
  });
});
