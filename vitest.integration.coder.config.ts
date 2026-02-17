import { defineConfig } from 'vitest/config';
import { baseIntegrationTest } from './tests/integration/base-integration-config.js';

/**
 * Self-hosted Coder tests (port 7080).
 * Includes coder-sdk self-hosted tests + provider/coder tests.
 */
export default defineConfig({
  test: {
    ...baseIntegrationTest,
    include: [
      'tests/integration/coder-sdk/user.test.ts',
      'tests/integration/coder-sdk/template.test.ts',
      'tests/integration/coder-sdk/workspace.test.ts',
      'tests/integration/coder-sdk/errors.test.ts',
      'tests/integration/provider/coder/**/*.test.ts',
    ],
    setupFiles: ['tests/integration/coder-sdk/setup-self-hosted.ts'],
  },
});
