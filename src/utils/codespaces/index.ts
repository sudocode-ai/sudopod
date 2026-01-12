/**
 * Codespace primitives library
 * 
 * This module re-exports all codespace primitive operations for easy access.
 * These primitives are low-level, independently testable utilities that can
 * be composed to build higher-level codespace deployment functionality.
 */

// Types
export type {
  CreateCodespaceOptions,
  CodespaceInfo,
  ExecOptions,
  IdleTimeoutDaemonOptions
} from './types.js';

// Management primitives
export {
  checkGhCliInstalled,
  checkGhAuthenticated,
  createCodespace,
  deleteCodespace,
  listCodespaces,
  getCodespaceInfo,
  waitForCodespaceReady
} from './management.js';

// Execution primitives
export {
  execInCodespace
} from './execution.js';

// Port primitives
export {
  checkPortListening,
  waitForPortListening,
  forwardPort,
  getCodespacePortUrl,
  setPortVisibility
} from './ports.js';

// Installation primitives
export {
  installClaudeCode,
  installSudocodeGlobally,
  installSudocodeFromLocal,
  initializeSudocodeProject
} from './installation.js';

// Server primitives
export {
  startSudocodeServer
} from './server.js';

// Idle timeout daemon primitives
export {
  startIdleTimeoutDaemon,
  stopIdleTimeoutDaemon,
  isIdleTimeoutDaemonRunning
} from './keepalive.js';
