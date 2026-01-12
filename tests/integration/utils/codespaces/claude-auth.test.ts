/**
 * Integration test for Claude Code OAuth token support
 *
 * This test verifies that the CLAUDE_CODE_OAUTH_TOKEN environment variable is properly
 * passed to the sudocode server when starting it in a codespace.
 *
 * IMPORTANT: These tests require external resources and should NOT run by default.
 * Set the environment variable RUN_INTEGRATION_TESTS=1 to enable these tests.
 *
 * This test reads the Claude Code OAuth token from tests/.env.secrets file.
 * See the test output for instructions on how to set up the secrets file.
 *
 * Example: RUN_INTEGRATION_TESTS=1 npm run test:integration
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';

// Skip integration tests unless explicitly enabled
if (!process.env.RUN_INTEGRATION_TESTS) {
  console.log('\n⚠️  Skipping integration tests: RUN_INTEGRATION_TESTS not set');
  console.log('   To run integration tests: RUN_INTEGRATION_TESTS=1 npm run test:integration\n');
  process.exit(0);
}

import {
  createCodespace,
  deleteCodespace,
  startSudocodeServer,
  execInCodespace,
  waitForPortListening,
  installClaudeCode,
  waitForCodespaceReady,
} from '../../../../src/utils/codespaces/index.js';
import {
  verifyTestPrerequisites,
  trackCodespace,
  cleanupTrackedCodespaces,
  generateTestCodespaceName,
  markTestFailed,
  getSecret,
  printSecretsInstructions,
} from './helpers.js';

describe('Claude Auth Token Support', () => {
  const testPort = 3000;
  let codespaceName: string;
  let claudeAuthToken: string | undefined;

  beforeAll(async () => {
    await verifyTestPrerequisites();

    // Try to load auth token from secrets file
    claudeAuthToken = await getSecret('CLAUDE_CODE_OAUTH_TOKEN');

    // Skip this test if no auth token is provided
    if (!claudeAuthToken) {
      printSecretsInstructions(
        'CLAUDE_CODE_OAUTH_TOKEN',
        'Claude Code OAuth token for testing Claude integration',
        'sk-ant-oat01-xxxxxxxxxxxxxxxxxxxxxxxxxxxxx'
      );
      console.log('⚠️  Skipping Claude auth test: CLAUDE_CODE_OAUTH_TOKEN not found in tests/.env.secrets\n');
      process.exit(0);
    }

    // Create a codespace for testing
    console.log('Creating codespace...');
    const codespace = await createCodespace({
      repository: 'sudocode-ai/sudocode',
      machine: 'basicLinux32gb',
      idleTimeout: 30,
    });

    codespaceName = codespace.name;
    trackCodespace(codespaceName);
    console.log(`Codespace created: ${codespaceName}`);

    // Wait for codespace to be ready
    console.log('Waiting for codespace to be ready...');
    await waitForCodespaceReady(codespaceName);
    console.log('Codespace is ready');

    // Install Claude Code
    console.log('Installing Claude Code...');
    await installClaudeCode(codespaceName);
    console.log('Claude Code installed');
  }, 600000); // 10 minute timeout for creation + installation

  afterAll(async () => {
    await cleanupTrackedCodespaces();
  });

  //TODO: We should probably start the sudocode server and call its API to start an execution
  it('should validate Claude CLI works with CLAUDE_CODE_OAUTH_TOKEN', async () => {
    try {
      // First verify claude is installed
      console.log('Verifying Claude CLI installation...');
      const versionCheck = await execInCodespace(
        codespaceName,
        'claude --version',
        {
          timeout: 10000,
          streamOutput: false,
        }
      );
      console.log(`Claude version: ${versionCheck.trim()}`);

      // Test Claude integration with a simple command
      console.log('Testing Claude integration with OAuth token...');
      console.log('This may take up to 60 seconds for Claude to respond...');

      // Write token to file to avoid quoting issues, then use it
      await execInCodespace(
        codespaceName,
        `echo '${claudeAuthToken}' > /tmp/claude_token`,
        { timeout: 5000, streamOutput: false }
      );

      const result = await execInCodespace(
        codespaceName,
        'CLAUDE_CODE_OAUTH_TOKEN=$(cat /tmp/claude_token) claude -p hello && rm /tmp/claude_token',
        {
          timeout: 60000, // 60 seconds for Claude to respond
          streamOutput: true,
        }
      );

      // Verify the response contains "hello"
      console.log('Checking response for "hello"...');
      expect(result.toLowerCase()).toContain('hello');

      console.log('✓ Claude auth token integration validated successfully');
    } catch (error) {
      markTestFailed();
      console.error('Test failed with error:', error);
      throw error;
    }
  }, 180000); // 3 minute timeout for test

});
