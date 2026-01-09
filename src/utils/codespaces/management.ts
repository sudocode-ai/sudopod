/**
 * Codespace lifecycle management primitives
 * 
 * This module provides low-level operations for creating, managing,
 * and monitoring GitHub Codespaces using the gh CLI.
 */

import type { CreateCodespaceOptions, CodespaceInfo } from './types.js';

/**
 * Check if gh CLI is installed
 * @throws Error if GitHub CLI is not installed
 */
export async function checkGhCliInstalled(): Promise<void> {
  // TODO: Implement
  throw new Error('Not implemented');
}

/**
 * Check if authenticated with GitHub
 * @throws Error if not authenticated with GitHub
 */
export async function checkGhAuthenticated(): Promise<void> {
  // TODO: Implement
  throw new Error('Not implemented');
}

/**
 * Create a new GitHub Codespace
 * @param options - Configuration options for the codespace
 * @returns Information about the created codespace
 */
export async function createCodespace(
  options: CreateCodespaceOptions
): Promise<CodespaceInfo> {
  // TODO: Implement
  throw new Error('Not implemented');
}

/**
 * Delete a codespace
 * @param name - Codespace name to delete
 */
export async function deleteCodespace(name: string): Promise<void> {
  // TODO: Implement
  throw new Error('Not implemented');
}

/**
 * List all codespaces
 * @returns Array of codespace information
 */
export async function listCodespaces(): Promise<CodespaceInfo[]> {
  // TODO: Implement
  throw new Error('Not implemented');
}

/**
 * Get information about a specific codespace
 * @param name - Codespace name
 * @returns Codespace information
 */
export async function getCodespaceInfo(name: string): Promise<CodespaceInfo> {
  // TODO: Implement
  throw new Error('Not implemented');
}

/**
 * Wait for codespace to be ready (state = "Available")
 * @param name - Codespace name
 * @param maxRetries - Maximum number of retries (default: 30)
 * @throws Error if codespace fails to start or times out
 */
export async function waitForCodespaceReady(
  name: string,
  maxRetries?: number
): Promise<void> {
  // TODO: Implement
  throw new Error('Not implemented');
}
