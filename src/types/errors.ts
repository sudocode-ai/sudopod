/**
 * Error types for Provider operations.
 *
 * These errors are for host-side provider implementations (e.g., CoderProvider
 * in coder-infra). They are separate from the connector-related errors in
 * src/core/errors.ts which are for CLI-side operations.
 *
 * @see s-7gqg - Provider Interface Contract specification
 */

// ============================================================================
// Error Codes
// ============================================================================

/**
 * Error codes for provider operations.
 */
export type ProviderErrorCode =
  | 'WORKSPACE_NOT_FOUND'
  | 'WORKSPACE_ALREADY_EXISTS'
  | 'USER_NOT_FOUND'
  | 'USER_ALREADY_EXISTS'
  | 'INVALID_REQUEST'
  | 'QUOTA_EXCEEDED'
  | 'PROVIDER_UNAVAILABLE'
  | 'AUTHENTICATION_FAILED'
  | 'AUTHORIZATION_FAILED'
  | 'INTERNAL_ERROR';

// ============================================================================
// Base Error Class
// ============================================================================

/**
 * Base error for provider operations.
 */
export class ProviderError extends Error {
  constructor(
    message: string,
    public code: ProviderErrorCode,
    public statusCode: number = 500
  ) {
    super(message);
    this.name = 'ProviderError';
  }
}

// ============================================================================
// Workspace Errors
// ============================================================================

/**
 * Workspace not found error.
 */
export class WorkspaceNotFoundError extends ProviderError {
  constructor(id: string) {
    super(`Workspace not found: ${id}`, 'WORKSPACE_NOT_FOUND', 404);
  }
}

/**
 * Workspace already exists error.
 */
export class WorkspaceAlreadyExistsError extends ProviderError {
  constructor(name: string) {
    super(`Workspace already exists: ${name}`, 'WORKSPACE_ALREADY_EXISTS', 409);
  }
}

// ============================================================================
// User Errors
// ============================================================================

/**
 * User not found error.
 */
export class UserNotFoundError extends ProviderError {
  constructor(identifier: string) {
    super(`User not found: ${identifier}`, 'USER_NOT_FOUND', 404);
  }
}

/**
 * User already exists error.
 */
export class UserAlreadyExistsError extends ProviderError {
  constructor(email: string) {
    super(`User already exists: ${email}`, 'USER_ALREADY_EXISTS', 409);
  }
}

// ============================================================================
// Request Errors
// ============================================================================

/**
 * Invalid request error.
 */
export class InvalidRequestError extends ProviderError {
  constructor(message: string) {
    super(message, 'INVALID_REQUEST', 400);
  }
}

/**
 * Quota exceeded error.
 */
export class QuotaExceededError extends ProviderError {
  constructor(message: string) {
    super(message, 'QUOTA_EXCEEDED', 429);
  }
}

// ============================================================================
// Provider Errors
// ============================================================================

/**
 * Provider unavailable error.
 */
export class ProviderUnavailableError extends ProviderError {
  constructor(message: string) {
    super(message, 'PROVIDER_UNAVAILABLE', 503);
  }
}

// ============================================================================
// Authentication/Authorization Errors
// ============================================================================

/**
 * Authentication failed error.
 */
export class AuthenticationFailedError extends ProviderError {
  constructor(message: string) {
    super(message, 'AUTHENTICATION_FAILED', 401);
  }
}

/**
 * Authorization failed error.
 */
export class AuthorizationFailedError extends ProviderError {
  constructor(message: string) {
    super(message, 'AUTHORIZATION_FAILED', 403);
  }
}

// ============================================================================
// Internal Errors
// ============================================================================

/**
 * Internal provider error.
 */
export class InternalProviderError extends ProviderError {
  constructor(message: string) {
    super(message, 'INTERNAL_ERROR', 500);
  }
}
