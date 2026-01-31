/**
 * API key authentication middleware.
 *
 * Validates API key from Authorization header using Bearer scheme.
 * Health check endpoint bypasses authentication.
 *
 * @see s-2aqt - Sudopod Server Implementation specification
 */

import { Request, Response, NextFunction } from 'express';
import { ProviderError } from '../../types/errors.js';

/**
 * Middleware that validates API key from Authorization header.
 * Health check endpoint bypasses authentication.
 */
export function apiKeyAuth(validApiKeys: string[]) {
  return (req: Request, res: Response, next: NextFunction): void => {
    // Skip auth for health check
    if (req.path === '/health' || req.path.endsWith('/health')) {
      next();
      return;
    }

    const authHeader = req.headers.authorization;

    if (!authHeader) {
      throw new ProviderError(
        'Missing Authorization header',
        'AUTHENTICATION_FAILED',
        401
      );
    }

    if (!authHeader.startsWith('Bearer ')) {
      throw new ProviderError(
        'Authorization header must use Bearer scheme',
        'AUTHENTICATION_FAILED',
        401
      );
    }

    const apiKey = authHeader.slice(7); // Remove "Bearer "

    if (!validApiKeys.includes(apiKey)) {
      throw new ProviderError(
        'Invalid API key',
        'AUTHENTICATION_FAILED',
        401
      );
    }

    next();
  };
}
