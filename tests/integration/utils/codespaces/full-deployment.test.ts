/**
 * Integration test: Full Codespace Deployment
 * 
 * This is a comprehensive end-to-end test that validates the complete deployment
 * flow for a sudocode server in a GitHub Codespace. It tests all primitives in
 * sequence to ensure they work correctly together.
 * 
 * Test Flow:
 * 1. Create a real codespace in sudocode-ai/sudocode
 * 2. Wait for codespace to be ready
 * 3. Install Claude Code
 * 4. Install sudocode in dev mode (local build)
 * 5. Initialize sudocode project
 * 6. Start sudocode server
 * 7. Forward port and get public URL
 * 8. Start traffic monitor daemon
 * 9. Verify SSH keepalive commands are executing
 * 10. Clean up codespace (always runs, even on failure)
 * 
 * Expected Duration: ~10-15 minutes
 * 
 * Prerequisites:
 * - GitHub CLI installed and authenticated
 * - Access to sudocode-ai/sudocode repository
 * - Codespace creation permissions
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
  installClaudeCode,
  installSudocodeFromLocal,
  initializeSudocodeProject,
  startSudocodeServer,
  waitForPortListening,
  forwardPort,
  getCodespacePortUrl,
  startTrafficMonitor,
  type CodespaceInfo
} from '../../../../src/utils/codespaces/index.js';
import {
  verifyTestPrerequisites,
  trackCodespace,
  untrackCodespace,
  cleanupTrackedCodespaces
} from './helpers.js';

describe('Full Codespace Deployment (Integration)', () => {
  let codespaceName: string;
  const repository = 'sudocode-ai/sudocode';
  const port = 3000;
  const workspaceDir = '/workspaces/sudocode';
  
  // Verify prerequisites before running tests
  beforeAll(async () => {
    console.log('Verifying integration test prerequisites...');
    await verifyTestPrerequisites();
  }, 30000);
  
  // Create codespace before all tests
  beforeAll(async () => {
    console.log('========================================');
    console.log('Starting Full Deployment Integration Test');
    console.log('========================================');
    console.log('');
    console.log('Creating codespace for integration tests...');
    
    const codespace = await createCodespace({
      repository,
      machine: 'basicLinux32gb',
      retentionPeriod: 1 // Delete after 1 day
    });
    
    codespaceName = codespace.name;
    trackCodespace(codespaceName);
    console.log(`✓ Created codespace: ${codespaceName}`);
    console.log(`  Repository: ${repository}`);
    console.log(`  Machine: basicLinux32gb`);
    console.log('');
  }, 120000); // 2 minute timeout for codespace creation
  
  // Clean up codespace after all tests (runs even on failure)
  afterAll(async () => {
    console.log('');
    console.log('========================================');
    console.log('Cleaning up test resources...');
    console.log('========================================');
    await cleanupTrackedCodespaces();
    console.log('✓ Cleanup complete');
  }, 60000);
  
  it('should wait for codespace to be ready', async () => {
    console.log('Step 1: Waiting for codespace to be ready...');
    await waitForCodespaceReady(codespaceName, 30);
    console.log('✓ Codespace is ready');
    console.log('');
  }, 120000); // 2 minute timeout
  
  it('should install Claude Code', async () => {
    console.log('Step 2: Installing Claude Code...');
    await installClaudeCode(codespaceName, workspaceDir);
    
    // Verify installation
    console.log('Verifying Claude Code installation...');
    const result = await execInCodespace(
      codespaceName,
      'claude --version',
      { streamOutput: false }
    );
    
    expect(result).toContain('claude');
    console.log(`✓ Claude Code installed: ${result.trim()}`);
    console.log('');
  }, 300000); // 5 minute timeout
  
  it('should install sudocode from local repository (dev mode)', async () => {
    console.log('Step 3: Installing sudocode in dev mode...');
    console.log('This will: npm install, build, and link packages');
    
    await installSudocodeFromLocal(codespaceName, workspaceDir);
    
    // Verify CLI is available
    console.log('Verifying sudocode CLI installation...');
    const result = await execInCodespace(
      codespaceName,
      'sudocode --version',
      { streamOutput: false }
    );
    
    expect(result).toContain('sudocode');
    console.log(`✓ Sudocode CLI installed: ${result.trim()}`);
    
    // Verify it's linked from workspace (not npm)
    console.log('Verifying dev mode (linked from workspace)...');
    const whichResult = await execInCodespace(
      codespaceName,
      'which sudocode',
      { streamOutput: false }
    );
    
    expect(whichResult).toContain('workspaces');
    console.log(`✓ Dev mode confirmed: ${whichResult.trim()}`);
    console.log('');
  }, 600000); // 10 minute timeout for build
  
  it('should initialize sudocode project', async () => {
    console.log('Step 4: Initializing sudocode project...');
    await initializeSudocodeProject(codespaceName, workspaceDir);
    
    // Verify .sudocode directory exists
    console.log('Verifying .sudocode directory...');
    const result = await execInCodespace(
      codespaceName,
      `test -d ${workspaceDir}/.sudocode && echo "exists"`,
      { streamOutput: false }
    );
    
    expect(result.trim()).toBe('exists');
    console.log('✓ Sudocode project initialized');
    console.log('');
  }, 30000); // 30 second timeout
  
  it('should start sudocode server', async () => {
    console.log('Step 5: Starting sudocode server...');
    console.log(`Port: ${port}`);
    
    await startSudocodeServer(codespaceName, port, workspaceDir);
    
    // Wait for port to be listening
    console.log('Waiting for server to be ready...');
    await waitForPortListening(codespaceName, port, 30);
    
    console.log('✓ Server is running and accepting connections');
    
    // Verify log file exists
    console.log('Verifying log file...');
    const logExists = await execInCodespace(
      codespaceName,
      `test -f /tmp/sudocode-${port}.log && echo "exists"`,
      { streamOutput: false }
    );
    
    expect(logExists.trim()).toBe('exists');
    console.log(`✓ Log file created: /tmp/sudocode-${port}.log`);
    console.log('');
  }, 120000); // 2 minute timeout
  
  it('should forward port and get public URL', async () => {
    console.log('Step 6: Setting up port forwarding...');
    
    // Forward the port
    console.log(`Forwarding port ${port}...`);
    const localPort = await forwardPort(codespaceName, port);
    expect(localPort).toBeGreaterThanOrEqual(port);
    console.log(`✓ Port forwarded: ${port} -> localhost:${localPort}`);
    
    // Get public URL
    console.log('Getting public URL...');
    const url = await getCodespacePortUrl(codespaceName, port);
    expect(url).toContain('github.dev');
    console.log(`✓ Public URL: ${url}`);
    console.log('');
  }, 60000); // 1 minute timeout
  
  it('should start traffic monitor daemon', async () => {
    console.log('Step 7: Starting traffic monitor daemon...');
    
    await startTrafficMonitor({
      codespaceName,
      serverPort: port,
      serverLogPath: `/tmp/sudocode-${port}.log`,
      keepAliveHours: 1, // Short duration for testing
      sshIntervalMinutes: 0.5 // Frequent SSH keepalive (30 seconds) for testing
    });
    
    console.log('✓ Traffic monitor daemon started');
    
    // Wait a bit for daemon to initialize
    console.log('Waiting for daemon to initialize...');
    await new Promise(resolve => setTimeout(resolve, 3000));
    
    // Verify PID file exists
    console.log('Verifying daemon process...');
    const pidExists = await execInCodespace(
      codespaceName,
      `test -f /tmp/sudocode-monitor-${port}.pid && echo "exists"`,
      { streamOutput: false }
    );
    
    expect(pidExists.trim()).toBe('exists');
    console.log('✓ Daemon PID file exists');
    console.log('');
  }, 30000); // 30 second timeout
  
  it('should verify SSH keepalive commands are executing', async () => {
    console.log('Step 8: Verifying SSH keepalive mechanism...');
    
    // Wait for at least one SSH command to be executed (up to 45 seconds)
    console.log('Waiting for SSH keepalive commands to execute (up to 45 seconds)...');
    let sshFound = false;
    const maxWait = 45000; // 45 seconds
    const checkInterval = 5000; // 5 seconds
    const startTime = Date.now();
    
    while (Date.now() - startTime < maxWait) {
      const daemonLog = await execInCodespace(
        codespaceName,
        `cat /tmp/sudocode-monitor-${port}-daemon.log 2>/dev/null || echo ""`,
        { streamOutput: false }
      );
      
      if (daemonLog.includes('SSH keepalive executed successfully')) {
        sshFound = true;
        break;
      }
      
      await new Promise(resolve => setTimeout(resolve, checkInterval));
    }
    
    expect(sshFound).toBe(true);
    console.log('✓ SSH keepalive commands are executing');
    
    // Show sample from daemon log
    const daemonLogSample = await execInCodespace(
      codespaceName,
      `grep "SSH keepalive executed successfully" /tmp/sudocode-monitor-${port}-daemon.log | head -1`,
      { streamOutput: false }
    );
    console.log(`  Sample log entry: ${daemonLogSample.trim()}`);
    console.log('');
  }, 60000); // 60 second timeout (to allow for SSH interval)
  
  it('should verify daemon is still running', async () => {
    console.log('Step 9: Final verification of daemon status...');
    
    // Check if daemon process is still alive
    const pidFile = `/tmp/sudocode-monitor-${port}.pid`;
    const isRunning = await execInCodespace(
      codespaceName,
      `[ -f ${pidFile} ] && ps -p $(cat ${pidFile}) > /dev/null && echo "running" || echo "stopped"`,
      { streamOutput: false }
    );
    
    expect(isRunning.trim()).toBe('running');
    console.log('✓ Traffic monitor daemon is still running');
    
    // Show daemon log tail (last 5 lines)
    console.log('Daemon log (last 5 lines):');
    try {
      const daemonLog = await execInCodespace(
        codespaceName,
        `tail -5 /tmp/sudocode-monitor-${port}-daemon.log 2>/dev/null || echo "(no log output)"`,
        { streamOutput: false }
      );
      console.log(daemonLog.trim());
    } catch {
      console.log('(no log output)');
    }
    
    console.log('');
    console.log('========================================');
    console.log('Full Deployment Test Complete!');
    console.log('========================================');
    console.log('All components verified:');
    console.log('✓ Codespace created and ready');
    console.log('✓ Claude Code installed');
    console.log('✓ Sudocode installed in dev mode');
    console.log('✓ Project initialized');
    console.log('✓ Server running on port', port);
    console.log('✓ Port forwarded with public URL');
    console.log('✓ Traffic monitor daemon active');
    console.log('✓ SSH keepalive commands executing');
    console.log('');
  }, 30000); // 30 second timeout
});
