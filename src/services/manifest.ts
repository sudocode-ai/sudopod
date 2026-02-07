/**
 * Workspace Manifest
 *
 * On-disk manifest that captures the resolved services and configuration
 * for a workspace. Written during create(), read during resume().
 *
 * @see s-4ge4 - Service Registry & Workspace Manifest spec
 */

import type { ResolvedService } from './registry.js';
import type { ExecFn } from '../provider/types.js';

// ============================================================================
// Types
// ============================================================================

export interface WorkspaceManifest {
  version: 1;
  services: ResolvedService[];
  credentials?: { claudeLtt?: string };
  tailscale?: { stateDir: string; controlServer?: string };
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
// Public API
// ============================================================================

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
