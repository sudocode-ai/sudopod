/**
 * Coder Provider Module
 *
 * Exports all Coder provider components.
 *
 * @see s-6q31 - Coder Provider Implementation specification
 */

// Re-export types
export * from './types.js';

// Re-export API client
export { CoderApiClient, CoderApiError } from './api.js';

// Re-export CLI utilities
export {
  configureCli,
  execInWorkspace,
  bumpWorkspace,
  isProcessRunning,
  writeFile,
  readFile,
  waitForPort,
  type ExecResult,
  type ExecOptions,
} from './cli.js';

// Re-export mapper functions
export {
  mapStatus,
  mapToWorkspace,
  extractRepoInfo,
  buildParameters,
  buildParametersUnfiltered,
} from './mapper.js';

// Re-export keepalive utilities
export {
  generateKeepaliveScript,
  getKeepaliveScriptPath,
  getKeepalivePidPath,
  generateStartCommand,
  generateStopCommand,
  generateCheckCommand,
} from './keepalive.js';
