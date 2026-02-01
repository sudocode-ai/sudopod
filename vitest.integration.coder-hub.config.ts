import { defineConfig } from 'vitest/config';
import { baseIntegrationTest } from './tests/integration/base-integration-config.js';

/**
 * Hub Coder tests (port 7081).
 */
export default defineConfig({
  test: {
    ...baseIntegrationTest,
    include: [
      'tests/integration/coder-sdk/hub-user.test.ts',
      'tests/integration/coder-sdk/hub-workspace.test.ts',
      'tests/integration/coder-sdk/hub-e2e.test.ts',
    ],
    setupFiles: ['tests/integration/coder-sdk/setup-hub.ts'],
  },
});
