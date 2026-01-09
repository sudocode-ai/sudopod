/**
 * Integration test setup validation
 * 
 * This test verifies that the integration test infrastructure is properly configured
 * and that all prerequisites are met before running actual codespace tests.
 */

import { describe, it, expect } from 'vitest';
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
