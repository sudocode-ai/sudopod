/**
 * Express error handler middleware.
 *
 * Maps ProviderError and ValidationError to appropriate HTTP responses.
 * Unknown errors return a generic 500 to avoid leaking internal details.
 *
 * @see s-2aqt - Sudopod Server Implementation specification
 */

import { Request, Response, NextFunction } from 'express';
import { ProviderError } from '../../types/errors.js';

/**
 * Express error handler that maps ProviderError to HTTP responses.
 * ProviderError already carries statusCode, so we use it directly.
 */
export function errorHandler(
  error: Error,
  req: Request,
  res: Response,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  next: NextFunction
): void {
  // Log error for debugging (in production, use proper logger)
  console.error(`[${req.method} ${req.path}] Error:`, error.message);

  if (error instanceof ProviderError) {
    res.status(error.statusCode).json({
      error: error.message,
      code: error.code,
    });
    return;
  }

  // Validation errors from our validation layer
  if (error.name === 'ValidationError') {
    res.status(400).json({
      error: error.message,
      code: 'INVALID_REQUEST',
    });
    return;
  }

  // Unknown errors - don't leak details
  res.status(500).json({
    error: 'Internal server error',
    code: 'INTERNAL_ERROR',
  });
}
