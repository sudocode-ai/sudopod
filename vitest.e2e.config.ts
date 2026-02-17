import { defineConfig } from 'vitest/config';
import { baseIntegrationTest } from './tests/integration/base-integration-config.js';

/**
 * E2E tests — full flow verification (workspace creation + sudocode server health).
 * Provisions all required infrastructure via setup files.
 */
export default defineConfig({
  test: {
    ...baseIntegrationTest,
    include: ['tests/integration/**/*e2e*.test.ts'],
    setupFiles: [
      'tests/integration/coder-sdk/setup-hub.ts',
    ],
  },
});
