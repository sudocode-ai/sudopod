/**
 * Hub Server Middleware
 *
 * API key authentication and error handling for the mock hub server.
 *
 * @see s-7utm - Mock Hub Server + HubProvider Implementation
 */

import type { Request, Response, NextFunction } from 'express';
import {
  ProviderError,
  WorkspaceNotFoundError,
  AuthenticationError,
  AuthorizationError,
  WorkspaceCreationError,
  WorkspaceStateError,
  WorkspaceTimeoutError,
} from '../provider/errors.js';

/**
 * API key authentication middleware.
 * Validates `Authorization: Bearer <key>` against the provided list of valid keys.
 */
export function apiKeyAuth(validApiKeys: string[]) {
  return (req: Request, res: Response, next: NextFunction) => {
    const authHeader = req.headers.authorization;

    if (!authHeader) {
      res.status(401).json({ error: 'Missing Authorization header', code: 'AUTHENTICATION_FAILED' });
      return;
    }

    if (!authHeader.startsWith('Bearer ')) {
      res.status(401).json({ error: 'Authorization header must use Bearer scheme', code: 'AUTHENTICATION_FAILED' });
      return;
    }

    const apiKey = authHeader.slice(7);
    if (!validApiKeys.includes(apiKey)) {
      res.status(401).json({ error: 'Invalid API key', code: 'AUTHENTICATION_FAILED' });
      return;
    }

    next();
  };
}

/**
 * Express error handler that maps ProviderError subclasses to HTTP status codes.
 * Must be registered last (4-argument signature).
 */
export function errorHandler(
  error: Error,
  _req: Request,
  res: Response,
  _next: NextFunction,
): void {
  if (error instanceof WorkspaceNotFoundError) {
    res.status(404).json({ error: error.message, code: 'WORKSPACE_NOT_FOUND' });
  } else if (error instanceof AuthenticationError) {
    res.status(401).json({ error: error.message, code: 'AUTHENTICATION_FAILED' });
  } else if (error instanceof AuthorizationError) {
    res.status(403).json({ error: error.message, code: 'AUTHORIZATION_FAILED' });
  } else if (error instanceof WorkspaceCreationError) {
    res.status(409).json({ error: error.message, code: 'WORKSPACE_CREATION_FAILED' });
  } else if (error instanceof WorkspaceStateError) {
    res.status(409).json({ error: error.message, code: 'WORKSPACE_STATE_ERROR' });
  } else if (error instanceof WorkspaceTimeoutError) {
    res.status(504).json({ error: error.message, code: 'TIMEOUT' });
  } else if (error instanceof ProviderError) {
    res.status(500).json({ error: error.message, code: 'PROVIDER_ERROR' });
  } else {
    res.status(500).json({ error: 'Internal server error', code: 'INTERNAL_ERROR' });
  }
}
