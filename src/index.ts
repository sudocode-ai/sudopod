/**
 * Sudopod - Stateless library for deploying and managing remote development environments
 */

// Export factory function
export { createConnector } from './core/factory.js';

// Export Connector interface
export type { Connector } from './core/connector.js';

// Export error classes
export {
  SudopodError,
  ConnectorNotFoundError,
  DeploymentFailedError,
  AuthenticationError,
  ConnectorError,
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
  ConnectorConfig,
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

export type {
  // Provider interface
  Provider,
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

// ============================================================================
// Server Factory (for provider hosts)
// ============================================================================
// These exports are for creating HTTP servers that expose a Provider.
// See s-2aqt for the specification.

export { createServer } from './server/index.js';
export type { ServerConfig } from './server/index.js';
