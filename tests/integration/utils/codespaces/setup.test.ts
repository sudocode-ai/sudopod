/**
 * Integration test setup validation
 * 
 * This test verifies that the integration test infrastructure is properly configured
 * and that all prerequisites are met before running actual codespace tests.
 * 
 * IMPORTANT: These tests require external resources and should NOT run by default.
 * Set the environment variable RUN_INTEGRATION_TESTS=1 to enable these tests.
 * 
 * Example: RUN_INTEGRATION_TESTS=1 npm run test:integration
 */

import { describe, it, expect } from 'vitest';

// Skip integration tests unless explicitly enabled
if (!process.env.RUN_INTEGRATION_TESTS) {
  console.log('\n⚠️  Skipping integration tests: RUN_INTEGRATION_TESTS not set');
  console.log('   To run integration tests: RUN_INTEGRATION_TESTS=1 npm run test:integration\n');
  process.exit(0);
}
import {
  checkGhCliInstalled,
  checkGhAuthenticated,
  verifyTestPrerequisites,
} from './helpers.js';

describe('Integration Test Setup', () => {
  it('should have GitHub CLI installed', async () => {
    await expect(checkGhCliInstalled()).resolves.not.toThrow();
  });

  it('should be authenticated with GitHub', async () => {
    await expect(checkGhAuthenticated()).resolves.not.toThrow();
  });

  it('should pass all prerequisite checks', async () => {
    await expect(verifyTestPrerequisites()).resolves.not.toThrow();
  });
});
