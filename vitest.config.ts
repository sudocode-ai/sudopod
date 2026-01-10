import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    // Only include unit tests by default (exclude integration and e2e tests)
    include: ['tests/unit/**/*.test.ts'],
    exclude: ['**/integration/**', '**/e2e/**', 'node_modules/**'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      exclude: [
        'node_modules/',
        'dist/',
        'tests/',
        '**/*.test.ts',
        '**/*.spec.ts',
      ],
    },
  },
});
