/**
 * Service Registry
 *
 * Defines built-in services and provides lookup/resolution for workspace provisioning.
 * Services are resolved by substituting `{port}` tokens in templates.
 *
 * @see s-4ge4 - Service Registry & Workspace Manifest spec
 */

// ============================================================================
// Types
// ============================================================================

export type ServiceType = 'tool' | 'service';

/**
 * A service definition template — contains `{port}` placeholders
 * that get resolved into a ResolvedService.
 */
export interface ServiceDefinition {
  name: string;
  type: ServiceType;
  install: string;
  start?: string;
  check?: string;
  defaultPort?: number;
  healthCheck?: string;
  logFile?: string;
}

/**
 * A fully-resolved service — all `{port}` tokens replaced with actual port numbers.
 * This is what gets written into the workspace manifest.
 */
export interface ResolvedService {
  name: string;
  type: ServiceType;
  install: string;
  start?: string;
  check?: string;
  port?: number;
  healthCheck?: string;
  logFile?: string;
}

// ============================================================================
// Built-in Services
// ============================================================================

const BUILT_IN_SERVICES: Record<string, ServiceDefinition> = {
  sudocode: {
    name: 'sudocode',
    type: 'service',
    install: 'npm install -g sudocode && sudocode init',
    start: 'nohup sudocode server --port {port} > /tmp/sudocode-{port}.log 2>&1',
    check: 'pgrep -f "sudocode server.*--port {port}" || true',
    defaultPort: 3000,
    healthCheck: 'http://localhost:{port}/health',
    logFile: '/tmp/sudocode-{port}.log',
  },
  'claude-code': {
    name: 'claude-code',
    type: 'tool',
    install: 'npm install -g @anthropic-ai/claude-code',
  },
  aider: {
    name: 'aider',
    type: 'tool',
    install: 'pip install aider-chat',
  },
};

// ============================================================================
// Public API
// ============================================================================

/**
 * Get a service definition by name. Returns undefined if not found.
 */
export function getServiceDefinition(name: string): ServiceDefinition | undefined {
  return BUILT_IN_SERVICES[name];
}

/**
 * Resolve a service definition into a ResolvedService by substituting
 * `{port}` tokens with the actual port number.
 *
 * @throws Error if the service name is not found in the registry.
 */
export function resolveService(name: string, portOverride?: number): ResolvedService {
  const def = BUILT_IN_SERVICES[name];
  if (!def) {
    throw new Error(`Unknown service: "${name}". Available: ${getBuiltInServiceNames().join(', ')}`);
  }

  const port = portOverride ?? def.defaultPort;

  function sub(template: string | undefined): string | undefined {
    if (!template || port === undefined) return template;
    return template.replaceAll('{port}', String(port));
  }

  return {
    name: def.name,
    type: def.type,
    install: def.install,
    start: sub(def.start),
    check: sub(def.check),
    port,
    healthCheck: sub(def.healthCheck),
    logFile: sub(def.logFile),
  };
}

/**
 * Get all built-in service names.
 */
export function getBuiltInServiceNames(): string[] {
  return Object.keys(BUILT_IN_SERVICES);
}
