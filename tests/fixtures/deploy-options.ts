/**
 * Shared test fixtures for DeployOptions
 * All fixtures use the new structure with git repo separation
 */

import type { DeployOptions, CodespacesDeployOptions, CoderDeployOptions } from '../../src/types.js';

/**
 * Minimal valid DeployOptions for Codespaces
 */
export const minimalCodespacesOptions: DeployOptions = {
  git: {
    owner: 'anthropics',
    repo: 'sudocode',
  },
  sudocode: {
    mode: 'npm',
    version: 'latest',
  },
  server: {
    port: 3000,
  },
  providerOptions: {
    machine: 'basicLinux32gb',
  } as CodespacesDeployOptions,
};

/**
 * Complete DeployOptions for Codespaces with all optional fields
 */
export const completeCodespacesOptions: DeployOptions = {
  git: {
    owner: 'anthropics',
    repo: 'sudocode',
    branch: 'main',
  },
  workspaceDir: '/workspace/custom',
  agents: {
    install: ['claude'],
  },
  models: {
    claudeLtt: 'ltt_test_token_12345',
  },
  sudocode: {
    mode: 'npm',
    version: '1.2.3',
  },
  server: {
    port: 3000,
    keepAliveHours: 72,
    idleTimeout: 240,
  },
  providerOptions: {
    machine: 'largePremiumLinux',
    retentionPeriod: 14,
  } as CodespacesDeployOptions,
};

/**
 * DeployOptions with local sudocode build
 */
export const localBuildOptions: DeployOptions = {
  git: {
    owner: 'myorg',
    repo: 'my-project',
    branch: 'feature/new-feature',
  },
  sudocode: {
    mode: 'local',
    localPath: '/path/to/sudocode-build.tar.gz',
  },
  server: {
    port: 3000,
  },
  providerOptions: {
    machine: 'basicLinux32gb',
  } as CodespacesDeployOptions,
};

/**
 * DeployOptions with direct provider config (Anthropic)
 */
export const anthropicProviderConfigOptions: DeployOptions = {
  git: {
    owner: 'anthropics',
    repo: 'sudocode',
  },
  models: {
    providerConfig: {
      provider: 'anthropic',
      apiKey: 'sk-ant-test-key-12345',
    },
  },
  sudocode: {
    mode: 'npm',
  },
  server: {
    port: 3000,
  },
  providerOptions: {
    machine: 'basicLinux32gb',
  } as CodespacesDeployOptions,
};

/**
 * DeployOptions with direct provider config (OpenAI)
 */
export const openaiProviderConfigOptions: DeployOptions = {
  git: {
    owner: 'anthropics',
    repo: 'sudocode',
  },
  models: {
    providerConfig: {
      provider: 'openai',
      apiKey: 'sk-test-key-12345',
      baseUrl: 'https://api.openai.com/v1',
    },
  },
  sudocode: {
    mode: 'npm',
  },
  server: {
    port: 3000,
  },
  providerOptions: {
    machine: 'basicLinux32gb',
  } as CodespacesDeployOptions,
};

/**
 * DeployOptions with direct provider config (AWS Bedrock)
 */
export const bedrockProviderConfigOptions: DeployOptions = {
  git: {
    owner: 'anthropics',
    repo: 'sudocode',
  },
  models: {
    providerConfig: {
      provider: 'bedrock',
      region: 'us-east-1',
      accessKeyId: 'AKIAIOSFODNN7EXAMPLE',
      secretAccessKey: 'wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY',
    },
  },
  sudocode: {
    mode: 'npm',
  },
  server: {
    port: 3000,
  },
  providerOptions: {
    machine: 'basicLinux32gb',
  } as CodespacesDeployOptions,
};

/**
 * DeployOptions with provider config from environment variable
 */
export const envVarProviderConfigOptions: DeployOptions = {
  git: {
    owner: 'anthropics',
    repo: 'sudocode',
  },
  models: {
    providerConfigEnvVar: 'LLM_CONFIG',
  },
  sudocode: {
    mode: 'npm',
  },
  server: {
    port: 3000,
  },
  providerOptions: {
    machine: 'basicLinux32gb',
  } as CodespacesDeployOptions,
};

/**
 * DeployOptions with multiple LLM configuration options combined
 */
export const combinedLlmConfigOptions: DeployOptions = {
  git: {
    owner: 'anthropics',
    repo: 'sudocode',
  },
  models: {
    claudeLtt: 'ltt_test_token_12345',
    providerConfig: {
      provider: 'anthropic',
      apiKey: 'sk-ant-test-key-12345',
    },
    providerConfigEnvVar: 'LLM_CONFIG',
  },
  sudocode: {
    mode: 'npm',
  },
  server: {
    port: 3000,
  },
  providerOptions: {
    machine: 'basicLinux32gb',
  } as CodespacesDeployOptions,
};

/**
 * Minimal valid DeployOptions for Coder
 */
export const minimalCoderOptions: DeployOptions = {
  git: {
    owner: 'myorg',
    repo: 'my-project',
  },
  sudocode: {
    mode: 'npm',
  },
  server: {
    port: 3000,
  },
  providerOptions: {
    template: 'sudocode-workspace',
  } as CoderDeployOptions,
};

/**
 * Complete DeployOptions for Coder with all optional fields
 */
export const completeCoderOptions: DeployOptions = {
  git: {
    owner: 'myorg',
    repo: 'my-project',
    branch: 'develop',
  },
  workspaceDir: '/home/coder/project',
  agents: {
    install: ['claude'],
  },
  models: {
    providerConfig: {
      provider: 'bedrock',
      region: 'us-east-1',
      accessKeyId: 'AKIAIOSFODNN7EXAMPLE',
      secretAccessKey: 'wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY',
    },
  },
  sudocode: {
    mode: 'npm',
    version: 'latest',
  },
  server: {
    port: 3000,
    keepAliveHours: 168,
    idleTimeout: 60,
  },
  providerOptions: {
    template: 'sudocode-workspace',
    parameters: {
      region: 'us-west-2',
      instanceType: 'large',
    },
    autoStart: true,
  } as CoderDeployOptions,
};

/**
 * DeployOptions with empty agents array (valid - no agents to install)
 */
export const noAgentsOptions: DeployOptions = {
  git: {
    owner: 'anthropics',
    repo: 'sudocode',
  },
  agents: {
    install: [],
  },
  sudocode: {
    mode: 'npm',
  },
  server: {
    port: 3000,
  },
  providerOptions: {
    machine: 'basicLinux32gb',
  } as CodespacesDeployOptions,
};
