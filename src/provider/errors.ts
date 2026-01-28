/**
 * Provider Error Classes
 *
 * Error classes for provider operations. All errors include the provider name
 * and operation for easier debugging.
 *
 * @see s-9cl3 - Unified Workspace Provider Architecture specification
 */

import type { ProviderType } from './types.js';

// ============================================================================
// Base Error
// ============================================================================

/**
 * Base error class for all provider errors.
 * Includes provider name and operation for context.
 */
export class ProviderError extends Error {
  constructor(
    message: string,
    public readonly provider: ProviderType | string,
    public readonly operation: string,
    public readonly cause?: Error
  ) {
    super(`[${provider}] ${operation}: ${message}`);
    this.name = 'ProviderError';

    // Maintain proper stack trace in V8 environments
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, this.constructor);
    }
  }
}

// ============================================================================
// Workspace Errors
// ============================================================================

/**
 * Thrown when a workspace cannot be found.
 */
export class WorkspaceNotFoundError extends ProviderError {
  constructor(
    provider: ProviderType | string,
    public readonly workspaceId: string
  ) {
    super(`Workspace not found: ${workspaceId}`, provider, 'get');
    this.name = 'WorkspaceNotFoundError';
  }
}

/**
 * Thrown when workspace creation fails.
 */
export class WorkspaceCreationError extends ProviderError {
  constructor(
    provider: ProviderType | string,
    message: string,
    cause?: Error
  ) {
    super(message, provider, 'create', cause);
    this.name = 'WorkspaceCreationError';
  }
}

/**
 * Thrown when a workspace operation times out.
 */
export class WorkspaceTimeoutError extends ProviderError {
  constructor(
    provider: ProviderType | string,
    operation: string,
    public readonly timeoutMs: number
  ) {
    super(`Timed out after ${timeoutMs}ms`, provider, operation);
    this.name = 'WorkspaceTimeoutError';
  }
}

/**
 * Thrown when a workspace is in an unexpected state for the operation.
 */
export class WorkspaceStateError extends ProviderError {
  constructor(
    provider: ProviderType | string,
    operation: string,
    public readonly workspaceId: string,
    public readonly currentState: string,
    public readonly expectedStates: string[]
  ) {
    super(
      `Workspace ${workspaceId} is in state '${currentState}', expected one of: ${expectedStates.join(', ')}`,
      provider,
      operation
    );
    this.name = 'WorkspaceStateError';
  }
}

// ============================================================================
// Authentication Errors
// ============================================================================

/**
 * Thrown when authentication fails.
 */
export class AuthenticationError extends ProviderError {
  constructor(provider: ProviderType | string, message: string) {
    super(message, provider, 'auth');
    this.name = 'AuthenticationError';
  }
}

/**
 * Thrown when the user lacks permission for an operation.
 */
export class AuthorizationError extends ProviderError {
  constructor(
    provider: ProviderType | string,
    operation: string,
    message: string
  ) {
    super(message, provider, operation);
    this.name = 'AuthorizationError';
  }
}

// ============================================================================
// Configuration Errors
// ============================================================================

/**
 * Thrown when provider configuration is invalid or missing.
 */
export class ConfigurationError extends ProviderError {
  constructor(provider: ProviderType | string, message: string) {
    super(message, provider, 'config');
    this.name = 'ConfigurationError';
  }
}

// ============================================================================
// Connection Errors
// ============================================================================

/**
 * Thrown when connection to the workspace fails.
 */
export class ConnectionError extends ProviderError {
  constructor(
    provider: ProviderType | string,
    operation: string,
    message: string,
    cause?: Error
  ) {
    super(message, provider, operation, cause);
    this.name = 'ConnectionError';
  }
}

/**
 * Thrown when port forwarding fails.
 */
export class PortForwardingError extends ProviderError {
  constructor(
    provider: ProviderType | string,
    public readonly port: number,
    message: string,
    cause?: Error
  ) {
    super(message, provider, 'portForward', cause);
    this.name = 'PortForwardingError';
  }
}

// ============================================================================
// Execution Errors
// ============================================================================

/**
 * Thrown when command execution inside workspace fails.
 */
export class ExecutionError extends ProviderError {
  constructor(
    provider: ProviderType | string,
    public readonly command: string,
    public readonly exitCode: number,
    public readonly stderr?: string
  ) {
    super(
      `Command failed with exit code ${exitCode}: ${command}`,
      provider,
      'exec'
    );
    this.name = 'ExecutionError';
  }
}
