/**
 * Unified Workspace Provider Types
 *
 * This module defines the Provider interface and all shared types for
 * workspace management. All providers implement this interface.
 *
 * @see s-9cl3 - Unified Workspace Provider Architecture specification
 */

// ============================================================================
// Provider Configs
// ============================================================================

/**
 * GitHub Codespaces provider configuration.
 * Auth-only — machine sizing is specified per-workspace in CreateOptions.
 */
export interface CodespacesConfig {
  /** GitHub auth token (retrieved via `gh auth token`) */
  authToken: string;
}

/**
 * Self-hosted / direct Coder provider configuration.
 * Auth & host only — template params are specified per-workspace in CreateOptions.
 */
export interface CoderConfig {
  /** URL of the Coder instance (e.g., "https://coder.company.com") */
  url: string;

  /** Coder session token (user creates via Coder UI or `coder tokens create`) */
  authToken: string;
}

/**
 * Sudocode Hub provider configuration.
 * Auth & host only — VM sizing is specified per-workspace in CreateOptions.
 * The hub handles auth mapping, quota enforcement, and usage tracking.
 * Internally uses the sudopod-coder-sdk to delegate to Coder.
 */
export interface HubConfig {
  /** URL of the sudocode-hub (e.g., "https://hub.sudocode.ai") */
  url: string;

  /** Sudocode user auth token (issued by hub) */
  authToken: string;
}

// ============================================================================
// Provider Interface
// ============================================================================

/**
 * Provider interface - the single abstraction for workspace management.
 * All providers implement this interface.
 *
 * Each provider communicates with its own backend via stateless API calls —
 * no persistent connections are required between the SDK and the provider backend.
 */
export interface Provider {
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
   *   2. Services are running (starts if not, using on-disk manifest)
   *   3. Port forwarding is set up
   *   4. Keepalive is bumped
   *
   * Safe to call multiple times - no-ops if already in desired state.
   * Runtime config is read from the on-disk workspace manifest.
   *
   * @param workspaceId - Optional. If omitted, resumes the most recently created workspace.
   */
  resume(workspaceId?: string): Promise<Workspace>;

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
// Create Options
// ============================================================================

/**
 * Full config for creating a new workspace - used only on first creation.
 *
 * Includes both provider-agnostic settings (name, repo, retention) and
 * optional provider-specific hints (machineType, templateParams).
 * Each provider decides which fields it respects.
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
   * Days before a stopped workspace is automatically deleted.
   * Required - forces explicit decision about retention.
   */
  retentionDays: number;

  /**
   * Machine type / size hint.
   * Provider-specific — each provider interprets this in its own way:
   * - Codespaces: machine SKU (e.g., 'basicLinux32gb', 'largePremiumLinux')
   * - Hub: VM size preset (e.g., 'S', 'M', 'L')
   * - Coder: may map to template parameters
   *
   * If omitted, the provider selects a default.
   */
  machineType?: string;

  /**
   * Additional provider-specific template parameters.
   * Passed through to the provider's provisioning layer.
   * - Coder: forwarded as Coder template parameters
   * - Other providers may ignore this
   */
  templateParams?: Record<string, unknown>;

  /** One-time setup config - applied only during workspace creation */
  setup?: SetupConfig;
}

// ============================================================================
// Service Config
// ============================================================================

/**
 * Configuration for a service to install/run in a workspace.
 * The name must match an entry in the service registry.
 */
export interface ServiceConfig {
  /** Service name — must match a registry entry (e.g., 'sudocode', 'claude-code', 'aider'). */
  name: string;

  /** Override the registry's default port for this service. */
  port?: number;
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
   * Services to install and optionally run during workspace creation.
   * Names must match entries in the service registry (e.g., 'sudocode', 'claude-code', 'aider').
   * Each entry can override the registry's default port.
   */
  services?: ServiceConfig[];

  /**
   * Credentials for the workspace.
   * Configured once during creation.
   */
  credentials?: {
    claudeLtt?: string;
  };

  /**
   * Lifecycle configuration.
   */
  lifecycle?: {
    /** Minutes of inactivity before allowing workspace to auto-stop. Default: 60. */
    idleTimeoutMinutes?: number;
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

  /**
   * Tailscale configuration for private network access.
   * When provided, the provider installs Tailscale and joins the specified tailnet
   * during workspace creation.
   *
   * On resume(), the provider detects the existing Tailscale config on disk
   * and restarts the daemon — no auth key is needed for reconnection.
   *
   * @see s-8gxf - Tailscale Integration spec
   */
  tailscale?: {
    /**
     * Pre-authentication key for joining the tailnet.
     * Generated by the caller (e.g., SDK calls Headscale API using a stored API key).
     */
    authKey: string;

    /**
     * Control server URL.
     * Required for self-hosted Headscale. Omit for Tailscale SaaS
     * (defaults to Tailscale control plane).
     */
    controlServer?: string;

    /**
     * Directory for persisting Tailscale daemon state (tailscaled.state).
     * Must be on a volume that survives codespace stop/start so that
     * Tailscale can reconnect automatically without a fresh auth key.
     *
     * Default: /workspaces/.tailscale
     *
     * @see s-9cl3 design decision #16
     */
    stateDir?: string;
  };
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
      /** Node name on the tailnet */
      nodeName: string;
      /** Headscale node ID (numeric). Useful for headscale API calls. */
      nodeId: string;
    };

    /**
     * SSH connection details.
     * Always present — this is the universal fallback access method.
     */
    ssh: {
      /** Full SSH command (provider-specific format) */
      command: string;
    };

    /**
     * Provider-specific URLs (dashboard, web IDE, etc.).
     * What's available varies by provider.
     */
    urls?: Record<string, string>;
  };

  /** Currently forwarded ports (provider-specific, may not apply to all providers) */
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
