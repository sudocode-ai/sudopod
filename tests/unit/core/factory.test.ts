/**
 * Unit tests for Connector factory function
 */

import { describe, it, expect } from 'vitest';
import { createConnector } from '../../../src/core/factory.js';
import { ConnectorNotFoundError } from '../../../src/core/errors.js';
import { CodespacesConnector } from '../../../src/connectors/codespaces.js';
import { CoderConnector } from '../../../src/connectors/coder.js';
import type { CodespacesConfig, CoderConfig } from '../../../src/types.js';

describe('createConnector', () => {
  describe('Codespaces connector', () => {
    it('should create a CodespacesConnector instance', () => {
      const config: CodespacesConfig = {
        type: 'codespaces',
      };

      const connector = createConnector(config);

      expect(connector).toBeInstanceOf(CodespacesConnector);
      expect(connector.type).toBe('codespaces');
    });
  });

  describe('Coder connector', () => {
    it('should create a CoderConnector instance', () => {
      const config: CoderConfig = {
        type: 'coder',
        url: 'https://coder.example.com',
        apiKey: 'test-api-key',
      };

      const connector = createConnector(config);

      expect(connector).toBeInstanceOf(CoderConnector);
      expect(connector.type).toBe('coder');
    });

    it('should pass configuration to CoderConnector', () => {
      const config: CoderConfig = {
        type: 'coder',
        url: 'https://my-coder.com',
        apiKey: 'my-secret-key',
      };

      const connector = createConnector(config);

      expect(connector).toBeInstanceOf(CoderConnector);
    });
  });

  describe('Unknown connector', () => {
    it('should throw ConnectorNotFoundError for unknown type', () => {
      const config = {
        type: 'unknown-connector',
      } as any;

      expect(() => createConnector(config)).toThrow(ConnectorNotFoundError);
      expect(() => createConnector(config)).toThrow('Connector not found: unknown-connector');
    });

    it('should throw ConnectorNotFoundError with correct error code', () => {
      const config = {
        type: 'invalid',
      } as any;

      try {
        createConnector(config);
        expect.fail('Should have thrown ConnectorNotFoundError');
      } catch (error: any) {
        expect(error).toBeInstanceOf(ConnectorNotFoundError);
        expect(error.code).toBe('CONNECTOR_NOT_FOUND');
        expect(error.name).toBe('ConnectorNotFoundError');
      }
    });
  });

  describe('Type safety', () => {
    it('should accept valid CodespacesConfig', () => {
      const config: CodespacesConfig = {
        type: 'codespaces',
      };

      expect(() => createConnector(config)).not.toThrow();
    });

    it('should accept valid CoderConfig', () => {
      const config: CoderConfig = {
        type: 'coder',
        url: 'https://coder.example.com',
        apiKey: 'test-key',
      };

      expect(() => createConnector(config)).not.toThrow();
    });
  });
});

describe('Backward compatibility', () => {
  it('should support deprecated createProvider alias', async () => {
    // Import the deprecated alias
    const { createProvider } = await import('../../../src/index.js');
    
    const config: CodespacesConfig = {
      type: 'codespaces',
    };

    const connector = createProvider(config);
    expect(connector.type).toBe('codespaces');
  });

  it('should support deprecated ProviderNotFoundError alias', async () => {
    const { ProviderNotFoundError, ConnectorNotFoundError } = await import('../../../src/core/errors.js');
    
    // ProviderNotFoundError should be an alias for ConnectorNotFoundError
    expect(ProviderNotFoundError).toBe(ConnectorNotFoundError);
  });
});
