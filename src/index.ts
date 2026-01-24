/**
 * Sudopod - Stateless library for deploying and managing remote development environments
 */

// Export factory function (new name + deprecated alias)
export { createConnector } from './core/factory.js';
/** @deprecated Use createConnector instead */
export { createConnector as createProvider } from './core/factory.js';

// Export Connector interface (new name + deprecated alias)
export type { Connector } from './core/connector.js';
/** @deprecated Use Connector instead. Note: For the new host-side Provider interface, import from 'sudopod/types' */
export type { Connector as Provider } from './core/connector.js';

// Export error classes (new names + deprecated aliases)
export {
  SudopodError,
  ConnectorNotFoundError,
  DeploymentFailedError,
  AuthenticationError,
  ConnectorError,
  // Deprecated aliases
  ProviderNotFoundError,
} from './core/errors.js';

// Note: ProviderError is now exported from './types/provider.js' for the host-side Provider interface
// The old ConnectorError alias 'ProviderError' is removed to avoid confusion

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

// Export all types (new names + deprecated aliases)
export type {
  ConnectorConfig,
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

// ============================================================================
// Provider Interface Contract (host-side types)
// ============================================================================
// These types are for provider implementations (e.g., CoderProvider in coder-infra)
// that run on the host side. See s-7gqg for the specification.

// Re-export Provider interface types
// Note: To avoid naming collision with the deprecated Connector alias,
// provider implementers should import directly from 'sudopod/types'
export type {
  // Provider interface
  Provider as HostProvider,
  // Request types
  CreateWorkspaceRequest,
  UserIdentity,
  EnsureUserRequest,
  ListWorkspacesFilter,
  // Response types
  Workspace,
  WorkspaceUrls,
  WorkspaceStatus,
  User,
  UserStatus,
  // Error types
  ProviderErrorCode,
} from './types/index.js';

export {
  ProviderError,
  WorkspaceNotFoundError,
  UserNotFoundError,
  UserAlreadyExistsError,
} from './types/index.js';
