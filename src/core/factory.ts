/**
 * Provider factory function
 */

import type { ProviderConfig, CodespacesConfig, CoderConfig } from '../types.js';
import type { Provider } from './provider.js';
import { ProviderNotFoundError } from './errors.js';

// Placeholder provider implementations (will be implemented in later issues)
import { CodespacesProvider } from '../providers/codespaces.js';
import { CoderProvider } from '../providers/coder.js';

/**
 * Creates a provider instance based on the provided configuration.
 * 
 * This is the main entry point for creating provider instances. The factory
 * automatically instantiates the appropriate provider type based on the
 * configuration's type field.
 * 
 * @param config - Provider configuration specifying type and provider-specific settings
 * @returns A Provider instance configured for the specified provider type
 * @throws {ProviderNotFoundError} If the provider type is not supported
 * 
 * @example
 * ```typescript
 * // Create a Codespaces provider
 * const provider = createProvider({
 *   type: 'codespaces'
 * });
 * 
 * // Create a Coder provider
 * const provider = createProvider({
 *   type: 'coder',
 *   url: 'https://coder.example.com',
 *   apiKey: 'your-api-key'
 * });
 * ```
 */
export function createProvider(config: ProviderConfig): Provider {
  switch (config.type) {
    case 'codespaces':
      return new CodespacesProvider(config);
    
    case 'coder':
      return new CoderProvider(config);
    
    default:
      // Type narrowing exhaustiveness check
      const unknownType = (config as { type: string }).type;
      throw new ProviderNotFoundError(unknownType);
  }
}
