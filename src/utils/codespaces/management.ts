/**
 * Codespace lifecycle management primitives
 * 
 * This module provides low-level operations for creating, managing,
 * and monitoring GitHub Codespaces using the gh CLI.
 */

import { exec } from 'child_process';
import { promisify } from 'util';
import type { CreateCodespaceOptions, CodespaceInfo } from './types.js';

const execPromise = promisify(exec);

/**
 * Check if gh CLI is installed
 * @throws Error if GitHub CLI is not installed
 */
export async function checkGhCliInstalled(): Promise<void> {
  try {
    await execPromise('gh --version');
  } catch {
    throw new Error('GitHub CLI not found. Install from https://cli.github.com');
  }
}

/**
 * Check if authenticated with GitHub
 * @throws Error if not authenticated with GitHub
 */
export async function checkGhAuthenticated(): Promise<void> {
  try {
    await execPromise('gh auth status');
  } catch {
    throw new Error('Not authenticated with GitHub. Run: gh auth login');
  }
}

/**
 * Create a new GitHub Codespace
 * @param options - Configuration options for the codespace
 * @returns Information about the created codespace
 */
export async function createCodespace(
  options: CreateCodespaceOptions
): Promise<CodespaceInfo> {
  const args = [
    'codespace create',
    `--repo ${options.repository}`,
    options.branch ? `--branch ${options.branch}` : '',
    options.machine ? `--machine ${options.machine}` : '',
    options.idleTimeout ? `--idle-timeout ${options.idleTimeout}m` : '',
    options.retentionPeriod ? `--retention-period ${options.retentionPeriod}d` : '',
    '--json name,state,url,repository,branch,createdAt,machine'
  ].filter(Boolean).join(' ');

  try {
    const { stdout } = await execPromise(`gh ${args}`);
    return JSON.parse(stdout) as CodespaceInfo;
  } catch (error: any) {
    throw new Error(`Failed to create codespace: ${error.message}`);
  }
}

/**
 * Delete a codespace
 * @param name - Codespace name to delete
 */
export async function deleteCodespace(name: string): Promise<void> {
  try {
    await execPromise(`gh codespace delete --codespace ${name} --force`);
  } catch (error: any) {
    throw new Error(`Failed to delete codespace ${name}: ${error.message}`);
  }
}

/**
 * List all codespaces
 * @returns Array of codespace information
 */
export async function listCodespaces(): Promise<CodespaceInfo[]> {
  try {
    const { stdout } = await execPromise(
      'gh codespace list --json name,state,url,repository,branch,createdAt,machine'
    );
    return JSON.parse(stdout) as CodespaceInfo[];
  } catch (error: any) {
    throw new Error(`Failed to list codespaces: ${error.message}`);
  }
}

/**
 * Get information about a specific codespace
 * @param name - Codespace name
 * @returns Codespace information
 */
export async function getCodespaceInfo(name: string): Promise<CodespaceInfo> {
  try {
    const { stdout } = await execPromise(
      `gh codespace view --codespace ${name} --json name,state,url,repository,branch,createdAt,machine`
    );
    return JSON.parse(stdout) as CodespaceInfo;
  } catch (error: any) {
    throw new Error(`Failed to get codespace info for ${name}: ${error.message}`);
  }
}

/**
 * Wait for codespace to be ready (state = "Available")
 * @param name - Codespace name
 * @param maxRetries - Maximum number of retries (default: 30)
 * @throws Error if codespace fails to start or times out
 */
export async function waitForCodespaceReady(
  name: string,
  maxRetries: number = 30
): Promise<void> {
  for (let i = 0; i < maxRetries; i++) {
    try {
      const info = await getCodespaceInfo(name);
      
      if (info.state === 'Available') {
        return;
      }
      
      if (info.state === 'Failed' || info.state === 'Shutdown') {
        throw new Error(`Codespace ${name} failed to start: ${info.state}`);
      }
      
      // Wait 2 seconds before next check
      await new Promise(resolve => setTimeout(resolve, 2000));
    } catch (error: any) {
      // If it's a state error, rethrow immediately
      if (error.message.includes('failed to start')) {
        throw error;
      }
      // Otherwise wait and retry
      await new Promise(resolve => setTimeout(resolve, 2000));
    }
  }
  
  throw new Error(`Codespace ${name} not ready after ${maxRetries * 2}s`);
}
