import { defineConfig } from 'vitest/config';
import { baseIntegrationTest } from './tests/integration/base-integration-config.js';

/**
 * Aggregate integration test config — runs ALL integration suites.
 *
 * Includes the Coder SDK setup file because the majority of suites
 * depend on it. Suites that don't need Coder (tailscale, client,
 * codespaces) gracefully skip when env vars are absent.
 *
 * For running individual suites without triggering Coder setup,
 * use the per-suite configs instead:
 *   vitest.integration.coder.config.ts
 *   vitest.integration.tailscale.config.ts
 *   vitest.integration.codespaces.config.ts
 *   vitest.integration.client.config.ts
 */
export default defineConfig({
  test: {
    ...baseIntegrationTest,
    include: ['tests/integration/**/*.test.ts'],
    setupFiles: ['tests/integration/coder-sdk/setup.ts'],
  },
});
