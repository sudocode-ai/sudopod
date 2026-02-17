/**
 * Mock Hub Server Configuration
 *
 * @see s-7utm - Mock Hub Server + HubProvider Implementation
 */

export interface HubServerConfig {
  /** Coder instance URL (e.g., "https://staging.sudocode.ai") */
  coderUrl: string;

  /** Coder admin API token */
  coderToken: string;

  /** Valid API keys for hub auth (Bearer token matching) */
  apiKeys: string[];

  /** Port to listen on. Default: 0 (random, useful for tests) */
  port?: number;
}
