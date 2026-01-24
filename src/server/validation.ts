/**
 * Request validation functions for server endpoints.
 *
 * Validates incoming requests before passing to provider methods.
 * Uses rules from the Provider Interface Contract (s-7gqg).
 *
 * @see s-2aqt - Sudopod Server Implementation specification
 */

import type { CreateWorkspaceRequest, EnsureUserRequest } from '../types/index.js';

/**
 * Error thrown when request validation fails.
 */
export class ValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ValidationError';
  }
}

/**
 * Validates CreateWorkspaceRequest.
 * Throws ValidationError if invalid.
 */
export function validateCreateWorkspaceRequest(body: unknown): CreateWorkspaceRequest {
  if (!body || typeof body !== 'object') {
    throw new ValidationError('Request body must be an object');
  }

  const req = body as Record<string, unknown>;

  // Required: repository
  if (!req.repository || typeof req.repository !== 'string') {
    throw new ValidationError('repository is required and must be a string');
  }

  // Validate repository format: owner/repo
  if (!/^[\w.-]+\/[\w.-]+$/.test(req.repository)) {
    throw new ValidationError('repository must be in "owner/repo" format');
  }

  // Required: userIdentity with at least one field
  if (!req.userIdentity || typeof req.userIdentity !== 'object') {
    throw new ValidationError('userIdentity is required');
  }

  const identity = req.userIdentity as Record<string, unknown>;
  if (!identity.email && !identity.sub && !identity.username) {
    throw new ValidationError(
      'userIdentity must have at least one of: email, sub, username'
    );
  }

  // Optional numeric fields
  if (req.cpuCores !== undefined) {
    if (typeof req.cpuCores !== 'number' || req.cpuCores <= 0 || !Number.isInteger(req.cpuCores)) {
      throw new ValidationError('cpuCores must be a positive integer');
    }
  }

  if (req.memoryGb !== undefined) {
    if (typeof req.memoryGb !== 'number' || req.memoryGb <= 0) {
      throw new ValidationError('memoryGb must be a positive number');
    }
  }

  if (req.diskSizeGb !== undefined) {
    if (typeof req.diskSizeGb !== 'number' || req.diskSizeGb <= 0 || !Number.isInteger(req.diskSizeGb)) {
      throw new ValidationError('diskSizeGb must be a positive integer');
    }
  }

  if (req.idleTimeoutMinutes !== undefined) {
    if (typeof req.idleTimeoutMinutes !== 'number' || req.idleTimeoutMinutes <= 0) {
      throw new ValidationError('idleTimeoutMinutes must be a positive number');
    }
  }

  if (req.maxTtlHours !== undefined) {
    if (typeof req.maxTtlHours !== 'number' || req.maxTtlHours <= 0) {
      throw new ValidationError('maxTtlHours must be a positive number');
    }
  }

  return req as unknown as CreateWorkspaceRequest;
}

/**
 * Validates EnsureUserRequest.
 * Throws ValidationError if invalid.
 */
export function validateEnsureUserRequest(body: unknown): EnsureUserRequest {
  if (!body || typeof body !== 'object') {
    throw new ValidationError('Request body must be an object');
  }

  const req = body as Record<string, unknown>;

  // Required: email
  if (!req.email || typeof req.email !== 'string') {
    throw new ValidationError('email is required and must be a string');
  }

  // Required: loginType must be 'oidc'
  if (req.loginType !== 'oidc') {
    throw new ValidationError('loginType must be "oidc"');
  }

  return req as unknown as EnsureUserRequest;
}
