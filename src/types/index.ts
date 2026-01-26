/**
 * Type exports for the Provider interface contract.
 *
 * This module exports all types needed by provider implementations
 * (host-side) such as CoderProvider in coder-infra.
 *
 * @see s-7gqg - Provider Interface Contract specification
 */

// Provider interface
export type { Provider } from './provider.js';

// Request types
export type {
  CreateWorkspaceRequest,
  UserIdentity,
  EnsureUserRequest,
  ListWorkspacesFilter,
} from './requests.js';

// Response types
export type {
  Workspace,
  WorkspaceUrls,
  WorkspaceStatus,
  User,
  UserStatus,
} from './responses.js';

// Error types
export {
  ProviderError,
  WorkspaceNotFoundError,
  WorkspaceAlreadyExistsError,
  UserNotFoundError,
  UserAlreadyExistsError,
  InvalidRequestError,
  QuotaExceededError,
  ProviderUnavailableError,
  AuthenticationFailedError,
  AuthorizationFailedError,
  InternalProviderError,
} from './errors.js';
export type { ProviderErrorCode } from './errors.js';
