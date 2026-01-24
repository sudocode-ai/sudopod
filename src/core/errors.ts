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
 * Thrown when requested connector type is not registered
 */
export class ConnectorNotFoundError extends SudopodError {
  /**
   * Creates a new ConnectorNotFoundError
   * @param type - The connector type that was not found
   */
  constructor(type: string) {
    super(`Connector not found: ${type}`, 'CONNECTOR_NOT_FOUND');
    this.name = 'ConnectorNotFoundError';
  }
}

/**
 * @deprecated Use ConnectorNotFoundError instead
 */
export const ProviderNotFoundError = ConnectorNotFoundError;

/**
 * Thrown when deployment operation fails
 */
export class DeploymentFailedError extends SudopodError {
  /**
   * Creates a new DeploymentFailedError
   * @param message - The reason for deployment failure
   * @param details - Optional details about the deployment failure (can be an Error object or any data)
   */
  constructor(message: string, public details?: any) {
    super(`Deployment failed: ${message}`, 'DEPLOYMENT_FAILED');
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
  constructor(public provider: string, reason: string) {
    super(`Authentication failed for ${provider}: ${reason}`, 'AUTH_FAILED');
    this.name = 'AuthenticationError';
  }
}

/**
 * Generic connector operation error
 */
export class ConnectorError extends SudopodError {
  /**
   * Creates a new ConnectorError
   * @param connector - The connector where the error occurred
   * @param operation - The operation that failed
   * @param reason - The reason for the failure
   */
  constructor(public connector: string, public operation: string, reason: string) {
    super(`${connector} ${operation} failed: ${reason}`, 'CONNECTOR_ERROR');
    this.name = 'ConnectorError';
  }
}

/**
 * @deprecated Use ConnectorError instead
 */
export const ProviderError = ConnectorError;
