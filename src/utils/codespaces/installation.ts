/**
 * Software installation primitives
 * 
 * This module provides utilities for installing software in a codespace,
 * including Claude Code and sudocode packages.
 * 
 * All installation functions support:
 * - Long operation timeouts (5-10 minutes)
 * - Real-time output streaming for visibility
 * - Proper error handling and reporting
 */

import { execInCodespace } from './execution.js';

/**
 * Install Claude Code in the codespace via curl install script
 * 
 * Downloads and executes the official Claude Code installation script
 * from https://claude.ai/install.sh. This is the recommended way to
 * install Claude Code in a fresh environment.
 * 
 * The installation:
 * - Downloads the latest Claude Code binary
 * - Installs it to the user's home directory
 * - Makes it available in the PATH
 * 
 * Uses login shell (bash -l -c) for proper environment setup.
 * Timeout is set to 5 minutes to accommodate slow network connections.
 * 
 * @param name - Codespace name
 * @throws Error if installation fails or times out
 * 
 * @example
 * ```typescript
 * // Install Claude Code in a codespace
 * await installClaudeCode('mycodespace-abc123');
 * 
 * // Verify installation
 * const version = await execInCodespace('mycodespace-abc123', 'claude --version');
 * console.log('Installed:', version);
 * ```
 */
export async function installClaudeCode(
  name: string
): Promise<void> {
  await execInCodespace(
    name,
    'curl -fsSL https://claude.ai/install.sh | bash',
    {
      timeout: 300000, // 5 minutes
      streamOutput: true
    }
  );
}

/**
 * Install sudocode packages globally from npm
 * 
 * Installs the published sudocode packages from npm registry:
 * - @sudocode-ai/cli - Command-line interface
 * - @sudocode-ai/local-server - Local server for sudocode operations
 * 
 * This is the standard installation method for production use.
 * For development/testing, use `installSudocodeFromLocal()` instead.
 * 
 * Uses login shell (bash -l -c) for proper environment setup.
 * Timeout is set to 5 minutes to accommodate npm registry download times
 * and dependency installation.
 * 
 * @param name - Codespace name
 * @throws Error if npm installation fails or times out
 * 
 * @example
 * ```typescript
 * // Install latest version from npm
 * await installSudocodeGlobally('mycodespace-abc123');
 * 
 * // Verify installation
 * const version = await execInCodespace('mycodespace-abc123', 'sudocode --version');
 * console.log('Installed:', version);
 * ```
 */
export async function installSudocodeGlobally(
  name: string
): Promise<void> {
  await execInCodespace(
    name,
    'npm install -g @sudocode-ai/cli @sudocode-ai/local-server',
    {
      timeout: 300000, // 5 minutes
      streamOutput: true
    }
  );
}

/**
 * Install sudocode from local repository (dev mode)
 * 
 * Builds and links sudocode packages from the local repository in the workspace.
 * This is used for development and testing with unreleased changes.
 * 
 * The installation process:
 * 1. Runs `npm install` to install dependencies
 * 2. Runs `npm run build` to compile TypeScript
 * 3. Runs `npm run link` to make packages globally available via symlinks
 * 
 * Uses login shell (bash -l -c) which runs from the workspace directory by default.
 * 
 * Requirements:
 * - The repository must be cloned in the workspace
 * - The repository must have build and link scripts in package.json
 * - Node.js and npm must be available in the codespace
 * 
 * Timeout is set to 15 minutes to accommodate:
 * - Dependency installation (can be large)
 * - TypeScript compilation
 * - Package linking
 * 
 * @param name - Codespace name
 * @throws Error if build or link fails, or if operations timeout
 * 
 * @example
 * ```typescript
 * // Install from local repository (runs in /workspaces/sudocode automatically)
 * await installSudocodeFromLocal('mycodespace-abc123');
 * 
 * // Verify linked installation
 * const whichCli = await execInCodespace(
 *   'mycodespace-abc123',
 *   'which sudocode',
 *   { streamOutput: false }
 * );
 * console.log('CLI location:', whichCli);
 * // Should contain '/workspaces/sudocode' indicating it's linked
 * ```
 */
export async function installSudocodeFromLocal(
  name: string
): Promise<void> {
  // Chain commands: install deps, build, and link
  // Login shell runs from workspace directory by default
  const commands = [
    'npm install',
    'npm run build',
    'npm run link'
  ].join(' && ');

  await execInCodespace(
    name,
    commands,
    {
      timeout: 900000, // 15 minutes (increased from 10 to handle slower installs)
      streamOutput: true
    }
  );
}

/**
 * Initialize sudocode project in workspace
 * 
 * Runs `sudocode init` to initialize the project with sudocode configuration.
 * This creates the `.sudocode` directory and necessary configuration files.
 * 
 * The function includes an existence check:
 * - If `.sudocode` directory already exists, skips initialization
 * - If `.sudocode` directory doesn't exist, runs `sudocode init`
 * 
 * This idempotent behavior ensures the function can be called multiple times
 * without errors or duplicate initialization.
 * 
 * Uses login shell (bash -l -c) which runs from the workspace directory by default.
 * 
 * Prerequisites:
 * - sudocode CLI must be installed (either globally or locally)
 * - Workspace directory must exist
 * 
 * @param name - Codespace name
 * @throws Error if initialization fails
 * 
 * @example
 * ```typescript
 * // Initialize project (runs in /workspaces/<repo> automatically)
 * await initializeSudocodeProject('mycodespace-abc123');
 * 
 * // Verify initialization
 * const configExists = await execInCodespace(
 *   'mycodespace-abc123',
 *   'test -d .sudocode && echo "exists"',
 *   { streamOutput: false }
 * );
 * console.log('Config directory:', configExists); // "exists"
 * 
 * // Safe to call multiple times (idempotent)
 * await initializeSudocodeProject('mycodespace-abc123');
 * await initializeSudocodeProject('mycodespace-abc123');
 * // No errors, initialization only happens once
 * ```
 */
export async function initializeSudocodeProject(
  name: string
): Promise<void> {
  // Check if .sudocode directory already exists
  // Login shell runs from workspace directory, so use relative path
  const exists = await execInCodespace(
    name,
    `test -d .sudocode && echo "1" || echo "0"`,
    { streamOutput: false, timeout: 5000 }
  );

  // Only initialize if directory doesn't exist
  if (exists.trim() === '0') {
    await execInCodespace(
      name,
      'sudocode init',
      { 
        timeout: 30000, // 30 seconds (init is usually fast)
        streamOutput: true
      }
    );
  }
}
