/**
 * Coder Workspace Mapper
 *
 * Functions to convert Coder API responses to the unified Workspace type.
 *
 * @see s-6q31 - Coder Provider Implementation specification
 * @see i-9qjo - Implement Coder workspace mapper issue
 */

import type {
  Workspace,
  WorkspaceStatus,
  CreateOptions,
} from '../../types.js';

import type {
  CoderWorkspace,
  CoderAgent,
  CoderTemplateVersion,
  RichParameterValue,
  CoderBuildStatus,
} from './types.js';

// ============================================================================
// Status Mapping
// ============================================================================

/**
 * Map Coder build status to unified WorkspaceStatus.
 */
export function mapStatus(status: CoderBuildStatus | string): WorkspaceStatus {
  switch (status) {
    case 'running':
      return 'running';
    case 'starting':
      return 'starting';
    case 'stopped':
      return 'stopped';
    case 'stopping':
      return 'stopping';
    case 'pending':
      return 'creating';
    case 'deleting':
    case 'deleted':
      return 'deleting';
    case 'failed':
    case 'canceled':
    case 'canceling':
      return 'failed';
    default:
      return 'failed';
  }
}

// ============================================================================
// Workspace Mapping
// ============================================================================

/**
 * Map a Coder workspace to the unified Workspace type.
 *
 * @param ws - Coder workspace from the API
 * @param agent - Optional connected agent (for URLs)
 * @param baseUrl - Coder instance base URL
 */
export function mapToWorkspace(
  ws: CoderWorkspace,
  agent?: CoderAgent,
  baseUrl?: string
): Workspace {
  // Extract repository info from metadata
  const repoInfo = extractRepoInfo(ws);

  // Build URLs
  const urls = buildUrls(ws, agent, baseUrl);

  return {
    id: ws.id,
    name: ws.name,
    provider: 'coder',
    status: mapStatus(ws.latest_build.status),
    repository: repoInfo,
    createdAt: new Date(ws.created_at),
    lastActivityAt: ws.last_used_at ? new Date(ws.last_used_at) : undefined,
    urls,
    ssh: {
      command: `coder ssh ${ws.name}`,
    },
  };
}

// ============================================================================
// URL Building
// ============================================================================

/**
 * Build connection URLs for a workspace.
 */
function buildUrls(
  ws: CoderWorkspace,
  agent?: CoderAgent,
  baseUrl?: string
): Workspace['urls'] {
  // Find sudocode app
  const sudocodeApp = agent?.apps?.find(
    (a) => a.slug === 'sudocode' || a.slug.includes('sudocode')
  );

  // Find IDE app (VS Code / code-server)
  // Be specific to avoid matching 'sudocode' which contains 'code'
  const ideApp = agent?.apps?.find(
    (a) =>
      a.slug === 'code-server' ||
      a.slug === 'vscode' ||
      a.slug === 'code' ||
      (a.slug.includes('code') && !a.slug.includes('sudocode'))
  );

  // Build dashboard URL
  const dashboardUrl = baseUrl
    ? `${baseUrl.replace(/\/$/, '')}/@${ws.owner_name}/${ws.name}`
    : undefined;

  // Build default app URLs from base URL if apps not found
  // Coder uses the pattern: https://{agent}--{app}.{domain}
  let sudocodeUrl = sudocodeApp?.url ?? '';
  let ideUrl = ideApp?.url ?? '';

  // If we have a base URL but no app URLs, try to construct them
  if (baseUrl && agent) {
    const url = new URL(baseUrl);
    const domain = url.hostname;

    if (!sudocodeUrl) {
      // Default sudocode URL pattern
      sudocodeUrl = `https://${agent.name}--sudocode.${domain}`;
    }

    if (!ideUrl) {
      // Default code-server URL pattern
      ideUrl = `https://${agent.name}--code.${domain}`;
    }
  }

  return {
    sudocode: sudocodeUrl,
    ide: ideUrl,
    dashboard: dashboardUrl,
  };
}

// ============================================================================
// Repository Extraction
// ============================================================================

/**
 * Extract repository owner/repo from workspace metadata.
 *
 * Looks for a 'repository' key in resource metadata with format "owner/repo".
 */
export function extractRepoInfo(ws: CoderWorkspace): {
  owner: string;
  repo: string;
} {
  // Search through all resources for repository metadata
  for (const resource of ws.latest_build.resources) {
    if (resource.metadata) {
      const repoMeta = resource.metadata.find(
        (m) => m.key === 'repository' || m.key === 'repo'
      );

      if (repoMeta?.value) {
        const parts = repoMeta.value.split('/');
        if (parts.length >= 2) {
          return {
            owner: parts[0],
            repo: parts.slice(1).join('/'),
          };
        }
      }
    }
  }

  // Return empty if not found
  return {
    owner: '',
    repo: '',
  };
}

// ============================================================================
// Parameter Building
// ============================================================================

/**
 * Build rich parameter values from CreateOptions.
 *
 * Maps standard options to Coder template parameters and filters
 * to only include parameters that exist in the template version.
 *
 * @param options - Workspace creation options
 * @param version - Template version with parameter definitions
 */
export function buildParameters(
  options: CreateOptions,
  version: CoderTemplateVersion
): RichParameterValue[] {
  const params: RichParameterValue[] = [];

  // Map resources to common parameter names
  if (options.resources?.cpuCores) {
    params.push({ name: 'cpu', value: String(options.resources.cpuCores) });
  }
  if (options.resources?.memoryGb) {
    params.push({ name: 'memory', value: String(options.resources.memoryGb) });
  }
  if (options.resources?.diskSizeGb) {
    params.push({
      name: 'disk_size',
      value: String(options.resources.diskSizeGb),
    });
  }

  // Map repository
  const repoValue = `${options.repository.owner}/${options.repository.repo}`;
  params.push({ name: 'repository', value: repoValue });

  if (options.repository.branch) {
    params.push({ name: 'branch', value: options.repository.branch });
  }

  // Pass through provider params (except 'template' which is handled separately)
  if (options.providerParams) {
    for (const [key, value] of Object.entries(options.providerParams)) {
      if (key !== 'template' && value !== undefined && value !== null) {
        params.push({ name: key, value: String(value) });
      }
    }
  }

  // Get valid parameter names from template version
  const validParamNames = new Set(
    version.job.rich_parameter_values?.map((p) => p.name) ?? []
  );

  // Also check parameters array if available
  if (version.parameters) {
    for (const param of version.parameters) {
      validParamNames.add(param.name);
    }
  }

  // Filter to only valid parameters
  return params.filter((p) => validParamNames.has(p.name));
}

/**
 * Build parameters without filtering (for when template version is unknown).
 * Used when you want to pass all parameters and let the API validate.
 */
export function buildParametersUnfiltered(
  options: CreateOptions
): RichParameterValue[] {
  const params: RichParameterValue[] = [];

  // Map resources
  if (options.resources?.cpuCores) {
    params.push({ name: 'cpu', value: String(options.resources.cpuCores) });
  }
  if (options.resources?.memoryGb) {
    params.push({ name: 'memory', value: String(options.resources.memoryGb) });
  }
  if (options.resources?.diskSizeGb) {
    params.push({
      name: 'disk_size',
      value: String(options.resources.diskSizeGb),
    });
  }

  // Map repository
  const repoValue = `${options.repository.owner}/${options.repository.repo}`;
  params.push({ name: 'repository', value: repoValue });

  if (options.repository.branch) {
    params.push({ name: 'branch', value: options.repository.branch });
  }

  // Pass through provider params
  if (options.providerParams) {
    for (const [key, value] of Object.entries(options.providerParams)) {
      if (key !== 'template' && value !== undefined && value !== null) {
        params.push({ name: key, value: String(value) });
      }
    }
  }

  return params;
}
