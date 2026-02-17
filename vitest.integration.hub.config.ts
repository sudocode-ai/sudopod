import { defineConfig } from 'vitest/config';
import { baseIntegrationTest } from './tests/integration/base-integration-config.js';

/**
 * Hub provider E2E tests.
 * Starts mock hub server in-process, delegates to staging Coder.
 */
export default defineConfig({
  test: {
    ...baseIntegrationTest,
    include: [
      'tests/integration/provider/hub/**/*.test.ts',
    ],
    setupFiles: ['tests/integration/provider/hub/setup.ts'],
  },
});
