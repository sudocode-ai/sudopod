/**
 * Integration test: Traffic Monitor Keepalive Behavior
 * 
 * This test validates that the traffic monitoring daemon correctly manages
 * SSH keepalive commands based on server activity and keepalive timeouts.
 * 
 * Test Scenarios:
 * 1. SSH commands execute while server is active
 * 2. SSH commands stop after keepalive expires
 * 3. SSH commands resume if activity restarts after expiry
 * 4. Codespace stays alive with SSH keepalive (no server)
 * 5. Codespace dies after keepalive stops (no server)
 * 
 * The tests use shorter timeouts than production to ensure reasonable test
 * runtime while still validating the core behavior.
 * 
 * Expected Duration: ~10-20 minutes
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
  waitForCodespaceReady,
  execInCodespace,
  installSudocodeFromLocal,
  initializeSudocodeProject,
  startSudocodeServer,
  waitForPortListening,
  startTrafficMonitor,
  isTrafficMonitorRunning,
  getCodespaceInfo,
  checkPortListening,
  type CodespaceInfo
} from '../../../../src/utils/codespaces/index.js';
import {
  verifyTestPrerequisites,
  trackCodespace,
  cleanupTrackedCodespaces,
  waitForCondition,
  markTestFailed
} from './helpers.js';

describe('Traffic Monitor Keepalive Behavior (Integration)', () => {
  let codespaceName: string;
  const repository = 'sudocode-ai/sudocode';
  
  // Dynamic port allocation starting from 4000 to avoid conflicts with sudocode (port 3000)
  let port1: number;
  let port2: number;
  
  /**
   * Find an available port starting from a given port number
   * Uses nc -z which returns exit code 0 if port is in use, non-zero if available
   */
  async function findAvailablePort(startPort: number, codespaceName: string): Promise<number> {
    for (let port = startPort; port < startPort + 100; port++) {
      try {
        // nc -z returns 0 (success) if port is IN USE, non-zero if available
        // We want to find a port where nc fails (returns non-zero)
        const result = await execInCodespace(
          codespaceName,
          `nc -z localhost ${port} 2>&1`,
          { streamOutput: false }
        );
        // If we get here, nc succeeded (exit 0), meaning port is IN USE
        // Continue to next port
      } catch {
        // nc failed (non-zero exit), meaning port is AVAILABLE
        return port;
      }
    }
    throw new Error(`Could not find available port in range ${startPort}-${startPort + 100}`);
  }
  
  // Verify prerequisites before running tests
  beforeAll(async () => {
    console.log('Verifying integration test prerequisites...');
    await verifyTestPrerequisites();
  }, 30000);
  
  // Track test failures to preserve codespaces for debugging
  afterEach((context) => {
    if (context.task.result?.state === 'fail') {
      markTestFailed();
    }
  });
  
  // Create and set up codespace before all tests
  beforeAll(async () => {
    console.log('========================================');
    console.log('Starting Keepalive Behavior Integration Test');
    console.log('========================================');
    console.log('');
    console.log('Creating codespace...');
    
    const codespace = await createCodespace({
      repository,
      machine: 'basicLinux32gb',
      retentionPeriod: 1
    });
    
    codespaceName = codespace.name;
    trackCodespace(codespaceName);
    console.log(`✓ Created codespace: ${codespaceName}`);
    console.log('');
    
    // Wait for ready
    console.log('Waiting for codespace to be ready...');
    await waitForCodespaceReady(codespaceName, 30);
    console.log('✓ Codespace is ready');
    console.log('');
    
    // Install sudocode in dev mode
    console.log('Installing sudocode in dev mode...');
    console.log('(This will take several minutes)');
    await installSudocodeFromLocal(codespaceName);
    console.log('✓ Sudocode installed');
    console.log('');
    
    // Initialize project
    console.log('Initializing sudocode project...');
    await initializeSudocodeProject(codespaceName);
    console.log('✓ Project initialized');
    console.log('');
    
    // Find available ports for tests
    console.log('Finding available ports...');
    port1 = await findAvailablePort(4000, codespaceName);
    port2 = await findAvailablePort(port1 + 1, codespaceName);
    console.log(`✓ Allocated ports: ${port1}, ${port2}`);
    console.log('');
  }, 900000); // 15 minute timeout for full setup
  
  // Clean up codespace after all tests (runs even on failure)
  afterAll(async () => {
    console.log('');
    console.log('========================================');
    console.log('Cleaning up test resources...');
    console.log('========================================');
    await cleanupTrackedCodespaces();
    console.log('✓ Cleanup complete');
  }, 60000);
  
  describe('Test 1: SSH commands execute while server active', () => {
    it('should start server and monitor', async () => {
      console.log('Test 1: Verifying SSH commands execute while server active');
      console.log('------------------------------------------------------------');
      console.log('');
      
      // Start server on port1
      console.log(`Starting server on port ${port1}...`);
      await startSudocodeServer(codespaceName, port1);
      await waitForPortListening(codespaceName, port1, 30);
      console.log('✓ Server is running');
      console.log('');
      
      // Start monitor with short intervals (30 seconds)
      console.log('Starting traffic monitor...');
      console.log('- Keepalive: 5 minutes');
      console.log('- SSH interval: 30 seconds');
      await startTrafficMonitor({
        codespaceName,
        serverPort: port1,
        serverLogPath: `/tmp/sudocode-${port1}.log`,
        keepAliveHours: 5 / 60, // 5 minutes
        sshIntervalMinutes: 0.5 // 30 seconds
      });
      console.log('✓ Traffic monitor started');
      console.log('');
    }, 180000); // 3 minute timeout
    
    it('should verify SSH commands are executing successfully', async () => {
      console.log('Waiting for SSH commands to execute (up to 40 seconds)...');
      
      // Wait for daemon log to show SSH keepalive commands
      await waitForCondition(
        async () => {
          try {
            const daemonLog = await execInCodespace(
              codespaceName,
              `cat /tmp/sudocode-monitor-${port1}-daemon.log 2>/dev/null || echo ""`,
              { streamOutput: false }
            );
            // Look for successful SSH keepalive execution
            return daemonLog.includes('SSH keepalive executed successfully');
          } catch {
            return false;
          }
        },
        45000, // 45 second timeout
        5000,  // Check every 5 seconds
        'SSH keepalive commands not found in daemon log'
      );
      
      console.log('✓ SSH keepalive commands are executing');
      console.log('');
    }, 60000); // 1 minute timeout
    
    it('should continue SSH commands after generating server activity', async () => {
      console.log('Generating server activity...');
      
      // Make a request to generate activity
      await execInCodespace(
        codespaceName,
        `curl -s http://localhost:${port1}/health || curl -s http://localhost:${port1}/ || true`,
        { streamOutput: false }
      );
      console.log('✓ Generated HTTP request');
      console.log('');
      
      // Get current daemon log
      const daemonLog1 = await execInCodespace(
        codespaceName,
        `grep -c "SSH keepalive executed successfully" /tmp/sudocode-monitor-${port1}-daemon.log || echo "0"`,
        { streamOutput: false }
      );
      const sshCount1 = parseInt(daemonLog1.trim());
      console.log(`Current SSH command count: ${sshCount1}`);
      console.log('');
      
      // Wait for next SSH interval (35 seconds to be safe)
      console.log('Waiting for next SSH command (35 seconds)...');
      await new Promise(resolve => setTimeout(resolve, 35000));
      
      // Verify SSH command count increased
      const daemonLog2 = await execInCodespace(
        codespaceName,
        `grep -c "SSH keepalive executed successfully" /tmp/sudocode-monitor-${port1}-daemon.log || echo "0"`,
        { streamOutput: false }
      );
      const sshCount2 = parseInt(daemonLog2.trim());
      
      expect(sshCount2).toBeGreaterThan(sshCount1);
      console.log(`✓ SSH commands continued (now ${sshCount2} commands, increased by ${sshCount2 - sshCount1})`);
      console.log('');
      console.log('Test 1 Complete: SSH commands verified while server active');
      console.log('');
    }, 60000); // 1 minute timeout
  });
  
  describe('Test 2: SSH commands stop after keepalive expires', () => {
    it('should start server with very short keepalive', async () => {
      console.log('Test 2: Verifying SSH commands stop after keepalive expires');
      console.log('--------------------------------------------------------------');
      console.log('');
      
      // Start server on port2
      console.log(`Starting server on port ${port2}...`);
      await startSudocodeServer(codespaceName, port2);
      await waitForPortListening(codespaceName, port2, 30);
      console.log('✓ Server is running');
      console.log('');
      
      // Start monitor with very short keepalive (2 minutes)
      console.log('Starting traffic monitor...');
      console.log('- Keepalive: 2 minutes');
      console.log('- SSH interval: 30 seconds');
      await startTrafficMonitor({
        codespaceName,
        serverPort: port2,
        serverLogPath: `/tmp/sudocode-${port2}.log`,
        keepAliveHours: 2 / 60, // 2 minutes
        sshIntervalMinutes: 0.5 // 30 seconds
      });
      console.log('✓ Traffic monitor started');
      console.log('');
    }, 180000); // 3 minute timeout
    
    it('should verify initial SSH commands are executing', async () => {
      console.log('Waiting for initial SSH commands...');
      
      // Wait for at least one SSH command
      await waitForCondition(
        async () => {
          try {
            const daemonLog = await execInCodespace(
              codespaceName,
              `cat /tmp/sudocode-monitor-${port2}-daemon.log 2>/dev/null || echo ""`,
              { streamOutput: false }
            );
            return daemonLog.includes('SSH keepalive executed successfully');
          } catch {
            return false;
          }
        },
        45000,
        5000,
        'Initial SSH commands not found in daemon log'
      );
      
      console.log('✓ Initial SSH commands executing');
      console.log('');
    }, 60000); // 1 minute timeout
    
    it('should verify SSH commands stop after keepalive expires', async () => {
      console.log('Waiting for keepalive to expire (2 minutes + buffer = 2.5 minutes)...');
      console.log('(No server activity will be generated during this time)');
      console.log('');
      
      // Wait for keepalive to expire (2 minutes + 30 second buffer)
      await new Promise(resolve => setTimeout(resolve, 150000)); // 2.5 minutes
      
      console.log('Keepalive should have expired. Checking SSH commands stopped...');
      
      // Get daemon log to see latest message
      const daemonLog = await execInCodespace(
        codespaceName,
        `tail -20 /tmp/sudocode-monitor-${port2}-daemon.log`,
        { streamOutput: false }
      );
      
      console.log('Recent daemon log entries:');
      console.log(daemonLog);
      console.log('');
      
      // Verify log shows "skipping SSH" message (keepalive expired)
      expect(daemonLog).toContain('skipping SSH');
      console.log('✓ Daemon log shows "skipping SSH" (keepalive expired)');
      console.log('');
      
      // Verify daemon is still running (just not SSH'ing)
      console.log('Checking if daemon is still running...');
      const isRunning = await isTrafficMonitorRunning(codespaceName, port2);
      
      if (!isRunning) {
        console.error('ERROR: Daemon is not running! Getting full daemon log...');
        try {
          const fullDaemonLog = await execInCodespace(
            codespaceName,
            `cat /tmp/sudocode-monitor-${port2}-daemon.log 2>&1 || echo "No daemon log found"`,
            { streamOutput: false }
          );
          console.error('Full daemon log:');
          console.error(fullDaemonLog);
        } catch (e) {
          console.error('Could not read daemon log:', e);
        }
      }
      
      expect(isRunning).toBe(true);
      console.log('✓ Daemon is still running (counter expired, waiting for activity)');
      console.log('');
      console.log('Test 2 Complete: SSH commands stopped after keepalive expired');
      console.log('');
    }, 240000); // 4 minute timeout
  });
  
  describe('Test 3: SSH commands resume after activity restarts', () => {
    it('should resume SSH commands after generating new activity', async () => {
      console.log('Test 3: Verifying SSH commands resume after activity restarts');
      console.log('----------------------------------------------------------------');
      console.log('');
      
      // From Test 2, daemon has stopped SSH commands
      // Get current SSH command count
      const sshCountBefore = await execInCodespace(
        codespaceName,
        `grep -c "SSH keepalive executed successfully" /tmp/sudocode-monitor-${port2}-daemon.log || echo "0"`,
        { streamOutput: false }
      );
      const countBefore = parseInt(sshCountBefore.trim());
      console.log(`Current SSH command count: ${countBefore}`);
      console.log('');
      
      // Generate new server activity
      console.log('Generating new server activity...');
      await execInCodespace(
        codespaceName,
        `echo "new activity at $(date)" >> /tmp/sudocode-${port2}.log`,
        { streamOutput: false }
      );
      console.log('✓ Activity generated (log file modified)');
      console.log('');
      
      // Wait for next SSH interval (35 seconds)
      console.log('Waiting for daemon to detect activity and execute SSH command (35 seconds)...');
      await new Promise(resolve => setTimeout(resolve, 35000));
      
      // Verify SSH command count increased (SSH commands resumed)
      const sshCountAfter1 = await execInCodespace(
        codespaceName,
        `grep -c "SSH keepalive executed successfully" /tmp/sudocode-monitor-${port2}-daemon.log || echo "0"`,
        { streamOutput: false }
      );
      const countAfter1 = parseInt(sshCountAfter1.trim());
      
      expect(countAfter1).toBeGreaterThan(countBefore);
      console.log(`✓ SSH commands resumed (${countBefore} -> ${countAfter1})`);
      console.log('');
      
      // Wait another interval to verify SSH commands continue
      console.log('Waiting another interval (35 seconds) to confirm continued SSH commands...');
      await new Promise(resolve => setTimeout(resolve, 35000));
      
      const sshCountAfter2 = await execInCodespace(
        codespaceName,
        `grep -c "SSH keepalive executed successfully" /tmp/sudocode-monitor-${port2}-daemon.log || echo "0"`,
        { streamOutput: false }
      );
      const countAfter2 = parseInt(sshCountAfter2.trim());
      
      expect(countAfter2).toBeGreaterThan(countAfter1);
      console.log(`✓ SSH commands continued (${countAfter1} -> ${countAfter2})`);
      console.log('');
      console.log('Test 3 Complete: SSH commands resumed after activity restart');
      console.log('');
    }, 120000); // 2 minute timeout
  });
  
  // Summary test that runs after all others
  it('should verify all daemons are still running', async () => {
    console.log('========================================');
    console.log('Final Verification: Daemon Status');
    console.log('========================================');
    console.log('');
    
    // Check daemon for port1 (from Test 1)
    console.log(`Checking daemon for port ${port1}...`);
    const isRunning1 = await isTrafficMonitorRunning(codespaceName, port1);
    expect(isRunning1).toBe(true);
    console.log(`✓ Daemon for port ${port1} is running`);
    console.log('');
    
    // Check daemon for port2 (from Tests 2 & 3)
    console.log(`Checking daemon for port ${port2}...`);
    const isRunning2 = await isTrafficMonitorRunning(codespaceName, port2);
    expect(isRunning2).toBe(true);
    console.log(`✓ Daemon for port ${port2} is running`);
    console.log('');
    
    console.log('========================================');
    console.log('Keepalive Behavior Tests Complete!');
    console.log('========================================');
    console.log('All behaviors verified:');
    console.log('✓ Test 1: SSH commands execute while server active');
    console.log('✓ Test 2: SSH commands stop after keepalive expires');
    console.log('✓ Test 3: SSH commands resume after activity restarts');
    console.log('✓ Both daemons still running');
    console.log('');
  }, 30000); // 30 second timeout
});
