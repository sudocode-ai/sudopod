/**
 * Shared vitest test settings for all integration test suites.
 *
 * Import and spread into per-suite configs to avoid duplication.
 * This is NOT a vitest config — just a plain settings object.
 */
export const baseIntegrationTest = {
  globals: true,
  environment: 'node' as const,
  testTimeout: 600_000, // 10 minutes for builds and deployments
  hookTimeout: 600_000, // 10 minutes — setup may provision Docker stacks
  pool: 'forks' as const,
  poolOptions: {
    forks: {
      singleFork: true, // Serial execution to avoid resource conflicts
    },
  },
  coverage: {
    enabled: false,
  },
  bail: 1, // Stop on first failure to conserve resources
};
