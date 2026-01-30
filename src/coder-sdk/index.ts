/**
 * sudopod-coder-sdk
 *
 * Shared library wrapping the Coder REST API into typed primitives.
 * Used by both the self-hosted Coder provider and the sudocode-hub server.
 *
 * @see s-9uap - sudopod-coder-sdk specification
 */

export { CoderApiError } from './errors.js';
export { CoderClient } from './client.js';
export { mapCoderStatusToWorkspaceStatus, mapCoderWorkspaceToWorkspace } from './mapper.js';
export type { MapWorkspaceOptions } from './mapper.js';

export type {
  // Client config
  CoderClientConfig,

  // Workspace types
  CoderWorkspaceStatus,
  WorkspaceTransition,
  CoderWorkspace,
  CoderWorkspaceBuild,
  CoderProvisionerJob,
  CoderWorkspaceResource,
  CoderWorkspaceAgent,
  CoderWorkspaceApp,

  // Template types
  CoderTemplate,
  CoderTemplateVersion,

  // User types
  CoderUser,

  // Request/response param types
  CreateWorkspaceParams,
  ListWorkspacesParams,
  ListWorkspacesResponse,
  CreateBuildParams,
  WaitForBuildParams,
  ListUsersParams,
  ListUsersResponse,
  CreateUserParams,
} from './types.js';
