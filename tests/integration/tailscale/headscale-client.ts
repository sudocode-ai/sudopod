/**
 * Re-export from production module.
 * Keeps existing integration test imports working.
 */
export {
  HeadscaleClient,
  HeadscaleApiError,
  type HeadscaleUser,
  type HeadscalePreAuthKey,
  type HeadscaleNode,
  type HeadscaleClientOptions,
} from '../../../src/headscale/client.js';
