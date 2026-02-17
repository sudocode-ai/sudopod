/**
 * Workspace Manifest
 *
 * On-disk manifest that captures the resolved services and configuration
 * for a workspace. Written during create(), read during resume().
 *
 * @see s-4ge4 - Service Registry & Workspace Manifest spec
 */

import type { ResolvedService } from './registry.js';
import { resolveService } from './registry.js';
import type { ExecFn } from '../provider/types.js';
import type { ServiceConfig } from '../provider/types.js';

// ============================================================================
// Types
// ============================================================================

export interface WorkspaceManifest {
  version: 1;
  services: ResolvedService[];
  /** Resolved repository directory path. Used as working directory for services. */
  workspaceDir?: string;
  credentials?: { claudeLtt?: string };
  tailscale?: {
    stateDir: string;
    controlServer?: string;
    mode?: 'userspace' | 'kernel';
    /** Resolved Tailscale IP from Headscale (e.g., "100.64.0.2") */
    ip?: string;
    /** Headscale node ID (numeric string) */
    nodeId?: string;
    /** Node name on the tailnet */
    nodeName?: string;
  };
  lifecycle?: { idleTimeoutMinutes?: number };
  setupScript?: string;
  createdAt: string;
}

// ============================================================================
// Constants
// ============================================================================

export const DEFAULT_MANIFEST_PATH = '/workspaces/.sudopod/manifest.json';

/** @deprecated Use DEFAULT_MANIFEST_PATH */
export const MANIFEST_PATH = DEFAULT_MANIFEST_PATH;

// ============================================================================
// Build Manifest Options
// ============================================================================

/**
 * Options for building a workspace manifest.
 * Accepts unresolved ServiceConfig entries — services are resolved
 * internally by buildManifest() using the service registry.
 */
export interface BuildManifestOptions {
  /** Services to resolve and include in the manifest. */
  services: ServiceConfig[];

  /** Resolved repository directory path. */
  workspaceDir?: string;

  /** Credentials to store in the manifest. */
  credentials?: { claudeLtt?: string };

  /**
   * Tailscale configuration — includes both setup config and
   * post-setup discovery results (IP, node ID, node name).
   */
  tailscale?: {
    stateDir: string;
    controlServer?: string;
    mode?: 'userspace' | 'kernel';
    ip?: string;
    nodeId?: string;
    nodeName?: string;
  };

  /** Lifecycle configuration. */
  lifecycle?: { idleTimeoutMinutes?: number };

  /** User setup script (stored for reference). */
  setupScript?: string;
}

// ============================================================================
// Public API
// ============================================================================

/**
 * Build a workspace manifest from options.
 * Resolves service configs via the service registry and constructs
 * a complete WorkspaceManifest ready to be written to disk.
 *
 * This centralizes manifest construction so all providers produce
 * identical manifests from the same inputs.
 */
export function buildManifest(options: BuildManifestOptions): WorkspaceManifest {
  const resolvedServices = options.services.map(
    svc => resolveService(svc.name, svc.port),
  );

  return {
    version: 1,
    services: resolvedServices,
    workspaceDir: options.workspaceDir,
    credentials: options.credentials,
    tailscale: options.tailscale,
    lifecycle: options.lifecycle,
    setupScript: options.setupScript,
    createdAt: new Date().toISOString(),
  };
}

/**
 * Write a workspace manifest to disk inside the workspace.
 * Creates the parent directory if needed. Uses base64 encoding
 * to safely pass JSON through shell exec (same pattern as credential writing).
 */
export async function writeManifest(
  name: string,
  exec: ExecFn,
  manifest: WorkspaceManifest,
  manifestPath: string = DEFAULT_MANIFEST_PATH,
): Promise<void> {
  const json = JSON.stringify(manifest, null, 2);
  const encoded = Buffer.from(json).toString('base64');
  await exec(name, `mkdir -p $(dirname ${manifestPath})`);
  await exec(name, `echo "${encoded}" | base64 -d > ${manifestPath}`);
}

/**
 * Read a workspace manifest from disk. Returns null if the file
 * is missing or contains invalid JSON (backward compat with
 * pre-manifest workspaces).
 */
export async function readManifest(
  name: string,
  exec: ExecFn,
  manifestPath: string = DEFAULT_MANIFEST_PATH,
): Promise<WorkspaceManifest | null> {
  const result = await exec(name, `cat ${manifestPath} 2>/dev/null || true`);
  const raw = result.stdout.trim();
  if (!raw) return null;

  try {
    return JSON.parse(raw) as WorkspaceManifest;
  } catch {
    return null;
  }
}
