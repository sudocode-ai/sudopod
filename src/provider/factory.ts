/**
 * Provider Factory
 *
 * Creates provider instances based on configuration.
 *
 * @see s-9cl3 - Unified Workspace Provider Architecture specification
 */

import type { Provider, ProviderConfig } from './types.js';
import { ConfigurationError } from './errors.js';
import { CodespacesProvider } from './providers/codespaces.js';
import { CoderProvider } from './providers/coder.js';

/**
 * Create a provider instance from configuration.
 *
 * @param config - Provider configuration
 * @returns Provider instance
 * @throws ConfigurationError if config is invalid
 */
export function createProvider(config: ProviderConfig): Provider {
  switch (config.type) {
    case 'codespaces':
      return new CodespacesProvider();

    case 'coder':
      if (!config.authToken) {
        throw new ConfigurationError(
          'coder',
          'Coder provider requires authToken'
        );
      }
      if (!config.url) {
        throw new ConfigurationError('coder', 'Coder provider requires url');
      }
      return new CoderProvider(config.url, config.authToken);

    default:
      throw new ConfigurationError(
        (config as ProviderConfig).type ?? 'unknown',
        `Unknown provider type: ${(config as ProviderConfig).type}`
      );
  }
}
