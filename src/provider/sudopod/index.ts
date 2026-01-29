/**
 * Sudopod Provider
 *
 * Implements the Provider interface for Sudopod using the sudopod-server API.
 *
 * @see s-9cl3 - Unified Workspace Provider Architecture specification
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
 * Sudopod provider implementation.
 *
 * Uses the sudopod-server REST API for all operations.
 * Authentication via API token.
 */
export class SudopodProvider implements Provider {
  readonly type: ProviderType = 'sudopod';
  readonly name = 'Sudopod';

  constructor(
    private readonly url: string,
    private readonly token: string
  ) {}

  async create(_options: CreateOptions): Promise<Workspace> {
    // TODO: Implement
    throw new Error('SudopodProvider.create() not yet implemented');
  }

  async resume(
    _workspaceId?: string,
    _options?: ResumeOptions
  ): Promise<Workspace> {
    // TODO: Implement
    throw new Error('SudopodProvider.resume() not yet implemented');
  }

  async stop(_workspaceId: string): Promise<void> {
    // TODO: Implement
    throw new Error('SudopodProvider.stop() not yet implemented');
  }

  async delete(_workspaceId: string): Promise<void> {
    // TODO: Implement
    throw new Error('SudopodProvider.delete() not yet implemented');
  }

  async get(_workspaceId: string): Promise<Workspace> {
    // TODO: Implement
    throw new Error('SudopodProvider.get() not yet implemented');
  }

  async list(_filters?: ListWorkspacesOptions): Promise<Workspace[]> {
    // TODO: Implement
    throw new Error('SudopodProvider.list() not yet implemented');
  }
}
