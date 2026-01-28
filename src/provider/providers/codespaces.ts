/**
 * GitHub Codespaces Provider
 *
 * Implements the Provider interface for GitHub Codespaces using the `gh` CLI.
 *
 * @see s-9cl3 - Unified Workspace Provider Architecture specification
 * @see s-84xz - Codespaces Provider Implementation specification
 */

import type {
  Provider,
  ProviderType,
  CreateOptions,
  ResumeOptions,
  Workspace,
  ListWorkspacesOptions,
} from '../types.js';

/**
 * GitHub Codespaces provider implementation.
 *
 * Uses the `gh` CLI for all operations. Authentication is handled by
 * `gh auth login` - no token needed in provider config.
 */
export class CodespacesProvider implements Provider {
  readonly type: ProviderType = 'codespaces';
  readonly name = 'GitHub Codespaces';

  async create(_options: CreateOptions): Promise<Workspace> {
    // TODO: Implement - see s-84xz
    throw new Error('CodespacesProvider.create() not yet implemented');
  }

  async resume(
    _workspaceId?: string,
    _options?: ResumeOptions
  ): Promise<Workspace> {
    // TODO: Implement - see s-84xz
    throw new Error('CodespacesProvider.resume() not yet implemented');
  }

  async stop(_workspaceId: string): Promise<void> {
    // TODO: Implement - see s-84xz
    throw new Error('CodespacesProvider.stop() not yet implemented');
  }

  async delete(_workspaceId: string): Promise<void> {
    // TODO: Implement - see s-84xz
    throw new Error('CodespacesProvider.delete() not yet implemented');
  }

  async get(_workspaceId: string): Promise<Workspace> {
    // TODO: Implement - see s-84xz
    throw new Error('CodespacesProvider.get() not yet implemented');
  }

  async list(_filters?: ListWorkspacesOptions): Promise<Workspace[]> {
    // TODO: Implement - see s-84xz
    throw new Error('CodespacesProvider.list() not yet implemented');
  }
}
