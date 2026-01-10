/**
 * Input validation utilities for DeployOptions and related types
 */

import type { DeployOptions } from '../types.js';
import { SudopodError } from '../core/errors.js';

/**
 * Validation error class
 */
export class ValidationError extends SudopodError {
  /**
   * Creates a new ValidationError
   * @param field - The field that failed validation
   * @param reason - The reason for validation failure
   */
  constructor(field: string, reason: string) {
    super(`Validation failed for ${field}: ${reason}`, 'VALIDATION_ERROR');
    this.name = 'ValidationError';
  }
}

/**
 * Supported agent identifiers
 */
const SUPPORTED_AGENTS = ['claude'] as const;

/**
 * Validates git repository configuration
 * @param git - Git configuration to validate
 * @throws ValidationError if validation fails
 */
export function validateGitConfig(git: DeployOptions['git']): void {
  if (!git) {
    throw new ValidationError('git', 'Git configuration is required');
  }

  if (!git.owner || typeof git.owner !== 'string' || git.owner.trim() === '') {
    throw new ValidationError('git.owner', 'Owner must be a non-empty string');
  }

  if (!git.repo || typeof git.repo !== 'string' || git.repo.trim() === '') {
    throw new ValidationError('git.repo', 'Repository name must be a non-empty string');
  }

  // Validate branch format if provided
  if (git.branch !== undefined) {
    if (typeof git.branch !== 'string' || git.branch.trim() === '') {
      throw new ValidationError('git.branch', 'Branch must be a non-empty string when provided');
    }

    // Basic branch name validation (no spaces, no special git characters)
    const invalidBranchChars = /[\s~^:?*\[\\]/;
    if (invalidBranchChars.test(git.branch)) {
      throw new ValidationError(
        'git.branch',
        'Branch name contains invalid characters (spaces, ~, ^, :, ?, *, [, \\)'
      );
    }
  }
}

/**
 * Validates agent configuration
 * @param agents - Agent configuration to validate
 * @throws ValidationError if validation fails
 */
export function validateAgentConfig(agents?: DeployOptions['agents']): void {
  // Agent config is optional
  if (agents === undefined) {
    return;
  }

  if (!agents.install) {
    throw new ValidationError('agents.install', 'Install array is required when agents config is provided');
  }

  if (!Array.isArray(agents.install)) {
    throw new ValidationError('agents.install', 'Install must be an array');
  }

  // Empty array is valid (no agents to install)
  if (agents.install.length === 0) {
    return;
  }

  // Validate each agent identifier
  for (const agentId of agents.install) {
    if (typeof agentId !== 'string') {
      throw new ValidationError('agents.install', 'All agent identifiers must be strings');
    }

    if (!SUPPORTED_AGENTS.includes(agentId as any)) {
      throw new ValidationError(
        'agents.install',
        `Unsupported agent identifier: "${agentId}". Supported agents: ${SUPPORTED_AGENTS.join(', ')}`
      );
    }
  }
}

/**
 * Validates LLM/model configuration
 * @param models - Model configuration to validate
 * @throws ValidationError if validation fails
 */
export function validateModelConfig(models?: DeployOptions['models']): void {
  // Model config is optional
  if (models === undefined) {
    return;
  }

  // All fields are optional and can coexist (no mutual exclusivity)
  
  // Validate claudeLtt if provided
  if (models.claudeLtt !== undefined) {
    if (typeof models.claudeLtt !== 'string' || models.claudeLtt.trim() === '') {
      throw new ValidationError('models.claudeLtt', 'Claude LTT must be a non-empty string when provided');
    }

    // Basic LTT format validation (should start with "ltt_")
    if (!models.claudeLtt.startsWith('ltt_')) {
      throw new ValidationError(
        'models.claudeLtt',
        'Claude LTT should start with "ltt_". Did you mean to use providerConfig instead?'
      );
    }
  }

  // Validate providerConfig if provided
  if (models.providerConfig !== undefined) {
    if (typeof models.providerConfig !== 'object' || models.providerConfig === null) {
      throw new ValidationError('models.providerConfig', 'Provider config must be an object when provided');
    }

    if (Array.isArray(models.providerConfig)) {
      throw new ValidationError('models.providerConfig', 'Provider config must be an object, not an array');
    }

    // Validate that it has at least some content
    if (Object.keys(models.providerConfig).length === 0) {
      throw new ValidationError(
        'models.providerConfig',
        'Provider config object is empty. Include at least a "provider" field to specify the LLM provider.'
      );
    }

    // Helpful validation for common provider formats
    const provider = models.providerConfig.provider;
    if (provider) {
      switch (provider) {
        case 'anthropic':
          if (!models.providerConfig.apiKey) {
            throw new ValidationError(
              'models.providerConfig',
              'Anthropic provider requires "apiKey" field'
            );
          }
          break;
        case 'openai':
          if (!models.providerConfig.apiKey) {
            throw new ValidationError(
              'models.providerConfig',
              'OpenAI provider requires "apiKey" field'
            );
          }
          break;
        case 'bedrock':
          if (!models.providerConfig.region) {
            throw new ValidationError(
              'models.providerConfig',
              'AWS Bedrock provider requires "region" field'
            );
          }
          if (!models.providerConfig.accessKeyId || !models.providerConfig.secretAccessKey) {
            throw new ValidationError(
              'models.providerConfig',
              'AWS Bedrock provider requires "accessKeyId" and "secretAccessKey" fields'
            );
          }
          break;
      }
    }
  }

  // Validate providerConfigEnvVar if provided
  if (models.providerConfigEnvVar !== undefined) {
    if (typeof models.providerConfigEnvVar !== 'string' || models.providerConfigEnvVar.trim() === '') {
      throw new ValidationError(
        'models.providerConfigEnvVar',
        'Provider config environment variable name must be a non-empty string when provided'
      );
    }

    // Basic env var name validation (alphanumeric and underscore)
    const validEnvVarName = /^[A-Z_][A-Z0-9_]*$/;
    if (!validEnvVarName.test(models.providerConfigEnvVar)) {
      throw new ValidationError(
        'models.providerConfigEnvVar',
        'Environment variable name should contain only uppercase letters, numbers, and underscores, and start with a letter or underscore'
      );
    }
  }
}

/**
 * Validates sudocode installation configuration
 * @param sudocode - Sudocode configuration to validate
 * @param isDevMode - Whether dev mode is enabled (localPath optional in dev mode)
 * @throws ValidationError if validation fails
 */
export function validateSudocodeConfig(sudocode: DeployOptions['sudocode'], isDevMode: boolean = false): void {
  if (!sudocode) {
    throw new ValidationError('sudocode', 'Sudocode configuration is required');
  }

  if (!sudocode.mode || (sudocode.mode !== 'npm' && sudocode.mode !== 'local')) {
    throw new ValidationError('sudocode.mode', 'Mode must be either "npm" or "local"');
  }

  if (sudocode.mode === 'npm') {
    if (sudocode.version && typeof sudocode.version !== 'string') {
      throw new ValidationError('sudocode.version', 'Version must be a string when provided');
    }
  }

  if (sudocode.mode === 'local') {
    // In dev mode, localPath is optional (will use the checked-out repository)
    // In non-dev mode, localPath is required
    if (!isDevMode && (!sudocode.localPath || typeof sudocode.localPath !== 'string' || sudocode.localPath.trim() === '')) {
      throw new ValidationError('sudocode.localPath', 'Local path is required for local mode and must be a non-empty string');
    }
    
    // If localPath is provided, validate it's a non-empty string
    if (sudocode.localPath !== undefined && (typeof sudocode.localPath !== 'string' || sudocode.localPath.trim() === '')) {
      throw new ValidationError('sudocode.localPath', 'Local path must be a non-empty string when provided');
    }
  }
}

/**
 * Validates server configuration
 * @param server - Server configuration to validate
 * @throws ValidationError if validation fails
 */
export function validateServerConfig(server: DeployOptions['server']): void {
  if (!server) {
    throw new ValidationError('server', 'Server configuration is required');
  }

  if (server.port !== undefined) {
    if (typeof server.port !== 'number' || !Number.isInteger(server.port)) {
      throw new ValidationError('server.port', 'Port must be an integer when provided');
    }

    if (server.port < 1 || server.port > 65535) {
      throw new ValidationError('server.port', 'Port must be between 1 and 65535');
    }
  }

  if (server.keepAliveHours !== undefined) {
    if (typeof server.keepAliveHours !== 'number' || server.keepAliveHours <= 0) {
      throw new ValidationError('server.keepAliveHours', 'Keep alive hours must be a positive number when provided');
    }
  }

  if (server.idleTimeout !== undefined) {
    if (typeof server.idleTimeout !== 'number' || server.idleTimeout <= 0) {
      throw new ValidationError('server.idleTimeout', 'Idle timeout must be a positive number when provided');
    }
  }
}

/**
 * Validates complete DeployOptions
 * @param options - Deploy options to validate
 * @throws ValidationError if validation fails
 */
export function validateDeployOptions(options: DeployOptions): void {
  if (!options || typeof options !== 'object') {
    throw new ValidationError('options', 'Deploy options must be an object');
  }

  // Validate each section
  validateGitConfig(options.git);
  validateAgentConfig(options.agents);
  validateModelConfig(options.models);
  validateSudocodeConfig(options.sudocode, options.dev === true);
  validateServerConfig(options.server);

  // Validate workspace directory if provided
  if (options.workspaceDir !== undefined) {
    if (typeof options.workspaceDir !== 'string' || options.workspaceDir.trim() === '') {
      throw new ValidationError('workspaceDir', 'Workspace directory must be a non-empty string when provided');
    }
  }

  // Validate dev flag if provided
  if (options.dev !== undefined) {
    if (typeof options.dev !== 'boolean') {
      throw new ValidationError('dev', 'Dev flag must be a boolean when provided');
    }

    // Warn about potential inconsistency between dev flag and sudocode.mode
    if (options.dev === true && options.sudocode.mode !== 'local') {
      throw new ValidationError(
        'dev',
        'Dev mode enabled (dev: true) but sudocode.mode is not "local". ' +
        'When dev is true, sudocode.mode should typically be "local" to install from repository.'
      );
    }

    if (options.dev === false && options.sudocode.mode === 'local') {
      throw new ValidationError(
        'dev',
        'Dev mode disabled (dev: false) but sudocode.mode is "local". ' +
        'When dev is false, sudocode.mode should typically be "npm" for production deployments.'
      );
    }
  }

  // Provider-specific options validation is handled by individual providers
  if (!options.providerOptions) {
    throw new ValidationError('providerOptions', 'Provider-specific options are required');
  }
}
