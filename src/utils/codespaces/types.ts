/**
 * Common types and interfaces for codespace primitives
 */

/**
 * Configuration for creating a codespace
 */
export interface CreateCodespaceOptions {
  /** Repository in owner/repo format */
  repository: string;
  
  /** Git branch to checkout (optional, uses default branch if not specified) */
  branch?: string;
  
  /** Machine type (e.g., 'basicLinux32gb', 'standardLinux32gb') */
  machine?: string;
  
  /** Idle timeout in minutes (max: 240 for GitHub) */
  idleTimeout?: number;
  
  /** Retention period in days before auto-deletion */
  retentionPeriod?: number;
}

/**
 * Codespace information from gh CLI
 */
export interface CodespaceInfo {
  /** Unique codespace name */
  name: string;
  
  /** Display name */
  displayName?: string;
  
  /** Current state (Available, Starting, Shutdown, etc.) */
  state: string;
  
  /** Web URL to access codespace */
  url: string;
  
  /** Repository */
  repository?: string;
  
  /** Git branch */
  branch?: string;
  
  /** Creation timestamp */
  createdAt?: string;
  
  /** Machine type */
  machine?: string;
}

/**
 * Options for executing commands in codespace
 */
export interface ExecOptions {
  /** Timeout in milliseconds (default: 120000 = 2 minutes) */
  timeout?: number;
  
  /** Working directory (default: repo root) */
  cwd?: string;
  
  /** Stream output in real-time (default: true) */
  streamOutput?: boolean;
}

/**
 * Options for starting traffic monitor daemon
 */
export interface TrafficMonitorOptions {
  /** Codespace name */
  codespaceName: string;
  
  /** Port where sudocode server is running */
  serverPort: number;
  
  /** Path to sudocode server log file (e.g., /tmp/sudocode-3000.log) */
  serverLogPath: string;
  
  /** Keepalive duration in hours */
  keepAliveHours: number;
  
  /** SSH keepalive interval in minutes (default: 0.5 = 30 seconds) */
  sshIntervalMinutes?: number;
}
