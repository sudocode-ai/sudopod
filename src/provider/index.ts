/**
 * Provider module exports.
 *
 * This module exports the unified Provider interface and all related types
 * for workspace management.
 *
 * @see s-9cl3 - Unified Workspace Provider Architecture specification
 */

// Provider interface and type
export type { Provider, ProviderType } from './types.js';

// Configuration types
export type { ProviderConfig, CreateOptions, SetupConfig } from './types.js';

// Runtime types
export type { RuntimeConfig, ResumeOptions, LifecycleConfig } from './types.js';

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
export { CodespacesProvider } from './providers/codespaces.js';
export { CoderProvider } from './providers/coder.js';
