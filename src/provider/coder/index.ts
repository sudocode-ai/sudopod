/**
 * CoderProvider — Thin Provider wrapper around CoderOrchestrator.
 *
 * Implements the Provider interface by delegating all operations to
 * CoderOrchestrator from the coder-sdk. This keeps the provider layer
 * minimal while the orchestrator holds the reusable lifecycle logic
 * shared between CoderProvider (CLI) and the Hub server.
 *
 * @see s-6q31 - Self-Hosted Coder Provider spec
 * @see s-9cl3 - Unified Workspace Provider Architecture
 */

import { CoderOrchestrator } from '../../coder-sdk/orchestrator.js';
import type {
  Provider,
  CoderConfig,
  CreateOptions,
  Workspace,
  ListWorkspacesOptions,
} from '../types.js';

export class CoderProvider implements Provider {
  readonly name = 'Coder';
  private orchestrator: CoderOrchestrator;

  constructor(config: CoderConfig) {
    this.orchestrator = new CoderOrchestrator({
      baseUrl: config.url,
      token: config.authToken,
    });
  }

  create(options: CreateOptions): Promise<Workspace> {
    return this.orchestrator.create(options);
  }

  resume(workspaceId?: string): Promise<Workspace> {
    return this.orchestrator.resume(workspaceId);
  }

  stop(workspaceId: string): Promise<void> {
    return this.orchestrator.stop(workspaceId);
  }

  delete(workspaceId: string): Promise<void> {
    return this.orchestrator.delete(workspaceId);
  }

  get(workspaceId: string): Promise<Workspace> {
    return this.orchestrator.get(workspaceId);
  }

  list(filters?: ListWorkspacesOptions): Promise<Workspace[]> {
    return this.orchestrator.list(filters);
  }
}
