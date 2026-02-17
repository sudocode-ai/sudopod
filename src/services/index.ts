/**
 * Services module exports.
 *
 * @see s-4ge4 - Service Registry & Workspace Manifest spec
 */

// Registry
export type { ServiceType, ServiceDefinition, ResolvedService } from './registry.js';
export { getServiceDefinition, resolveService, getBuiltInServiceNames } from './registry.js';

// Manifest
export type { WorkspaceManifest, BuildManifestOptions } from './manifest.js';
export { MANIFEST_PATH, buildManifest, writeManifest, readManifest } from './manifest.js';
