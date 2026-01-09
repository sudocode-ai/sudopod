/**
 * Remote command execution primitives
 * 
 * This module provides utilities for executing commands in a codespace
 * via SSH using the gh CLI.
 */

import type { ExecOptions } from './types.js';

/**
 * Execute a command in the codespace via SSH
 * @param name - Codespace name
 * @param command - Command to execute
 * @param options - Execution options
 * @returns Command output (stdout)
 * @throws Error if command execution fails
 */
export async function execInCodespace(
  name: string,
  command: string,
  options?: ExecOptions
): Promise<string> {
  // TODO: Implement
  throw new Error('Not implemented');
}
