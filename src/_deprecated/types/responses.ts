/**
 * Response types for the Provider interface.
 *
 * These types define the structure of responses returned by provider implementations.
 * Providers translate their backend-specific format to these standardized types.
 *
 * @see s-7gqg - Provider Interface Contract specification
 */

// ============================================================================
// Workspace Types
// ============================================================================

/**
 * Standardized workspace representation.
 * Providers translate their backend-specific format to this.
 */
export interface Workspace {
  /** Unique workspace identifier */
  id: string;

  /** Human-readable workspace name */
  name: string;

  /** Current workspace status */
  status: WorkspaceStatus;

  /** URLs for accessing the workspace */
  urls: WorkspaceUrls;

  /** ISO 8601 timestamp of creation */
  createdAt: string;

  /** Username of workspace owner */
  owner?: string;

  /** Repository this workspace is based on */
  repository?: string;

  /** Branch checked out */
  branch?: string;
}

/**
 * URLs for accessing a workspace.
 */
export interface WorkspaceUrls {
  /** Main workspace URL (provider dashboard) */
  workspace: string;

  /** Direct IDE/VS Code URL */
  ide?: string;

  /** SSH connection string */
  ssh?: string;

  /** Terminal web URL */
  terminal?: string;
}

/**
 * Workspace lifecycle states.
 */
export type WorkspaceStatus =
  | 'pending' // Workspace is being created
  | 'starting' // Workspace is starting up
  | 'running' // Workspace is ready for use
  | 'stopping' // Workspace is shutting down
  | 'stopped' // Workspace is stopped (can be restarted)
  | 'failed' // Workspace creation/operation failed
  | 'deleting'; // Workspace is being deleted

// ============================================================================
// User Types
// ============================================================================

/**
 * User representation returned by ensureUser.
 */
export interface User {
  /** Unique user identifier */
  id: string;

  /** Username */
  username: string;

  /** User's email address */
  email: string;

  /** User status in the provider's system */
  status: UserStatus;

  /** ISO 8601 timestamp of creation */
  createdAt: string;
}

/**
 * User status in the provider's system.
 */
export type UserStatus =
  | 'active' // User has logged in at least once
  | 'dormant' // User created via API, hasn't logged in yet
  | 'suspended'; // User is suspended
