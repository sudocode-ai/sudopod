/**
 * Coder Provider
 *
 * Implements the Provider interface for Coder using the Coder API and CLI.
 *
 * @see s-9cl3 - Unified Workspace Provider Architecture specification
 * @see s-6q31 - Coder Provider Implementation specification
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
 * Coder provider implementation.
 *
 * Uses the Coder REST API for management operations and `coder` CLI for
 * connection/execution. Authentication uses `Coder-Session-Token` header
 * for both self-hosted and hub flows.
 */
export class CoderProvider implements Provider {
  readonly type: ProviderType = 'coder';
  readonly name = 'Coder';

  constructor(
    private readonly url: string,
    private readonly token: string
  ) {}

  async create(_options: CreateOptions): Promise<Workspace> {
    // TODO: Implement - see s-6q31
    throw new Error('CoderProvider.create() not yet implemented');
  }

  async resume(
    _workspaceId?: string,
    _options?: ResumeOptions
  ): Promise<Workspace> {
    // TODO: Implement - see s-6q31
    throw new Error('CoderProvider.resume() not yet implemented');
  }

  async stop(_workspaceId: string): Promise<void> {
    // TODO: Implement - see s-6q31
    throw new Error('CoderProvider.stop() not yet implemented');
  }

  async delete(_workspaceId: string): Promise<void> {
    // TODO: Implement - see s-6q31
    throw new Error('CoderProvider.delete() not yet implemented');
  }

  async get(_workspaceId: string): Promise<Workspace> {
    // TODO: Implement - see s-6q31
    throw new Error('CoderProvider.get() not yet implemented');
  }

  async list(_filters?: ListWorkspacesOptions): Promise<Workspace[]> {
    // TODO: Implement - see s-6q31
    throw new Error('CoderProvider.list() not yet implemented');
  }
}
