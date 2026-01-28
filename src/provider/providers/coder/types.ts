/**
 * Coder API Types
 *
 * TypeScript types for Coder API responses and requests.
 *
 * @see s-6q31 - Coder Provider Implementation specification
 * @see i-94w3 - Define Coder API types issue
 */

// ============================================================================
// User Types
// ============================================================================

/**
 * Coder user response from /api/v2/users/me or /api/v2/users/{user}
 */
export interface CoderUser {
  id: string;
  username: string;
  email: string;
  /** User's organization memberships */
  organization_ids: string[];
  created_at: string;
  status: 'active' | 'suspended' | 'dormant';
}

// ============================================================================
// Workspace Types
// ============================================================================

/**
 * Coder workspace build status values.
 * @see https://coder.com/docs/api/schemas#workspacebuildstatus
 */
export type CoderBuildStatus =
  | 'pending'
  | 'starting'
  | 'running'
  | 'stopping'
  | 'stopped'
  | 'failed'
  | 'canceling'
  | 'canceled'
  | 'deleting'
  | 'deleted';

/**
 * Coder agent status values.
 */
export type CoderAgentStatus =
  | 'connecting'
  | 'connected'
  | 'disconnected'
  | 'timeout';

/**
 * Coder workspace application (port forward or web app).
 */
export interface CoderApp {
  slug: string;
  display_name: string;
  /** URL for accessing the app (when available) */
  url: string;
  /** External URL if app is externally accessible */
  external?: boolean;
  /** Icon URL */
  icon?: string;
  /** Health status */
  health: 'disabled' | 'initializing' | 'healthy' | 'unhealthy';
}

/**
 * Coder workspace agent running in a resource.
 */
export interface CoderAgent {
  id: string;
  name: string;
  status: CoderAgentStatus;
  /** Architecture (e.g., "amd64", "arm64") */
  architecture: string;
  /** Operating system */
  operating_system: string;
  /** Apps exposed by this agent */
  apps?: CoderApp[];
  /** First connected timestamp */
  first_connected_at?: string;
  /** Last connected timestamp */
  last_connected_at?: string;
  /** Directory the agent started in */
  directory?: string;
}

/**
 * Metadata key-value pairs on resources.
 */
export interface CoderResourceMetadata {
  key: string;
  value: string;
  sensitive?: boolean;
}

/**
 * Coder workspace resource (e.g., VM, container, volume).
 */
export interface CoderResource {
  id: string;
  name: string;
  /** Resource type from Terraform (e.g., "docker_container", "aws_instance") */
  type: string;
  /** Agents running on this resource */
  agents?: CoderAgent[];
  /** Resource metadata */
  metadata?: CoderResourceMetadata[];
  /** Daily cost in USD (if configured) */
  daily_cost?: number;
}

/**
 * Coder workspace build (a deployment/version of the workspace).
 */
export interface CoderWorkspaceBuild {
  id: string;
  /** Build number (increments with each build) */
  build_number: number;
  /** Build transition type */
  transition: 'start' | 'stop' | 'delete';
  status: CoderBuildStatus;
  /** Job ID for this build */
  job_id: string;
  /** Template version used for this build */
  template_version_id: string;
  /** Resources created by this build */
  resources: CoderResource[];
  /** Build creation timestamp */
  created_at: string;
  /** Build completion timestamp */
  updated_at: string;
  /** Workspace deadline (auto-stop time) */
  deadline?: string;
}

/**
 * Coder workspace response.
 */
export interface CoderWorkspace {
  id: string;
  name: string;
  /** Owner username */
  owner_name: string;
  /** Owner ID */
  owner_id: string;
  /** Template ID used to create this workspace */
  template_id: string;
  /** Template name */
  template_name: string;
  /** Template display name */
  template_display_name?: string;
  /** Template icon URL */
  template_icon?: string;
  /** Latest (current) build */
  latest_build: CoderWorkspaceBuild;
  /** Workspace creation timestamp */
  created_at: string;
  /** Last activity timestamp */
  last_used_at?: string;
  /** Organization ID */
  organization_id: string;
  /** Automatic updates enabled */
  automatic_updates: 'always' | 'never';
  /** Whether workspace is outdated (new template version available) */
  outdated: boolean;
  /** Whether workspace is dormant */
  dormant_at?: string;
  /** Workspace TTL in milliseconds */
  ttl_ms?: number;
}

// ============================================================================
// Template Types
// ============================================================================

/**
 * Rich parameter value for template.
 */
export interface RichParameterValue {
  name: string;
  value: string;
}

/**
 * Template parameter definition.
 */
export interface CoderTemplateParameter {
  name: string;
  description?: string;
  type: 'string' | 'number' | 'bool' | 'list(string)';
  default_value?: string;
  required: boolean;
  /** Options for select-type parameters */
  options?: Array<{
    name: string;
    value: string;
    description?: string;
  }>;
  /** Whether this is a mutable parameter (can be changed after create) */
  mutable: boolean;
}

/**
 * Coder template version.
 */
export interface CoderTemplateVersion {
  id: string;
  template_id: string;
  /** Version name */
  name: string;
  /** Job status for this version */
  job: {
    id: string;
    status: 'pending' | 'running' | 'succeeded' | 'canceling' | 'canceled' | 'failed';
    /** Parameter values from the template */
    rich_parameter_values?: RichParameterValue[];
  };
  /** Template parameters defined by this version */
  parameters?: CoderTemplateParameter[];
  created_at: string;
}

/**
 * Coder template response.
 */
export interface CoderTemplate {
  id: string;
  name: string;
  /** Display name */
  display_name?: string;
  /** Template description */
  description?: string;
  /** Template icon URL */
  icon?: string;
  /** Active (current) version ID */
  active_version_id: string;
  /** Organization ID */
  organization_id: string;
  /** Default TTL for workspaces */
  default_ttl_ms?: number;
  /** Maximum TTL allowed */
  max_ttl_ms?: number;
  created_at: string;
  updated_at: string;
}

// ============================================================================
// Request Types
// ============================================================================

/**
 * Request body for creating a workspace.
 * POST /api/v2/organizations/{org}/members/{user}/workspaces
 */
export interface CreateWorkspaceRequest {
  /** Workspace name (must be unique for user) */
  name: string;
  /** Template ID to use */
  template_id: string;
  /** Template version ID (optional - uses active if not specified) */
  template_version_id?: string;
  /** Rich parameter values for the template */
  rich_parameter_values?: RichParameterValue[];
  /** Workspace TTL in milliseconds */
  ttl_ms?: number;
  /** Automatic updates setting */
  automatic_updates?: 'always' | 'never';
}

/**
 * Request body for creating a workspace build (start/stop/delete).
 * POST /api/v2/workspaces/{workspace}/builds
 */
export interface CreateWorkspaceBuildRequest {
  /** Transition type */
  transition: 'start' | 'stop' | 'delete';
  /** Template version ID (for updates) */
  template_version_id?: string;
  /** Rich parameter values (for updates) */
  rich_parameter_values?: RichParameterValue[];
  /** Orphan resources on delete (don't destroy infrastructure) */
  orphan?: boolean;
}

/**
 * Request body for bumping workspace deadline.
 * PUT /api/v2/workspaces/{workspace}/extend
 */
export interface ExtendWorkspaceRequest {
  /** New deadline (RFC3339 timestamp) */
  deadline: string;
}

// ============================================================================
// Response Types
// ============================================================================

/**
 * List workspaces response.
 */
export interface ListWorkspacesResponse {
  workspaces: CoderWorkspace[];
  count: number;
}

/**
 * List templates response.
 */
export interface ListTemplatesResponse {
  templates: CoderTemplate[];
}

// ============================================================================
// Error Types
// ============================================================================

/**
 * Coder API error response structure.
 */
export interface CoderAPIErrorResponse {
  message: string;
  detail?: string;
  validations?: Array<{
    field: string;
    error: string;
  }>;
}
