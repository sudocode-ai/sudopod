/**
 * Integration test: Dev Mode Installation
 * 
 * This test validates the complete dev mode workflow where sudocode is installed
 * from a local repository build rather than from npm. It verifies that:
 * - The repository can be built successfully
 * - Packages can be linked globally
 * - CLI commands are available and linked (not from npm)
 * - Server packages are accessible
 * - Project initialization works with local build
 * 
 * Test Strategy:
 * - Uses sudocode-ai/sudocode repository
 * - Creates real GitHub Codespace
 * - Installs from local repo using npm install, build, link
 * - Verifies all components are properly linked
 * - Cleans up codespace after test
 * 
 * IMPORTANT: These tests require external resources and should NOT run by default.
 * Set the environment variable RUN_INTEGRATION_TESTS=1 to enable these tests.
 * 
 * Example: RUN_INTEGRATION_TESTS=1 npm run test:integration
 */

import { describe, it, beforeAll, afterAll, expect } from 'vitest';

// Skip integration tests unless explicitly enabled
if (!process.env.RUN_INTEGRATION_TESTS) {
  console.log('\n⚠️  Skipping integration tests: RUN_INTEGRATION_TESTS not set');
  console.log('   To run integration tests: RUN_INTEGRATION_TESTS=1 npm run test:integration\n');
  process.exit(0);
}
import {
  createCodespace,
  deleteCodespace,
  waitForCodespaceReady,
  execInCodespace,
  installSudocodeFromLocal,
  initializeSudocodeProject,
  type CodespaceInfo
} from '../../../../src/utils/codespaces/index.js';
import {
  verifyTestPrerequisites,
  trackCodespace,
  untrackCodespace,
  cleanupTrackedCodespaces,
  generateTestCodespaceName
} from './helpers.js';

describe('Dev Mode Installation (Integration)', () => {
  let codespaceName: string;
  const repository = 'sudocode-ai/sudocode';
  const workspaceDir = '/workspaces/sudocode';
  
  // Verify prerequisites before running tests
  beforeAll(async () => {
    console.log('Verifying integration test prerequisites...');
    await verifyTestPrerequisites();
  }, 30000);
  
  // Create codespace before all tests
  beforeAll(async () => {
    console.log('Creating codespace for dev mode installation test...');
    
    const codespace = await createCodespace({
      repository,
      machine: 'basicLinux32gb',
      retentionPeriod: 1 // Delete after 1 day
    });
    
    codespaceName = codespace.name;
    trackCodespace(codespaceName);
    console.log(`Created codespace: ${codespaceName}`);
    
    // Wait for codespace to be ready
    console.log('Waiting for codespace to be ready...');
    await waitForCodespaceReady(codespaceName, 30);
    console.log('Codespace is ready');
  }, 120000); // 2 minute timeout for codespace creation
  
  // Clean up codespace after all tests
  afterAll(async () => {
    await cleanupTrackedCodespaces();
  }, 60000);
  
  it('should build and link sudocode from local repository', async () => {
    console.log('Installing sudocode from local repository...');
    await installSudocodeFromLocal(codespaceName, workspaceDir);
    
    console.log('Verifying CLI is available globally...');
    const cliVersion = await execInCodespace(
      codespaceName,
      'sudocode --version',
      { streamOutput: false }
    );
    expect(cliVersion).toContain('sudocode');
    console.log(`✓ CLI version: ${cliVersion.trim()}`);
    
    console.log('Verifying CLI is linked (not from npm)...');
    const whichCli = await execInCodespace(
      codespaceName,
      'which sudocode',
      { streamOutput: false }
    );
    expect(whichCli).toContain('workspaces');
    console.log(`✓ CLI path: ${whichCli.trim()}`);
    
    console.log('Verifying server package is available...');
    const serverCheck = await execInCodespace(
      codespaceName,
      'npm list -g @sudocode-ai/local-server',
      { streamOutput: false }
    );
    expect(serverCheck).toContain('@sudocode-ai/local-server');
    console.log('✓ Server package is available globally');
  }, 600000); // 10 minute timeout for build and link
  
  it('should initialize project with local sudocode', async () => {
    console.log('Initializing sudocode project...');
    await initializeSudocodeProject(codespaceName, workspaceDir);
    
    console.log('Verifying .sudocode directory exists...');
    const dirExists = await execInCodespace(
      codespaceName,
      `test -d ${workspaceDir}/.sudocode && echo "exists"`,
      { streamOutput: false }
    );
    expect(dirExists.trim()).toBe('exists');
    console.log('✓ .sudocode directory exists');
    
    console.log('Verifying .sudocode directory structure...');
    const structure = await execInCodespace(
      codespaceName,
      `ls -la ${workspaceDir}/.sudocode`,
      { streamOutput: false }
    );
    
    // Verify expected files/directories
    expect(structure).toContain('config');
    console.log(`✓ Directory structure validated:\n${structure}`);
  }, 60000); // 1 minute timeout
  
  it('should successfully clean up codespace', async () => {
    console.log(`Deleting codespace: ${codespaceName}`);
    await deleteCodespace(codespaceName);
    untrackCodespace(codespaceName);
    console.log('✓ Codespace deleted successfully');
  }, 30000);
});
