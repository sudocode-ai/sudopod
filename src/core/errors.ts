/**
 * Base error class for all sudopod errors
 */
export class SudopodError extends Error {
  /**
   * Creates a new SudopodError
   * @param message - Error message
   * @param code - Error code for programmatic handling
   */
  constructor(message: string, public code: string) {
    super(message);
    this.name = 'SudopodError';
  }
}

/**
 * Thrown when requested provider type is not registered
 */
export class ProviderNotFoundError extends SudopodError {
  /**
   * Creates a new ProviderNotFoundError
   * @param type - The provider type that was not found
   */
  constructor(type: string) {
    super(`Provider not found: ${type}`, 'PROVIDER_NOT_FOUND');
    this.name = 'ProviderNotFoundError';
  }
}

/**
 * Thrown when deployment operation fails
 */
export class DeploymentFailedError extends SudopodError {
  /**
   * Creates a new DeploymentFailedError
   * @param reason - The reason for deployment failure
   * @param details - Optional additional details about the failure
   */
  constructor(reason: string, public details?: any) {
    super(`Deployment failed: ${reason}`, 'DEPLOYMENT_FAILED');
    this.name = 'DeploymentFailedError';
  }
}

/**
 * Thrown when authentication fails
 */
export class AuthenticationError extends SudopodError {
  /**
   * Creates a new AuthenticationError
   * @param provider - The provider where authentication failed
   * @param reason - The reason for authentication failure
   */
  constructor(provider: string, reason: string) {
    super(`Authentication failed for ${provider}: ${reason}`, 'AUTH_FAILED');
    this.name = 'AuthenticationError';
  }
}

/**
 * Generic provider operation error
 */
export class ProviderError extends SudopodError {
  /**
   * Creates a new ProviderError
   * @param provider - The provider where the error occurred
   * @param operation - The operation that failed
   * @param reason - The reason for the failure
   */
  constructor(provider: string, operation: string, reason: string) {
    super(`${provider} ${operation} failed: ${reason}`, 'PROVIDER_ERROR');
    this.name = 'ProviderError';
  }
}
