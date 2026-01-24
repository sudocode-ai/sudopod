/**
 * Unit tests for server validation functions.
 *
 * @see s-2aqt - Sudopod Server Implementation specification
 */

import { describe, it, expect } from 'vitest';
import {
  validateCreateWorkspaceRequest,
  validateEnsureUserRequest,
  ValidationError,
} from '../../../src/server/validation.js';

describe('validateCreateWorkspaceRequest', () => {
  describe('valid requests', () => {
    it('accepts valid request with repository and userIdentity', () => {
      const req = {
        repository: 'owner/repo',
        userIdentity: { email: 'user@example.com' },
      };
      expect(() => validateCreateWorkspaceRequest(req)).not.toThrow();
    });

    it('accepts userIdentity with only email', () => {
      const req = {
        repository: 'owner/repo',
        userIdentity: { email: 'user@example.com' },
      };
      const result = validateCreateWorkspaceRequest(req);
      expect(result.repository).toBe('owner/repo');
      expect(result.userIdentity.email).toBe('user@example.com');
    });

    it('accepts userIdentity with only sub', () => {
      const req = {
        repository: 'owner/repo',
        userIdentity: { sub: 'auth0|123456' },
      };
      const result = validateCreateWorkspaceRequest(req);
      expect(result.userIdentity.sub).toBe('auth0|123456');
    });

    it('accepts userIdentity with only username', () => {
      const req = {
        repository: 'owner/repo',
        userIdentity: { username: 'testuser' },
      };
      const result = validateCreateWorkspaceRequest(req);
      expect(result.userIdentity.username).toBe('testuser');
    });

    it('accepts request with all optional numeric fields', () => {
      const req = {
        repository: 'owner/repo',
        userIdentity: { email: 'user@example.com' },
        cpuCores: 4,
        memoryGb: 8,
        diskSizeGb: 100,
        idleTimeoutMinutes: 30,
        maxTtlHours: 24,
      };
      expect(() => validateCreateWorkspaceRequest(req)).not.toThrow();
    });

    it('accepts repository with dots and dashes', () => {
      const req = {
        repository: 'my-org.name/repo-name.js',
        userIdentity: { email: 'user@example.com' },
      };
      expect(() => validateCreateWorkspaceRequest(req)).not.toThrow();
    });
  });

  describe('repository validation', () => {
    it('rejects missing repository', () => {
      const req = { userIdentity: { email: 'user@example.com' } };
      expect(() => validateCreateWorkspaceRequest(req)).toThrow(ValidationError);
      expect(() => validateCreateWorkspaceRequest(req)).toThrow(
        'repository is required and must be a string'
      );
    });

    it('rejects null repository', () => {
      const req = {
        repository: null,
        userIdentity: { email: 'user@example.com' },
      };
      expect(() => validateCreateWorkspaceRequest(req)).toThrow(
        'repository is required and must be a string'
      );
    });

    it('rejects non-string repository', () => {
      const req = {
        repository: 123,
        userIdentity: { email: 'user@example.com' },
      };
      expect(() => validateCreateWorkspaceRequest(req)).toThrow(
        'repository is required and must be a string'
      );
    });

    it('rejects invalid repository format - no slash', () => {
      const req = {
        repository: 'not-valid-format',
        userIdentity: { email: 'user@example.com' },
      };
      expect(() => validateCreateWorkspaceRequest(req)).toThrow(ValidationError);
      expect(() => validateCreateWorkspaceRequest(req)).toThrow(
        'repository must be in "owner/repo" format'
      );
    });

    it('rejects invalid repository format - multiple slashes', () => {
      const req = {
        repository: 'owner/repo/extra',
        userIdentity: { email: 'user@example.com' },
      };
      expect(() => validateCreateWorkspaceRequest(req)).toThrow(
        'repository must be in "owner/repo" format'
      );
    });

    it('rejects invalid repository format - empty owner', () => {
      const req = {
        repository: '/repo',
        userIdentity: { email: 'user@example.com' },
      };
      expect(() => validateCreateWorkspaceRequest(req)).toThrow(
        'repository must be in "owner/repo" format'
      );
    });

    it('rejects invalid repository format - empty repo', () => {
      const req = {
        repository: 'owner/',
        userIdentity: { email: 'user@example.com' },
      };
      expect(() => validateCreateWorkspaceRequest(req)).toThrow(
        'repository must be in "owner/repo" format'
      );
    });
  });

  describe('userIdentity validation', () => {
    it('rejects missing userIdentity', () => {
      const req = { repository: 'owner/repo' };
      expect(() => validateCreateWorkspaceRequest(req)).toThrow(ValidationError);
      expect(() => validateCreateWorkspaceRequest(req)).toThrow('userIdentity is required');
    });

    it('rejects null userIdentity', () => {
      const req = {
        repository: 'owner/repo',
        userIdentity: null,
      };
      expect(() => validateCreateWorkspaceRequest(req)).toThrow('userIdentity is required');
    });

    it('rejects non-object userIdentity', () => {
      const req = {
        repository: 'owner/repo',
        userIdentity: 'user@example.com',
      };
      expect(() => validateCreateWorkspaceRequest(req)).toThrow('userIdentity is required');
    });

    it('rejects empty userIdentity', () => {
      const req = {
        repository: 'owner/repo',
        userIdentity: {},
      };
      expect(() => validateCreateWorkspaceRequest(req)).toThrow(ValidationError);
      expect(() => validateCreateWorkspaceRequest(req)).toThrow(
        'userIdentity must have at least one of: email, sub, username'
      );
    });
  });

  describe('cpuCores validation', () => {
    it('accepts valid cpuCores', () => {
      const req = {
        repository: 'owner/repo',
        userIdentity: { email: 'user@example.com' },
        cpuCores: 4,
      };
      expect(() => validateCreateWorkspaceRequest(req)).not.toThrow();
    });

    it('rejects non-positive cpuCores', () => {
      const req = {
        repository: 'owner/repo',
        userIdentity: { email: 'user@example.com' },
        cpuCores: 0,
      };
      expect(() => validateCreateWorkspaceRequest(req)).toThrow(ValidationError);
      expect(() => validateCreateWorkspaceRequest(req)).toThrow(
        'cpuCores must be a positive integer'
      );
    });

    it('rejects negative cpuCores', () => {
      const req = {
        repository: 'owner/repo',
        userIdentity: { email: 'user@example.com' },
        cpuCores: -2,
      };
      expect(() => validateCreateWorkspaceRequest(req)).toThrow(
        'cpuCores must be a positive integer'
      );
    });

    it('rejects non-integer cpuCores', () => {
      const req = {
        repository: 'owner/repo',
        userIdentity: { email: 'user@example.com' },
        cpuCores: 2.5,
      };
      expect(() => validateCreateWorkspaceRequest(req)).toThrow(ValidationError);
      expect(() => validateCreateWorkspaceRequest(req)).toThrow(
        'cpuCores must be a positive integer'
      );
    });

    it('rejects non-number cpuCores', () => {
      const req = {
        repository: 'owner/repo',
        userIdentity: { email: 'user@example.com' },
        cpuCores: '4',
      };
      expect(() => validateCreateWorkspaceRequest(req)).toThrow(
        'cpuCores must be a positive integer'
      );
    });
  });

  describe('memoryGb validation', () => {
    it('accepts valid memoryGb', () => {
      const req = {
        repository: 'owner/repo',
        userIdentity: { email: 'user@example.com' },
        memoryGb: 8,
      };
      expect(() => validateCreateWorkspaceRequest(req)).not.toThrow();
    });

    it('accepts decimal memoryGb', () => {
      const req = {
        repository: 'owner/repo',
        userIdentity: { email: 'user@example.com' },
        memoryGb: 8.5,
      };
      expect(() => validateCreateWorkspaceRequest(req)).not.toThrow();
    });

    it('rejects non-positive memoryGb', () => {
      const req = {
        repository: 'owner/repo',
        userIdentity: { email: 'user@example.com' },
        memoryGb: 0,
      };
      expect(() => validateCreateWorkspaceRequest(req)).toThrow(ValidationError);
      expect(() => validateCreateWorkspaceRequest(req)).toThrow(
        'memoryGb must be a positive number'
      );
    });

    it('rejects negative memoryGb', () => {
      const req = {
        repository: 'owner/repo',
        userIdentity: { email: 'user@example.com' },
        memoryGb: -4,
      };
      expect(() => validateCreateWorkspaceRequest(req)).toThrow(
        'memoryGb must be a positive number'
      );
    });

    it('rejects non-number memoryGb', () => {
      const req = {
        repository: 'owner/repo',
        userIdentity: { email: 'user@example.com' },
        memoryGb: '8',
      };
      expect(() => validateCreateWorkspaceRequest(req)).toThrow(
        'memoryGb must be a positive number'
      );
    });
  });

  describe('diskSizeGb validation', () => {
    it('accepts valid diskSizeGb', () => {
      const req = {
        repository: 'owner/repo',
        userIdentity: { email: 'user@example.com' },
        diskSizeGb: 100,
      };
      expect(() => validateCreateWorkspaceRequest(req)).not.toThrow();
    });

    it('rejects non-positive diskSizeGb', () => {
      const req = {
        repository: 'owner/repo',
        userIdentity: { email: 'user@example.com' },
        diskSizeGb: 0,
      };
      expect(() => validateCreateWorkspaceRequest(req)).toThrow(ValidationError);
      expect(() => validateCreateWorkspaceRequest(req)).toThrow(
        'diskSizeGb must be a positive integer'
      );
    });

    it('rejects negative diskSizeGb', () => {
      const req = {
        repository: 'owner/repo',
        userIdentity: { email: 'user@example.com' },
        diskSizeGb: -50,
      };
      expect(() => validateCreateWorkspaceRequest(req)).toThrow(
        'diskSizeGb must be a positive integer'
      );
    });

    it('rejects non-integer diskSizeGb', () => {
      const req = {
        repository: 'owner/repo',
        userIdentity: { email: 'user@example.com' },
        diskSizeGb: 100.5,
      };
      expect(() => validateCreateWorkspaceRequest(req)).toThrow(ValidationError);
      expect(() => validateCreateWorkspaceRequest(req)).toThrow(
        'diskSizeGb must be a positive integer'
      );
    });

    it('rejects non-number diskSizeGb', () => {
      const req = {
        repository: 'owner/repo',
        userIdentity: { email: 'user@example.com' },
        diskSizeGb: '100',
      };
      expect(() => validateCreateWorkspaceRequest(req)).toThrow(
        'diskSizeGb must be a positive integer'
      );
    });
  });

  describe('idleTimeoutMinutes validation', () => {
    it('accepts valid idleTimeoutMinutes', () => {
      const req = {
        repository: 'owner/repo',
        userIdentity: { email: 'user@example.com' },
        idleTimeoutMinutes: 30,
      };
      expect(() => validateCreateWorkspaceRequest(req)).not.toThrow();
    });

    it('accepts decimal idleTimeoutMinutes', () => {
      const req = {
        repository: 'owner/repo',
        userIdentity: { email: 'user@example.com' },
        idleTimeoutMinutes: 30.5,
      };
      expect(() => validateCreateWorkspaceRequest(req)).not.toThrow();
    });

    it('rejects non-positive idleTimeoutMinutes', () => {
      const req = {
        repository: 'owner/repo',
        userIdentity: { email: 'user@example.com' },
        idleTimeoutMinutes: 0,
      };
      expect(() => validateCreateWorkspaceRequest(req)).toThrow(ValidationError);
      expect(() => validateCreateWorkspaceRequest(req)).toThrow(
        'idleTimeoutMinutes must be a positive number'
      );
    });

    it('rejects negative idleTimeoutMinutes', () => {
      const req = {
        repository: 'owner/repo',
        userIdentity: { email: 'user@example.com' },
        idleTimeoutMinutes: -10,
      };
      expect(() => validateCreateWorkspaceRequest(req)).toThrow(
        'idleTimeoutMinutes must be a positive number'
      );
    });

    it('rejects non-number idleTimeoutMinutes', () => {
      const req = {
        repository: 'owner/repo',
        userIdentity: { email: 'user@example.com' },
        idleTimeoutMinutes: '30',
      };
      expect(() => validateCreateWorkspaceRequest(req)).toThrow(
        'idleTimeoutMinutes must be a positive number'
      );
    });
  });

  describe('maxTtlHours validation', () => {
    it('accepts valid maxTtlHours', () => {
      const req = {
        repository: 'owner/repo',
        userIdentity: { email: 'user@example.com' },
        maxTtlHours: 24,
      };
      expect(() => validateCreateWorkspaceRequest(req)).not.toThrow();
    });

    it('accepts decimal maxTtlHours', () => {
      const req = {
        repository: 'owner/repo',
        userIdentity: { email: 'user@example.com' },
        maxTtlHours: 24.5,
      };
      expect(() => validateCreateWorkspaceRequest(req)).not.toThrow();
    });

    it('rejects non-positive maxTtlHours', () => {
      const req = {
        repository: 'owner/repo',
        userIdentity: { email: 'user@example.com' },
        maxTtlHours: 0,
      };
      expect(() => validateCreateWorkspaceRequest(req)).toThrow(ValidationError);
      expect(() => validateCreateWorkspaceRequest(req)).toThrow(
        'maxTtlHours must be a positive number'
      );
    });

    it('rejects negative maxTtlHours', () => {
      const req = {
        repository: 'owner/repo',
        userIdentity: { email: 'user@example.com' },
        maxTtlHours: -12,
      };
      expect(() => validateCreateWorkspaceRequest(req)).toThrow(
        'maxTtlHours must be a positive number'
      );
    });

    it('rejects non-number maxTtlHours', () => {
      const req = {
        repository: 'owner/repo',
        userIdentity: { email: 'user@example.com' },
        maxTtlHours: '24',
      };
      expect(() => validateCreateWorkspaceRequest(req)).toThrow(
        'maxTtlHours must be a positive number'
      );
    });
  });

  describe('body validation', () => {
    it('rejects null body', () => {
      expect(() => validateCreateWorkspaceRequest(null)).toThrow(ValidationError);
      expect(() => validateCreateWorkspaceRequest(null)).toThrow(
        'Request body must be an object'
      );
    });

    it('rejects undefined body', () => {
      expect(() => validateCreateWorkspaceRequest(undefined)).toThrow(
        'Request body must be an object'
      );
    });

    it('rejects non-object body', () => {
      expect(() => validateCreateWorkspaceRequest('string')).toThrow(
        'Request body must be an object'
      );
      expect(() => validateCreateWorkspaceRequest(123)).toThrow(
        'Request body must be an object'
      );
    });
  });
});

describe('validateEnsureUserRequest', () => {
  describe('valid requests', () => {
    it('accepts valid request with email and loginType oidc', () => {
      const req = {
        email: 'user@example.com',
        loginType: 'oidc',
      };
      expect(() => validateEnsureUserRequest(req)).not.toThrow();
      const result = validateEnsureUserRequest(req);
      expect(result.email).toBe('user@example.com');
      expect(result.loginType).toBe('oidc');
    });

    it('accepts request with additional fields', () => {
      const req = {
        email: 'user@example.com',
        loginType: 'oidc',
        name: 'Test User',
      };
      expect(() => validateEnsureUserRequest(req)).not.toThrow();
    });
  });

  describe('email validation', () => {
    it('rejects missing email', () => {
      const req = {
        loginType: 'oidc',
      };
      expect(() => validateEnsureUserRequest(req)).toThrow(ValidationError);
      expect(() => validateEnsureUserRequest(req)).toThrow(
        'email is required and must be a string'
      );
    });

    it('rejects null email', () => {
      const req = {
        email: null,
        loginType: 'oidc',
      };
      expect(() => validateEnsureUserRequest(req)).toThrow(
        'email is required and must be a string'
      );
    });

    it('rejects non-string email', () => {
      const req = {
        email: 123,
        loginType: 'oidc',
      };
      expect(() => validateEnsureUserRequest(req)).toThrow(
        'email is required and must be a string'
      );
    });

    it('rejects empty string email', () => {
      const req = {
        email: '',
        loginType: 'oidc',
      };
      expect(() => validateEnsureUserRequest(req)).toThrow(
        'email is required and must be a string'
      );
    });
  });

  describe('loginType validation', () => {
    it('rejects invalid loginType', () => {
      const req = {
        email: 'user@example.com',
        loginType: 'password',
      };
      expect(() => validateEnsureUserRequest(req)).toThrow(ValidationError);
      expect(() => validateEnsureUserRequest(req)).toThrow('loginType must be "oidc"');
    });

    it('rejects missing loginType', () => {
      const req = {
        email: 'user@example.com',
      };
      expect(() => validateEnsureUserRequest(req)).toThrow('loginType must be "oidc"');
    });

    it('rejects null loginType', () => {
      const req = {
        email: 'user@example.com',
        loginType: null,
      };
      expect(() => validateEnsureUserRequest(req)).toThrow('loginType must be "oidc"');
    });
  });

  describe('body validation', () => {
    it('rejects null body', () => {
      expect(() => validateEnsureUserRequest(null)).toThrow(ValidationError);
      expect(() => validateEnsureUserRequest(null)).toThrow(
        'Request body must be an object'
      );
    });

    it('rejects undefined body', () => {
      expect(() => validateEnsureUserRequest(undefined)).toThrow(
        'Request body must be an object'
      );
    });

    it('rejects non-object body', () => {
      expect(() => validateEnsureUserRequest('string')).toThrow(
        'Request body must be an object'
      );
      expect(() => validateEnsureUserRequest(123)).toThrow(
        'Request body must be an object'
      );
    });
  });
});

describe('ValidationError', () => {
  it('should be an instance of Error', () => {
    const error = new ValidationError('Test message');
    expect(error).toBeInstanceOf(Error);
    expect(error).toBeInstanceOf(ValidationError);
  });

  it('should have correct name and message', () => {
    const error = new ValidationError('Test validation error');
    expect(error.name).toBe('ValidationError');
    expect(error.message).toBe('Test validation error');
  });

  it('should be throwable and catchable', () => {
    expect(() => {
      throw new ValidationError('Test');
    }).toThrow(ValidationError);
  });
});
