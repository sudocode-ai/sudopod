/**
 * Re-export barrel for backward compatibility.
 * All shared setup utilities now live in src/provider/setup.ts.
 *
 * @deprecated Import from '../setup.js' instead.
 */
export {
  installSudocode,
  applySetupConfig,
  setupTailscale,
  startServices,
  DEFAULT_STATE_DIR,
} from '../setup.js';

export type {
  ExecFn,
  TailscaleTier,
  TailscaleSetupResult,
} from '../setup.js';
