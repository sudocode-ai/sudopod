/**
 * Configuration for the sudopod HTTP server.
 */
export interface ServerConfig {
  /**
   * Valid API keys for authentication.
   * Requests must include `Authorization: Bearer <key>` header.
   */
  apiKeys: string[];

  /**
   * Optional base path prefix for all routes.
   * Example: "/api/v1" would make routes like "/api/v1/workspaces"
   */
  basePath?: string;
}
