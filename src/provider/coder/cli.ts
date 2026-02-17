/**
 * Coder CLI Wrapper — Re-export barrel
 *
 * The implementation has moved to src/coder-sdk/exec.ts.
 * This file re-exports for backward compatibility with existing consumers.
 *
 * @see s-6q31 - Self-Hosted Coder Provider spec
 */

export { createCoderExecFn } from '../../coder-sdk/exec.js';
export type { CoderExecConfig } from '../../coder-sdk/exec.js';
