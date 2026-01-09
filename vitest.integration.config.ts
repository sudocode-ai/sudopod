import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['tests/integration/**/*.test.ts'],
    // Integration tests require longer timeouts
    testTimeout: 600000, // 10 minutes for builds and deployments
    hookTimeout: 120000, // 2 minutes for setup/teardown
    // Run integration tests serially to avoid resource conflicts
    pool: 'forks',
    poolOptions: {
      forks: {
        singleFork: true,
      },
    },
    // Disable coverage for integration tests
    coverage: {
      enabled: false,
    },
    // Stop on first failure to conserve codespace resources
    bail: 1,
  },
});
