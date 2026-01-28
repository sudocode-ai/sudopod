/**
 * Request types for the Provider interface.
 *
 * These types define the structure of requests sent to provider implementations.
 * CLI provides repository/branch/resources, while hub or self-hosted config
 * provides identity/secrets.
 *
 * @see s-7gqg - Provider Interface Contract specification
 */

import type { WorkspaceStatus } from './responses.js';

// ============================================================================
// Request Types
// ============================================================================

/**
 * Request to create a new workspace.
 * CLI provides repository/branch/resources.
 * Hub or self-hosted config provides identity/secrets.
 */
export interface CreateWorkspaceRequest {
  // === Provided by CLI ===

  /** Repository in "owner/repo" format */
  repository: string;

  /** Branch to clone (default: "main") */
  branch?: string;

  /** CPU cores to allocate */
  cpuCores?: number;

  /** Memory in GB */
  memoryGb?: number;

  /** Disk size in GB */
  diskSizeGb?: number;

  /** Minutes of inactivity before auto-stop */
  idleTimeoutMinutes?: number;

  /** Maximum hours before workspace is deleted */
  maxTtlHours?: number;

  // === User Identity ===

  /**
   * User identity for OIDC-based providers.
   * Injected by hub or provided via self-hosted config.
   */
  userIdentity: UserIdentity;

  // === Secrets & Tokens ===

  /** GitHub token for private repo access */
  githubToken?: string;

  /** Additional secrets to inject into workspace */
  secrets?: Record<string, string>;
}

/**
 * OIDC-compatible user identity.
 * Used to create/match users in the provider's system.
 */
export interface UserIdentity {
  /**
   * OIDC email claim - primary identifier for user matching.
   * When user logs in via Google/Okta, email is matched to pre-created user.
   */
  email?: string;

  /**
   * OIDC subject identifier - IdP's internal user ID.
   * More stable than email (email can change).
   */
  sub?: string;

  /**
   * Preferred username for display purposes.
   */
  username?: string;
}

/**
 * Request to ensure a user exists in the provider's system.
 */
export interface EnsureUserRequest {
  /** User's email address */
  email: string;

  /** Preferred username (derived from email if not provided) */
  username?: string;

  /** Login type - always 'oidc' for our use case */
  loginType: 'oidc';

  /** Organization IDs to add user to (provider-specific) */
  organizationIds?: string[];
}

/**
 * Filters for listing workspaces.
 */
export interface ListWorkspacesFilter {
  /** Filter by owner username or email */
  owner?: string;

  /** Filter by workspace status */
  status?: WorkspaceStatus;

  /** Maximum number of results */
  limit?: number;

  /** Offset for pagination */
  offset?: number;
}
