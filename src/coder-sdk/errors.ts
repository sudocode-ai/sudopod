/**
 * Coder API Error
 *
 * Typed error class for Coder REST API failures.
 * Includes HTTP details for consumer error mapping.
 *
 * @see s-9uap - sudopod-coder-sdk specification
 */

export class CoderApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly body: string,
    public readonly method: string,
    public readonly path: string,
  ) {
    super(`Coder API ${method} ${path} failed (${status}): ${body}`);
    this.name = 'CoderApiError';
  }

  static fromResponse(status: number, body: string, method: string, path: string): CoderApiError {
    return new CoderApiError(status, body, method, path);
  }

  get isNotFound(): boolean {
    return this.status === 404;
  }

  get isConflict(): boolean {
    return this.status === 409;
  }

  get isUnauthorized(): boolean {
    return this.status === 401;
  }

  get isForbidden(): boolean {
    return this.status === 403;
  }
}
