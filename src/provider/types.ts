/**
 * Unified Workspace Provider Types
 *
 * This module defines the Provider interface and all shared types for
 * workspace management. All providers (Codespaces, Sudopod, etc.) implement
 * this interface.
 *
 * @see s-9cl3 - Unified Workspace Provider Architecture specification
 */

// ============================================================================
// Provider Type
// ============================================================================

/**
 * Supported provider types.
 */
export type ProviderType = 'codespaces' | 'sudopod';

// ============================================================================
// Provider Interface
// ============================================================================

/**
 * Provider interface - the single abstraction for workspace management.
 * All providers (Codespaces, Sudopod, etc.) implement this interface.
 *
 * Providers are STATELESS - they don't store user config.
 * The consuming app (CLI/Hub) owns config storage and passes it on each call.
 */
export interface Provider {
  /** Provider identifier */
  readonly type: ProviderType;

  /** Provider display name */
  readonly name: string;

  // ═══════════════════════════════════════════════════════════════════════════
  // LIFECYCLE OPERATIONS
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Create a new workspace.
   * Provisions infrastructure, clones repo, runs setup, starts sudocode server.
   */
  create(options: CreateOptions): Promise<Workspace>;

  /**
   * Resume/reconnect to an existing workspace.
   * Idempotent - ensures:
   *   1. VM is running (starts if stopped)
   *   2. Sudocode server is running (starts if not)
   *   3. Port forwarding is set up
   *   4. Keepalive is bumped
   *
   * Safe to call multiple times - no-ops if already in desired state.
   *
   * @param workspaceId - Optional. If omitted, resumes the most recently created workspace.
   * @param options - Runtime options for the session.
   */
  resume(workspaceId?: string, options?: ResumeOptions): Promise<Workspace>;

  /**
   * Stop a running workspace (pause). VM state is preserved.
   * No-op if already stopped.
   */
  stop(workspaceId: string): Promise<void>;

  /**
   * Permanently delete a workspace.
   */
  delete(workspaceId: string): Promise<void>;

  // ═══════════════════════════════════════════════════════════════════════════
  // QUERY OPERATIONS
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Get workspace details by ID, including connection info.
   */
  get(workspaceId: string): Promise<Workspace>;

  /**
   * List workspaces, optionally filtered.
   */
  list(filters?: ListWorkspacesOptions): Promise<Workspace[]>;
}

// ============================================================================
// Provider Config
// ============================================================================

/**
 * Provider configuration - how to connect to the provider.
 *
 * Authentication model:
 * - Codespaces: No auth needed (gh CLI handles it via `gh auth login`)
 * - Sudopod: API token for sudopod-server
 */
export interface ProviderConfig {
  /** Which provider to use */
  type: ProviderType;

  /**
   * Authentication token (required for Sudopod, ignored for Codespaces).
   *
   * For Sudopod: API token for sudopod-server
   */
  authToken?: string;

  /**
   * Provider URL (required for Sudopod, ignored for Codespaces).
   *
   * For Sudopod: e.g., "https://pods.sudocode.ai"
   */
  url?: string;
}

// ============================================================================
// Create Options
// ============================================================================

/**
 * Full config for creating a new workspace - used only on first creation.
 */
export interface CreateOptions {
  /** Unique name for the workspace */
  name: string;

  /** Git repository to clone */
  repository: {
    owner: string;
    repo: string;
    branch?: string;
  };

  /**
   * Resource hints - provider maps these to available machine types.
   * Provider does best-effort mapping; not all providers support all options.
   */
  resources?: {
    cpuCores?: number;
    memoryGb?: number;
    diskSizeGb?: number;
  };

  /**
   * Days before a stopped workspace is automatically deleted.
   * Required - forces explicit decision about retention.
   *
   * - Codespaces: Maps to retentionPeriodMinutes
   * - Sudopod: Managed by sudopod-server lifecycle
   */
  retentionDays: number;

  /**
   * Provider-specific parameters - passed through to template/API.
   * Unrecognized params are ignored with a warning.
   *
   * Examples:
   * - Codespaces: { machine: 'largePremiumLinux' }
   * - Sudopod: { region: 'us-west', gpu: true }
   */
  providerParams?: Record<string, unknown>;

  /** One-time setup config - applied only during workspace creation */
  setup?: SetupConfig;

  /** Runtime config - also applied during create, and on every resume */
  runtime?: RuntimeConfig;
}

// ============================================================================
// Setup Config (One-Time, Create Only)
// ============================================================================

/**
 * Setup config - applied ONLY during workspace creation.
 * These are one-time setup operations that don't need to run on every resume.
 *
 * The app stores this config for reference, but the provider only uses it
 * during create() - resume() does NOT receive or re-apply these settings.
 */
export interface SetupConfig {
  /**
   * Agents to install during workspace creation.
   * These are installed once and persist across restarts.
   */
  agents?: {
    install: string[]; // e.g., ['claude']
  };

  /**
   * LLM/model configuration for the workspace.
   * Configured once during creation.
   */
  models?: {
    claudeLtt?: string;
    providerConfig?: Record<string, unknown>;
  };

  /**
   * Arbitrary setup script to run during workspace creation.
   * Runs once after the workspace is provisioned and sudocode is installed.
   * Use for: installing dependencies, configuring tools, building .env files, etc.
   *
   * The setup script has access to all environment variables injected by the
   * platform (e.g., Codespaces secrets are automatically available as envvars).
   *
   * Example: "npm install -g typescript && pip install torch"
   */
  setupScript?: string;
}

// ============================================================================
// Runtime Config (Per-Resume)
// ============================================================================

/**
 * Runtime config - passed on every resume() call.
 * These are settings needed to reconnect to a workspace.
 *
 * IMPORTANT: This is intentionally minimal. One-time setup (agents, scripts,
 * tailscale) belongs in SetupConfig and is only applied during create().
 */
export interface RuntimeConfig {
  /**
   * Sudocode server port. Default: 3000.
   * User can override if 3000 conflicts with their application.
   */
  port?: number;

  /**
   * Lifecycle/keepalive configuration.
   * Can be adjusted on each resume (e.g., user wants different timeout).
   */
  lifecycle?: LifecycleConfig;
}

// ============================================================================
// Resume Options
// ============================================================================

/**
 * Config for resuming an existing workspace.
 * Only contains runtime settings - setup is already done.
 */
export interface ResumeOptions {
  runtime?: RuntimeConfig;
}

// ============================================================================
// Lifecycle Config
// ============================================================================

/**
 * Lifecycle configuration for workspace keepalive behavior.
 *
 * The keepalive daemon monitors sudocode activity and extends the workspace
 * deadline to prevent auto-stop during active usage.
 */
export interface LifecycleConfig {
  /**
   * Minutes of sudocode inactivity before allowing workspace to auto-stop.
   * The keepalive daemon stops bumping the deadline after this timeout expires.
   * Default: 60 (1 hour)
   */
  idleTimeoutMinutes?: number;
}

// ============================================================================
// Workspace
// ============================================================================

/**
 * Workspace lifecycle states.
 */
export type WorkspaceStatus =
  | 'creating' // Being provisioned
  | 'starting' // Starting up
  | 'running' // Ready for use
  | 'stopping' // Shutting down
  | 'stopped' // Stopped, can restart
  | 'deleting' // Being deleted
  | 'failed'; // Operation failed

/**
 * Workspace representation - includes all details and connection info.
 * This is the single return type for create(), resume(), and get().
 */
export interface Workspace {
  /** Unique identifier */
  id: string;

  /** Human-readable name */
  name: string;

  /** Provider type */
  provider: ProviderType;

  /** Current status */
  status: WorkspaceStatus;

  /** Repository info (branch not tracked - agents may change it) */
  repository: {
    owner: string;
    repo: string;
  };

  /** Creation timestamp */
  createdAt: Date;

  /** Last activity timestamp */
  lastActivityAt?: Date;

  /**
   * Connection info — how to reach the workspace.
   * What's available depends on the provider and configuration.
   */
  connection: {
    /**
     * Tailscale identity — present when workspace was provisioned with tailscale.
     *
     * This is identity (which node on the tailnet is this workspace), not
     * connection details. The user's tailscale client handles discovery and routing.
     */
    tailscale?: {
      /** Node name on the tailnet (e.g., "sudopod-my-workspace") */
      nodeName: string;
      /** Headscale node ID (numeric). Useful for headscale API calls. */
      nodeId: string;
    };

    /**
     * SSH connection details.
     * Always present — this is the universal fallback access method.
     */
    ssh: {
      /** Full SSH command (e.g., "gh codespace ssh -c name" or "ssh user@host -i key") */
      command: string;
    };

    /**
     * Provider-specific URLs (dashboard, web IDE, etc.).
     * What's available varies by provider:
     * - Codespaces: { ide: "https://name.github.dev", dashboard: "https://github.com/codespaces" }
     * - Sudopod: { dashboard: "https://pods.sudocode.ai/workspaces/id" }
     */
    urls?: Record<string, string>;
  };

  /** Currently forwarded ports (codespaces-specific, not used by sudopod w/ tailscale) */
  forwardedPorts?: Array<{
    local: number;
    remote: number;
    url?: string;
  }>;
}

// ============================================================================
// List Options
// ============================================================================

/**
 * Filters for listing workspaces.
 */
export interface ListWorkspacesOptions {
  /** Filter by status */
  status?: WorkspaceStatus[];
  /** Filter by repository owner */
  owner?: string;
  /** Filter by repository name */
  repo?: string;
  /** Maximum results */
  limit?: number;
}
