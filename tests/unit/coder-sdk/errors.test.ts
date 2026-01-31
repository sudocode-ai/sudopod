import { describe, it, expect } from 'vitest';
import { CoderApiError } from '../../../src/coder-sdk/errors.js';

describe('CoderApiError', () => {
  it('formats error message with method, path, status, and body', () => {
    const error = new CoderApiError(404, 'not found', 'GET', '/api/v2/workspaces/123');

    expect(error.message).toBe('Coder API GET /api/v2/workspaces/123 failed (404): not found');
    expect(error.name).toBe('CoderApiError');
  });

  it('exposes status, body, method, and path', () => {
    const error = new CoderApiError(409, 'conflict', 'POST', '/api/v2/users');

    expect(error.status).toBe(409);
    expect(error.body).toBe('conflict');
    expect(error.method).toBe('POST');
    expect(error.path).toBe('/api/v2/users');
  });

  describe('fromResponse', () => {
    it('creates a CoderApiError instance', () => {
      const error = CoderApiError.fromResponse(500, 'internal error', 'PUT', '/api/v2/workspaces/123/extend');

      expect(error).toBeInstanceOf(CoderApiError);
      expect(error.status).toBe(500);
      expect(error.body).toBe('internal error');
      expect(error.method).toBe('PUT');
      expect(error.path).toBe('/api/v2/workspaces/123/extend');
    });
  });

  describe('status getters', () => {
    it('isNotFound returns true for 404', () => {
      const error = new CoderApiError(404, '', 'GET', '/');
      expect(error.isNotFound).toBe(true);
      expect(error.isConflict).toBe(false);
      expect(error.isUnauthorized).toBe(false);
      expect(error.isForbidden).toBe(false);
    });

    it('isConflict returns true for 409', () => {
      const error = new CoderApiError(409, '', 'POST', '/');
      expect(error.isConflict).toBe(true);
      expect(error.isNotFound).toBe(false);
    });

    it('isUnauthorized returns true for 401', () => {
      const error = new CoderApiError(401, '', 'GET', '/');
      expect(error.isUnauthorized).toBe(true);
      expect(error.isForbidden).toBe(false);
    });

    it('isForbidden returns true for 403', () => {
      const error = new CoderApiError(403, '', 'GET', '/');
      expect(error.isForbidden).toBe(true);
      expect(error.isUnauthorized).toBe(false);
    });

    it('all getters return false for unrelated status', () => {
      const error = new CoderApiError(500, '', 'GET', '/');
      expect(error.isNotFound).toBe(false);
      expect(error.isConflict).toBe(false);
      expect(error.isUnauthorized).toBe(false);
      expect(error.isForbidden).toBe(false);
    });
  });

  it('is an instance of Error', () => {
    const error = new CoderApiError(400, 'bad request', 'POST', '/api/v2/workspaces');
    expect(error).toBeInstanceOf(Error);
  });
});
