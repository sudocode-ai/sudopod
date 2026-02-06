/**
 * Provider Factory
 *
 * Creates provider instances based on a provider name and its config.
 *
 * @see s-9cl3 - Unified Workspace Provider Architecture specification
 */

import type { Provider, CodespacesConfig, CoderConfig, HubConfig } from './types.js';
import { ConfigurationError } from './errors.js';
import { CodespacesProvider } from './codespaces/index.js';
import { CoderProvider } from './coder/index.js';

/**
 * Create a provider instance.
 *
 * @param provider - Provider name ('codespaces', 'coder', 'hub')
 * @param config - Provider-specific configuration
 * @returns Provider instance
 * @throws ConfigurationError if provider is unknown or not yet implemented
 */
export function createProvider(provider: 'codespaces', config: CodespacesConfig): Provider;
export function createProvider(provider: 'coder', config: CoderConfig): Provider;
export function createProvider(provider: 'hub', config: HubConfig): Provider;
export function createProvider(provider: string, config: CodespacesConfig | CoderConfig | HubConfig): Provider {
  switch (provider) {
    case 'codespaces':
      return new CodespacesProvider(config as CodespacesConfig);

    case 'coder':
      return new CoderProvider(config as CoderConfig);

    case 'hub':
      // TODO: return new HubProvider(config as HubConfig);
      throw new ConfigurationError('hub', 'Hub provider not yet implemented');

    default:
      throw new ConfigurationError(provider, `Unknown provider: ${provider}`);
  }
}
