/**
 * Provider module exports.
 *
 * This module exports the unified Provider interface and all related types
 * for workspace management.
 *
 * @see s-9cl3 - Unified Workspace Provider Architecture specification
 */

// Provider interface
export type { Provider } from './types.js';

// Provider configs
export type {
  CodespacesConfig,
  CoderConfig,
  HubConfig,
} from './types.js';

// Create types
export type { CreateOptions, SetupConfig, ServiceConfig } from './types.js';

// Workspace types
export type {
  Workspace,
  WorkspaceStatus,
  ListWorkspacesOptions,
} from './types.js';

// Error classes
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
} from './errors.js';

// Factory function
export { createProvider } from './factory.js';

// Provider implementations
export { CodespacesProvider } from './codespaces/index.js';
export { CoderProvider } from './coder/index.js';
