import { defineConfig } from 'vitest/config';
import { baseIntegrationTest } from './tests/integration/base-integration-config.js';

export default defineConfig({
  test: {
    ...baseIntegrationTest,
    include: ['tests/integration/tailscale/**/*.test.ts'],
  },
});
