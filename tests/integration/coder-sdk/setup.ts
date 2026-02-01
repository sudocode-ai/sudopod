/**
 * Aggregate setup — provisions both self-hosted and hub Coder stacks.
 *
 * Used by vitest.integration.config.ts (the catch-all config).
 * For running only one flow, use setup-self-hosted.ts or setup-hub.ts directly.
 */

import './setup-self-hosted.js';
import './setup-hub.js';
