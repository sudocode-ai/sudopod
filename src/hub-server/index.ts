/**
 * Mock Hub Server
 *
 * Express server that exposes the Provider interface as HTTP endpoints,
 * delegating to CoderOrchestrator for workspace operations.
 *
 * @see s-7utm - Mock Hub Server + HubProvider Implementation
 */

export { createHubServer } from './server.js';
export type { HubServerConfig } from './types.js';
