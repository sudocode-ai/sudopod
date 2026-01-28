/**
 * Connector factory function
 */

import type { ConnectorConfig, CodespacesConfig, CoderConfig } from '../types.js';
import type { Connector } from './connector.js';
import { ConnectorNotFoundError } from './errors.js';

// Connector implementations
import { CodespacesConnector } from '../connectors/codespaces.js';
import { CoderConnector } from '../connectors/coder.js';

/**
 * Creates a connector instance based on the provided configuration.
 * 
 * This is the main entry point for creating connector instances. The factory
 * automatically instantiates the appropriate connector type based on the
 * configuration's type field.
 * 
 * Note: Connectors are CLI-side adapters that route requests to providers.
 * See s-1u2m for the distinction between Connectors and Providers.
 * 
 * @param config - Connector configuration specifying type and connector-specific settings
 * @returns A Connector instance configured for the specified connector type
 * @throws {ConnectorNotFoundError} If the connector type is not supported
 * 
 * @example
 * ```typescript
 * // Create a Codespaces connector
 * const connector = createConnector({
 *   type: 'codespaces'
 * });
 * 
 * // Create a Coder connector
 * const connector = createConnector({
 *   type: 'coder',
 *   url: 'https://coder.example.com',
 *   apiKey: 'your-api-key'
 * });
 * ```
 */
export function createConnector(config: ConnectorConfig): Connector {
  switch (config.type) {
    case 'codespaces':
      return new CodespacesConnector(config);
    
    case 'coder':
      return new CoderConnector(config);
    
    default:
      // Type narrowing exhaustiveness check
      const unknownType = (config as { type: string }).type;
      throw new ConnectorNotFoundError(unknownType);
  }
}
