/**
 * Sudopod - Stateless library for deploying and managing remote development environments
 */

// Export factory function
export { createProvider } from './core/factory.js';

// Export Provider interface
export type { Provider } from './core/provider.js';

// Export error classes
export {
  SudopodError,
  ProviderNotFoundError,
  DeploymentFailedError,
  AuthenticationError,
  ProviderError,
} from './core/errors.js';

// Export validation utilities
export {
  ValidationError,
  validateDeployOptions,
  validateGitConfig,
  validateAgentConfig,
  validateModelConfig,
  validateSudocodeConfig,
  validateServerConfig,
} from './utils/validation.js';

// Export all types
export type {
  ProviderConfig,
  CodespacesConfig,
  CoderConfig,
  DeployOptions,
  CodespacesDeployOptions,
  CoderDeployOptions,
  Deployment,
  DeploymentStatus,
  DeploymentUrls,
  ListFilters,
} from './types.js';
