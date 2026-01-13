/**
 * Unit tests for Provider factory function
 */

import { describe, it, expect } from 'vitest';
import { createProvider } from '../../../src/core/factory.js';
import { ProviderNotFoundError } from '../../../src/core/errors.js';
import { CodespacesProvider } from '../../../src/providers/codespaces.js';
import { CoderProvider } from '../../../src/providers/coder.js';
import type { CodespacesConfig, CoderConfig } from '../../../src/types.js';

describe('createProvider', () => {
  describe('Codespaces provider', () => {
    it('should create a CodespacesProvider instance', () => {
      const config: CodespacesConfig = {
        type: 'codespaces',
      };

      const provider = createProvider(config);

      expect(provider).toBeInstanceOf(CodespacesProvider);
      expect(provider.type).toBe('codespaces');
    });
  });

  describe('Coder provider', () => {
    it('should create a CoderProvider instance', () => {
      const config: CoderConfig = {
        type: 'coder',
        url: 'https://coder.example.com',
        apiKey: 'test-api-key',
      };

      const provider = createProvider(config);

      expect(provider).toBeInstanceOf(CoderProvider);
      expect(provider.type).toBe('coder');
    });

    it('should pass configuration to CoderProvider', () => {
      const config: CoderConfig = {
        type: 'coder',
        url: 'https://my-coder.com',
        apiKey: 'my-secret-key',
      };

      const provider = createProvider(config);

      expect(provider).toBeInstanceOf(CoderProvider);
    });
  });

  describe('Unknown provider', () => {
    it('should throw ProviderNotFoundError for unknown type', () => {
      const config = {
        type: 'unknown-provider',
      } as any;

      expect(() => createProvider(config)).toThrow(ProviderNotFoundError);
      expect(() => createProvider(config)).toThrow('Provider not found: unknown-provider');
    });

    it('should throw ProviderNotFoundError with correct error code', () => {
      const config = {
        type: 'invalid',
      } as any;

      try {
        createProvider(config);
        expect.fail('Should have thrown ProviderNotFoundError');
      } catch (error: any) {
        expect(error).toBeInstanceOf(ProviderNotFoundError);
        expect(error.code).toBe('PROVIDER_NOT_FOUND');
        expect(error.name).toBe('ProviderNotFoundError');
      }
    });
  });

  describe('Type safety', () => {
    it('should accept valid CodespacesConfig', () => {
      const config: CodespacesConfig = {
        type: 'codespaces',
      };

      expect(() => createProvider(config)).not.toThrow();
    });

    it('should accept valid CoderConfig', () => {
      const config: CoderConfig = {
        type: 'coder',
        url: 'https://coder.example.com',
        apiKey: 'test-key',
      };

      expect(() => createProvider(config)).not.toThrow();
    });
  });
});
