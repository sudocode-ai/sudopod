/**
 * Coder REST API Types
 *
 * Typed interfaces mirroring the Coder REST API response shapes.
 * Only fields we consume are typed — the rest are ignored.
 *
 * @see s-9uap - sudopod-coder-sdk specification
 */

// ============================================================================
// Client Config
// ============================================================================

export interface CoderClientConfig {
  /** Coder instance URL (e.g., "https://coder.company.com") */
  baseUrl: string;

  /** Coder session token — sent as `Coder-Session-Token` header */
  token: string;
}

// ============================================================================
// Workspace Types
// ============================================================================

/** Workspace status derived from latest_build job status + transition */
export type CoderWorkspaceStatus =
  | 'pending'
  | 'starting'
  | 'running'
  | 'stopping'
  | 'stopped'
  | 'deleting'
  | 'deleted'
  | 'canceling'
  | 'canceled'
  | 'failed';

export type WorkspaceTransition = 'start' | 'stop' | 'delete';

export interface CoderWorkspace {
  id: string;
  name: string;
  owner_id: string;
  owner_name: string;
  organization_id: string;
  template_id: string;
  template_name: string;
  template_display_name: string;
  created_at: string;
  updated_at: string;
  last_used_at: string;
  latest_build: CoderWorkspaceBuild;
  ttl_ms?: number;
  deleting_at?: string;
  dormant_at?: string;
  health: {
    healthy: boolean;
    failing_agents: string[];
  };
}

export interface CoderWorkspaceBuild {
  id: string;
  build_number: number;
  transition: WorkspaceTransition;
  status: CoderWorkspaceStatus;
  created_at: string;
  updated_at: string;
  resources: CoderWorkspaceResource[];
  deadline?: string;
  max_deadline?: string;
  job: CoderProvisionerJob;
}

export interface CoderProvisionerJob {
  id: string;
  status: 'pending' | 'running' | 'succeeded' | 'canceling' | 'canceled' | 'failed' | 'unknown';
  error?: string;
  error_code?: string;
}

export interface CoderWorkspaceResource {
  id: string;
  name: string;
  type: string;
  agents?: CoderWorkspaceAgent[];
  metadata?: Array<{ key: string; value: string; sensitive: boolean }>;
}

export interface CoderWorkspaceAgent {
  id: string;
  name: string;
  status: 'connecting' | 'connected' | 'disconnected' | 'timeout';
  lifecycle_state:
    | 'created'
    | 'starting'
    | 'start_timeout'
    | 'start_error'
    | 'ready'
    | 'shutting_down'
    | 'shutdown_timeout'
    | 'shutdown_error'
    | 'off';
  architecture: string;
  operating_system: string;
  apps: CoderWorkspaceApp[];
  first_connected_at?: string;
  last_connected_at?: string;
  disconnected_at?: string;
}

export interface CoderWorkspaceApp {
  slug: string;
  display_name: string;
  url: string;
  external: boolean;
  health: string;
}

// ============================================================================
// Template Types
// ============================================================================

export interface CoderTemplate {
  id: string;
  name: string;
  display_name: string;
  organization_id: string;
  active_version_id: string;
  description: string;
  default_ttl_ms: number;
  activity_bump_ms: number;
}

export interface CoderTemplateVersion {
  id: string;
  name: string;
  template_id: string;
  created_at: string;
  job: CoderProvisionerJob;
}

// ============================================================================
// User Types
// ============================================================================

export interface CoderUser {
  id: string;
  username: string;
  name: string;
  email: string;
  status: 'active' | 'dormant' | 'suspended';
  login_type: string;
  organization_ids: string[];
  created_at: string;
  last_seen_at?: string;
}

// ============================================================================
// Request Param Types
// ============================================================================

export interface CreateWorkspaceParams {
  /** Organization ID or name. Required. */
  organizationId: string;

  /**
   * Username of the workspace owner.
   * Self-hosted flow: always "me"
   * Hub flow: the username of the resolved/created user
   */
  username: string;

  /** Workspace name. Must be unique per owner. */
  name: string;

  /** Template ID (UUID). Uses the template's active version. */
  templateId: string;

  /** Template parameter values. Passed through to Coder provisioner. */
  richParameterValues?: Array<{ name: string; value: string }>;

  /** Time-to-live in milliseconds. */
  ttlMs?: number;

  /** Autostart schedule (cron format). */
  autostartSchedule?: string;
}

export interface ListWorkspacesParams {
  /** Coder search query (e.g., "owner:me status:running") */
  query?: string;
  limit?: number;
  offset?: number;
}

export interface ListWorkspacesResponse {
  workspaces: CoderWorkspace[];
  count: number;
}

export interface CreateBuildParams {
  workspaceId: string;
  transition: WorkspaceTransition;

  /** Override template version (optional — defaults to current). */
  templateVersionId?: string;

  /** Rich parameters for this build (optional). */
  richParameterValues?: Array<{ name: string; value: string }>;
}

export interface WaitForBuildParams {
  workspaceId: string;
  /** Desired workspace status to wait for. */
  targetStatus: CoderWorkspaceStatus;
  /** Polling interval in ms. Default: 2000. */
  pollIntervalMs?: number;
  /** Timeout in ms. Default: 300000 (5 minutes). */
  timeoutMs?: number;
}

// ============================================================================
// User Request Param Types
// ============================================================================

export interface ListUsersParams {
  query?: string;
  limit?: number;
  offset?: number;
}

export interface ListUsersResponse {
  users: CoderUser[];
  count: number;
}

export interface CreateUserParams {
  email: string;
  username: string;

  /** Display name. Optional. */
  name?: string;

  /**
   * Login type. Default: "none" (headless user).
   * Hub flow: "none" — hub creates headless users and manages tokens.
   */
  loginType?: 'password' | 'github' | 'oidc' | 'none';

  /** Organization IDs to assign user to. */
  organizationIds?: string[];
}
