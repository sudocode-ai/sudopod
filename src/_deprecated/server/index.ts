/**
 * Server factory for exposing a Provider as HTTP endpoints.
 *
 * The server is a thin translation layer - all business logic lives in the provider.
 *
 * @see s-2aqt - Sudopod Server Implementation specification
 */

import express, { Express } from 'express';
import type { Provider } from '../types/provider.js';
import type { ServerConfig } from './config.js';
import { apiKeyAuth } from './middleware/auth.js';
import { errorHandler } from './middleware/error.js';
import { createRoutes } from './routes.js';

/**
 * Creates an Express server that exposes a Provider as HTTP endpoints.
 *
 * @param provider - Any Provider implementation (CoderProvider, etc.)
 * @param config - Server configuration
 * @returns Express app ready to listen()
 */
export function createServer(provider: Provider, config: ServerConfig): Express {
  const app = express();

  app.use(express.json());
  app.use(apiKeyAuth(config.apiKeys));

  const router = createRoutes(provider);
  app.use(config.basePath ?? '', router);

  app.use(errorHandler);

  return app;
}

// Re-export types and middleware for convenience
export type { ServerConfig } from './config.js';
export { apiKeyAuth } from './middleware/auth.js';
export { errorHandler } from './middleware/error.js';
