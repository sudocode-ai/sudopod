/**
 * Sudopod - Unified workspace provider for remote development environments
 *
 * @see s-9cl3 - Unified Workspace Provider Architecture specification
 */

// ============================================================================
// Provider Interface
// ============================================================================

export type { Provider } from './provider/index.js';

// ============================================================================
// Provider Configs
// ============================================================================

export type {
  CodespacesConfig,
  CoderConfig,
  HubConfig,
} from './provider/index.js';

// ============================================================================
// Create Types
// ============================================================================

export type {
  CreateOptions,
  SetupConfig,
  ServiceConfig,
} from './provider/index.js';

// ============================================================================
// Service Types
// ============================================================================

export type {
  ServiceType,
  ServiceDefinition,
  ResolvedService,
  WorkspaceManifest,
} from './services/index.js';

export {
  getServiceDefinition,
  resolveService,
  getBuiltInServiceNames,
  MANIFEST_PATH,
  writeManifest,
  readManifest,
} from './services/index.js';

// ============================================================================
// Workspace Types
// ============================================================================

export type {
  Workspace,
  WorkspaceStatus,
  ListWorkspacesOptions,
} from './provider/index.js';

// ============================================================================
// Factory Function
// ============================================================================

export { createProvider } from './provider/index.js';

// ============================================================================
// Provider Implementations
// ============================================================================

export { CodespacesProvider } from './provider/index.js';

// ============================================================================
// Error Classes
// ============================================================================

export {
  ProviderError,
  WorkspaceNotFoundError,
  WorkspaceCreationError,
  WorkspaceTimeoutError,
  WorkspaceStateError,
  AuthenticationError,
  AuthorizationError,
  ConfigurationError,
  ConnectionError,
  PortForwardingError,
  ExecutionError,
} from './provider/index.js';
