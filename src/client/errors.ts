/**
 * Error class for SudopodClient failures.
 *
 * Thrown when HTTP requests to provider hosts fail.
 * Contains the error code and HTTP status code for programmatic handling.
 *
 * @see s-3j7d - SudopodClient Implementation specification
 */

/**
 * Error thrown by SudopodClient for failed requests.
 */
export class SudopodClientError extends Error {
  constructor(
    message: string,
    public readonly code: string,
    public readonly statusCode: number
  ) {
    super(message);
    this.name = 'SudopodClientError';

    // Maintains proper stack trace for where error was thrown (V8 only)
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, SudopodClientError);
    }
  }

  /**
   * Check if error is a "not found" error (404).
   */
  isNotFound(): boolean {
    return this.statusCode === 404;
  }

  /**
   * Check if error is a client error (4xx).
   */
  isClientError(): boolean {
    return this.statusCode >= 400 && this.statusCode < 500;
  }

  /**
   * Check if error is a server error (5xx).
   */
  isServerError(): boolean {
    return this.statusCode >= 500;
  }

  /**
   * Check if error is a timeout (408).
   */
  isTimeout(): boolean {
    return this.statusCode === 408 || this.code === 'TIMEOUT';
  }
}
