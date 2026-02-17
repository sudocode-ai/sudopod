/**
 * Mock Hub Server Factory
 *
 * Creates an Express server that exposes the Provider interface as HTTP endpoints,
 * delegating to CoderOrchestrator for all workspace operations.
 *
 * @see s-7utm - Mock Hub Server + HubProvider Implementation
 */

import express from 'express';
import type { Express } from 'express';
import { CoderOrchestrator } from '../coder-sdk/orchestrator.js';
import type { HubServerConfig } from './types.js';
import { createRoutes } from './routes.js';
import { apiKeyAuth, errorHandler } from './middleware.js';

/**
 * Create a mock hub server.
 *
 * The server wraps a CoderOrchestrator and exposes it as HTTP endpoints
 * with Bearer token authentication.
 */
export function createHubServer(config: HubServerConfig): Express {
  const orchestrator = new CoderOrchestrator({
    baseUrl: config.coderUrl,
    token: config.coderToken,
  });

  const app = express();
  app.use(express.json());

  // Health check — registered before auth middleware so it bypasses auth
  app.get('/health', (_req, res) => {
    res.json({ ok: true, timestamp: new Date().toISOString() });
  });

  // Auth middleware for all subsequent routes
  app.use(apiKeyAuth(config.apiKeys));

  // Provider interface routes
  app.use(createRoutes(orchestrator));

  // Error handler (must be last — 4-arg signature)
  app.use(errorHandler);

  return app;
}
