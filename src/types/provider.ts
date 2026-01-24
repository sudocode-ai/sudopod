/**
 * Provider Interface Contract
 *
 * This module defines the TypeScript `Provider` interface that all workspace
 * providers must implement. Providers are host-side implementations that
 * translate standardized workspace requests into backend-specific API calls
 * (e.g., Coder, Kubernetes, etc.).
 *
 * Note: This is distinct from the Connector interface (src/core/connector.ts)
 * which is the CLI-side adapter. Providers run on the host side (e.g., coder-infra).
 *
 * @see s-7gqg - Provider Interface Contract specification
 * @see s-1u2m - Sudopod Provider Architecture (parent spec)
 */

import type {
  CreateWorkspaceRequest,
  EnsureUserRequest,
  ListWorkspacesFilter,
} from './requests.js';
import type { Workspace, User } from './responses.js';

// ============================================================================
// Provider Interface
// ============================================================================

/**
 * The Provider interface that all workspace providers must implement.
 * Providers run on the host side (e.g., coder-infra) and handle the
 * translation from standardized requests to backend-specific APIs.
 */
export interface Provider {
  // === Workspace Lifecycle ===

  /**
   * Create a new workspace for the given user.
   * Provider should ensure user exists (via ensureUser) before creating.
   */
  createWorkspace(req: CreateWorkspaceRequest): Promise<Workspace>;

  /**
   * Get workspace details by ID.
   */
  getWorkspace(id: string): Promise<Workspace>;

  /**
   * Permanently delete a workspace.
   */
  deleteWorkspace(id: string): Promise<void>;

  /**
   * List workspaces, optionally filtered.
   */
  listWorkspaces(filters?: ListWorkspacesFilter): Promise<Workspace[]>;

  // === Workspace State ===

  /**
   * Start a stopped workspace.
   */
  startWorkspace(id: string): Promise<void>;

  /**
   * Stop a running workspace (preserves state).
   */
  stopWorkspace(id: string): Promise<void>;

  // === User Management (Optional) ===

  /**
   * Ensure a user exists in the provider's system.
   * For OIDC providers, creates a dormant user that activates on first login.
   * Optional - not all providers need user management.
   */
  ensureUser?(req: EnsureUserRequest): Promise<User>;
}

// ============================================================================
// Re-exports for convenience
// ============================================================================

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

// Error types (re-exported from errors.ts)
export type { ProviderErrorCode } from './errors.js';
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
