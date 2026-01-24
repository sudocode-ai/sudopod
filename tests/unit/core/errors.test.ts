/**
 * Unit tests for error classes
 */

import { describe, it, expect } from 'vitest';
import {
  SudopodError,
  ConnectorNotFoundError,
  DeploymentFailedError,
  AuthenticationError,
  ConnectorError,
  // Deprecated aliases
  ProviderNotFoundError,
  ProviderError,
} from '../../../src/core/errors.js';

describe('Error Classes', () => {
  describe('SudopodError', () => {
    it('should create error with message and code', () => {
      const error = new SudopodError('Test error', 'TEST_CODE');

      expect(error).toBeInstanceOf(Error);
      expect(error).toBeInstanceOf(SudopodError);
      expect(error.message).toBe('Test error');
      expect(error.code).toBe('TEST_CODE');
      expect(error.name).toBe('SudopodError');
    });

    it('should be throwable and catchable', () => {
      expect(() => {
        throw new SudopodError('Test error', 'TEST_CODE');
      }).toThrow(SudopodError);

      expect(() => {
        throw new SudopodError('Test error', 'TEST_CODE');
      }).toThrow('Test error');
    });
  });

  describe('ConnectorNotFoundError', () => {
    it('should create error with connector type', () => {
      const error = new ConnectorNotFoundError('invalid-connector');

      expect(error).toBeInstanceOf(SudopodError);
      expect(error).toBeInstanceOf(ConnectorNotFoundError);
      expect(error.message).toBe('Connector not found: invalid-connector');
      expect(error.code).toBe('CONNECTOR_NOT_FOUND');
      expect(error.name).toBe('ConnectorNotFoundError');
    });

    it('should include connector type in message', () => {
      const error = new ConnectorNotFoundError('aws');

      expect(error.message).toContain('aws');
      expect(error.message).toBe('Connector not found: aws');
    });
  });

  describe('DeploymentFailedError', () => {
    it('should create error with reason', () => {
      const error = new DeploymentFailedError('Insufficient resources');

      expect(error).toBeInstanceOf(SudopodError);
      expect(error).toBeInstanceOf(DeploymentFailedError);
      expect(error.message).toBe('Deployment failed: Insufficient resources');
      expect(error.code).toBe('DEPLOYMENT_FAILED');
      expect(error.name).toBe('DeploymentFailedError');
      expect(error.details).toBeUndefined();
    });

    it('should create error with reason and details', () => {
      const details = {
        resourceType: 'codespace',
        quotaExceeded: true,
      };
      const error = new DeploymentFailedError('Quota exceeded', details);

      expect(error.message).toBe('Deployment failed: Quota exceeded');
      expect(error.details).toEqual(details);
    });

    it('should preserve Error object as details', () => {
      const originalError = new Error('Network timeout');
      const error = new DeploymentFailedError('Connection failed', originalError);

      expect(error.details).toBe(originalError);
      expect(error.details.message).toBe('Network timeout');
    });
  });

  describe('AuthenticationError', () => {
    it('should create error with provider and reason', () => {
      const error = new AuthenticationError('codespaces', 'Invalid token');

      expect(error).toBeInstanceOf(SudopodError);
      expect(error).toBeInstanceOf(AuthenticationError);
      expect(error.message).toBe('Authentication failed for codespaces: Invalid token');
      expect(error.code).toBe('AUTH_FAILED');
      expect(error.name).toBe('AuthenticationError');
    });

    it('should include both provider and reason in message', () => {
      const error = new AuthenticationError('coder', 'API key expired');

      expect(error.message).toContain('coder');
      expect(error.message).toContain('API key expired');
      expect(error.message).toBe('Authentication failed for coder: API key expired');
    });

    it('should handle GitHub CLI authentication failure', () => {
      const error = new AuthenticationError(
        'codespaces',
        'GitHub CLI not found. Install from https://cli.github.com'
      );

      expect(error.message).toContain('GitHub CLI not found');
      expect(error.code).toBe('AUTH_FAILED');
    });
  });

  describe('ConnectorError', () => {
    it('should create error with connector, operation, and reason', () => {
      const error = new ConnectorError('codespaces', 'stop', 'Codespace not found');

      expect(error).toBeInstanceOf(SudopodError);
      expect(error).toBeInstanceOf(ConnectorError);
      expect(error.message).toBe('codespaces stop failed: Codespace not found');
      expect(error.code).toBe('CONNECTOR_ERROR');
      expect(error.name).toBe('ConnectorError');
    });

    it('should include all components in message', () => {
      const error = new ConnectorError('coder', 'getStatus', 'Workspace not accessible');

      expect(error.message).toContain('coder');
      expect(error.message).toContain('getStatus');
      expect(error.message).toContain('Workspace not accessible');
      expect(error.message).toBe('coder getStatus failed: Workspace not accessible');
    });

    it('should handle list operation errors', () => {
      const error = new ConnectorError('codespaces', 'list', 'API error');

      expect(error.message).toBe('codespaces list failed: API error');
    });
  });

  describe('Error inheritance', () => {
    it('should maintain proper inheritance chain', () => {
      const errors = [
        new ConnectorNotFoundError('test'),
        new DeploymentFailedError('test'),
        new AuthenticationError('test', 'test'),
        new ConnectorError('test', 'test', 'test'),
      ];

      errors.forEach((error) => {
        expect(error).toBeInstanceOf(Error);
        expect(error).toBeInstanceOf(SudopodError);
      });
    });

    it('should allow catching specific error types', () => {
      try {
        throw new DeploymentFailedError('Test failure');
      } catch (error) {
        expect(error).toBeInstanceOf(DeploymentFailedError);
        expect(error).toBeInstanceOf(SudopodError);
        expect(error).toBeInstanceOf(Error);
      }
    });

    it('should allow catching base SudopodError', () => {
      const errors = [
        new ConnectorNotFoundError('test'),
        new DeploymentFailedError('test'),
        new AuthenticationError('test', 'test'),
        new ConnectorError('test', 'test', 'test'),
      ];

      errors.forEach((error) => {
        try {
          throw error;
        } catch (e) {
          expect(e).toBeInstanceOf(SudopodError);
        }
      });
    });
  });

  describe('Error codes', () => {
    it('should have unique error codes', () => {
      const codes = [
        new ConnectorNotFoundError('test').code,
        new DeploymentFailedError('test').code,
        new AuthenticationError('test', 'test').code,
        new ConnectorError('test', 'test', 'test').code,
      ];

      const uniqueCodes = new Set(codes);
      expect(uniqueCodes.size).toBe(4);
    });

    it('should use consistent code format', () => {
      const errors = [
        new ConnectorNotFoundError('test'),
        new DeploymentFailedError('test'),
        new AuthenticationError('test', 'test'),
        new ConnectorError('test', 'test', 'test'),
      ];

      errors.forEach((error) => {
        expect(error.code).toMatch(/^[A-Z_]+$/);
      });
    });
  });

  describe('Backward compatibility', () => {
    it('ProviderNotFoundError should be an alias for ConnectorNotFoundError', () => {
      expect(ProviderNotFoundError).toBe(ConnectorNotFoundError);
      
      const error = new ProviderNotFoundError('test');
      expect(error).toBeInstanceOf(ConnectorNotFoundError);
    });

    it('ProviderError should be an alias for ConnectorError', () => {
      expect(ProviderError).toBe(ConnectorError);
      
      const error = new ProviderError('codespaces', 'stop', 'test');
      expect(error).toBeInstanceOf(ConnectorError);
    });
  });
});
