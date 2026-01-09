/**
 * Integration test: Traffic Monitor Keepalive Behavior
 * 
 * This test validates that the traffic monitoring daemon correctly manages
 * heartbeat files based on server activity and keepalive timeouts.
 * 
 * Test Scenarios:
 * 1. Heartbeats write while server is active
 * 2. Heartbeats stop after keepalive expires
 * 3. Heartbeats resume if activity restarts after expiry
 * 4. Filesystem activity keeps codespace alive (long-running validation)
 * 
 * The tests use shorter timeouts than production to ensure reasonable test
 * runtime while still validating the core behavior.
 * 
 * Expected Duration: ~5-10 minutes (excluding Test 4)
 * 
 * Prerequisites:
 * - GitHub CLI installed and authenticated
 * - Access to sudocode-ai/sudocode repository
 * - Codespace creation permissions
 */

import { describe, it, beforeAll, afterAll, expect } from 'vitest';
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
  waitForCondition
} from './helpers.js';

describe('Traffic Monitor Keepalive Behavior (Integration)', () => {
  let codespaceName: string;
  const repository = 'sudocode-ai/sudocode';
  const workspaceDir = '/workspaces/sudocode';
  
  // Different ports for different tests to avoid conflicts
  const port1 = 3001; // Test 1
  const port2 = 3002; // Test 2 & 3
  
  // Verify prerequisites before running tests
  beforeAll(async () => {
    console.log('Verifying integration test prerequisites...');
    await verifyTestPrerequisites();
  }, 30000);
  
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
    await installSudocodeFromLocal(codespaceName, workspaceDir);
    console.log('✓ Sudocode installed');
    console.log('');
    
    // Initialize project
    console.log('Initializing sudocode project...');
    await initializeSudocodeProject(codespaceName, workspaceDir);
    console.log('✓ Project initialized');
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
  
  describe('Test 1: Heartbeats write while server active', () => {
    it('should start server and monitor', async () => {
      console.log('Test 1: Verifying heartbeats write while server active');
      console.log('--------------------------------------------------------');
      console.log('');
      
      // Start server on port1
      console.log(`Starting server on port ${port1}...`);
      await startSudocodeServer(codespaceName, port1, workspaceDir);
      await waitForPortListening(codespaceName, port1, 30);
      console.log('✓ Server is running');
      console.log('');
      
      // Start monitor with short intervals (30 seconds)
      console.log('Starting traffic monitor...');
      console.log('- Keepalive: 5 minutes');
      console.log('- Heartbeat interval: 30 seconds');
      await startTrafficMonitor({
        codespaceName,
        serverPort: port1,
        serverLogPath: `/tmp/sudocode-${port1}.log`,
        keepAliveHours: 5 / 60, // 5 minutes
        heartbeatIntervalMinutes: 0.5 // 30 seconds
      });
      console.log('✓ Traffic monitor started');
      console.log('');
    }, 180000); // 3 minute timeout
    
    it('should verify heartbeat file gets written', async () => {
      console.log('Waiting for first heartbeat (up to 40 seconds)...');
      
      // Wait for heartbeat file to be created and have content
      await waitForCondition(
        async () => {
          try {
            const countResult = await execInCodespace(
              codespaceName,
              `wc -l < /tmp/keepalive-heartbeat-${port1}.txt 2>/dev/null || echo "0"`,
              { streamOutput: false }
            );
            const count = parseInt(countResult.trim());
            return count > 0;
          } catch {
            return false;
          }
        },
        45000, // 45 second timeout
        5000,  // Check every 5 seconds
        'First heartbeat not written within timeout'
      );
      
      const heartbeatCount1 = await execInCodespace(
        codespaceName,
        `wc -l < /tmp/keepalive-heartbeat-${port1}.txt`,
        { streamOutput: false }
      );
      
      const count1 = parseInt(heartbeatCount1.trim());
      expect(count1).toBeGreaterThan(0);
      console.log(`✓ First heartbeat written (${count1} entries)`);
      console.log('');
    }, 60000); // 1 minute timeout
    
    it('should continue heartbeats after generating server activity', async () => {
      console.log('Generating server activity...');
      
      // Make a request to generate activity
      await execInCodespace(
        codespaceName,
        `curl -s http://localhost:${port1}/health || curl -s http://localhost:${port1}/ || true`,
        { streamOutput: false }
      );
      console.log('✓ Generated HTTP request');
      console.log('');
      
      // Get current heartbeat count
      const heartbeatCount1 = await execInCodespace(
        codespaceName,
        `wc -l < /tmp/keepalive-heartbeat-${port1}.txt`,
        { streamOutput: false }
      );
      const count1 = parseInt(heartbeatCount1.trim());
      console.log(`Current heartbeat count: ${count1}`);
      console.log('');
      
      // Wait for next heartbeat interval (35 seconds to be safe)
      console.log('Waiting for next heartbeat (35 seconds)...');
      await new Promise(resolve => setTimeout(resolve, 35000));
      
      // Verify heartbeat count increased
      const heartbeatCount2 = await execInCodespace(
        codespaceName,
        `wc -l < /tmp/keepalive-heartbeat-${port1}.txt`,
        { streamOutput: false }
      );
      const count2 = parseInt(heartbeatCount2.trim());
      
      expect(count2).toBeGreaterThan(count1);
      console.log(`✓ Heartbeats continued (now ${count2} entries, increased by ${count2 - count1})`);
      console.log('');
      console.log('Test 1 Complete: Heartbeats verified while server active');
      console.log('');
    }, 60000); // 1 minute timeout
  });
  
  describe('Test 2: Heartbeats stop after keepalive expires', () => {
    it('should start server with very short keepalive', async () => {
      console.log('Test 2: Verifying heartbeats stop after keepalive expires');
      console.log('----------------------------------------------------------');
      console.log('');
      
      // Start server on port2
      console.log(`Starting server on port ${port2}...`);
      await startSudocodeServer(codespaceName, port2, workspaceDir);
      await waitForPortListening(codespaceName, port2, 30);
      console.log('✓ Server is running');
      console.log('');
      
      // Start monitor with very short keepalive (2 minutes)
      console.log('Starting traffic monitor...');
      console.log('- Keepalive: 2 minutes');
      console.log('- Heartbeat interval: 30 seconds');
      await startTrafficMonitor({
        codespaceName,
        serverPort: port2,
        serverLogPath: `/tmp/sudocode-${port2}.log`,
        keepAliveHours: 2 / 60, // 2 minutes
        heartbeatIntervalMinutes: 0.5 // 30 seconds
      });
      console.log('✓ Traffic monitor started');
      console.log('');
    }, 180000); // 3 minute timeout
    
    it('should verify initial heartbeats are written', async () => {
      console.log('Waiting for initial heartbeat...');
      
      // Wait for at least one heartbeat
      await waitForCondition(
        async () => {
          try {
            const countResult = await execInCodespace(
              codespaceName,
              `wc -l < /tmp/keepalive-heartbeat-${port2}.txt 2>/dev/null || echo "0"`,
              { streamOutput: false }
            );
            const count = parseInt(countResult.trim());
            return count > 0;
          } catch {
            return false;
          }
        },
        45000,
        5000,
        'Initial heartbeat not written within timeout'
      );
      
      const heartbeatCount1 = await execInCodespace(
        codespaceName,
        `wc -l < /tmp/keepalive-heartbeat-${port2}.txt`,
        { streamOutput: false }
      );
      
      const count1 = parseInt(heartbeatCount1.trim());
      expect(count1).toBeGreaterThan(0);
      console.log(`✓ Initial heartbeat written (${count1} entries)`);
      console.log('');
    }, 60000); // 1 minute timeout
    
    it('should verify heartbeats stop after keepalive expires', async () => {
      console.log('Waiting for keepalive to expire (2 minutes + buffer = 2.5 minutes)...');
      console.log('(No server activity will be generated during this time)');
      console.log('');
      
      // Wait for keepalive to expire (2 minutes + 30 second buffer)
      await new Promise(resolve => setTimeout(resolve, 150000)); // 2.5 minutes
      
      console.log('Keepalive should have expired. Checking heartbeats stopped...');
      
      // Get heartbeat count after expiry
      const heartbeatCount2 = await execInCodespace(
        codespaceName,
        `wc -l < /tmp/keepalive-heartbeat-${port2}.txt`,
        { streamOutput: false }
      );
      const count2 = parseInt(heartbeatCount2.trim());
      console.log(`Heartbeat count after expiry: ${count2}`);
      console.log('');
      
      // Wait another heartbeat interval (35 seconds)
      console.log('Waiting one more interval (35 seconds) to confirm no new heartbeats...');
      await new Promise(resolve => setTimeout(resolve, 35000));
      
      // Verify heartbeat count did NOT increase (daemon stopped writing)
      const heartbeatCount3 = await execInCodespace(
        codespaceName,
        `wc -l < /tmp/keepalive-heartbeat-${port2}.txt`,
        { streamOutput: false }
      );
      const count3 = parseInt(heartbeatCount3.trim());
      
      expect(count3).toBe(count2);
      console.log(`✓ Heartbeats stopped (count remained at ${count3})`);
      console.log('');
      
      // Verify daemon is still running (just not writing heartbeats)
      const isRunning = await isTrafficMonitorRunning(codespaceName, port2);
      expect(isRunning).toBe(true);
      console.log('✓ Daemon is still running (counter expired, waiting for activity)');
      console.log('');
      console.log('Test 2 Complete: Heartbeats stopped after keepalive expired');
      console.log('');
    }, 240000); // 4 minute timeout
  });
  
  describe('Test 3: Heartbeats resume if activity restarts', () => {
    it('should resume heartbeats after generating new activity', async () => {
      console.log('Test 3: Verifying heartbeats resume after activity restarts');
      console.log('-------------------------------------------------------------');
      console.log('');
      
      // From Test 2, daemon has stopped writing heartbeats
      // Get current count (should be unchanged from end of Test 2)
      const heartbeatCountBefore = await execInCodespace(
        codespaceName,
        `wc -l < /tmp/keepalive-heartbeat-${port2}.txt`,
        { streamOutput: false }
      );
      const countBefore = parseInt(heartbeatCountBefore.trim());
      console.log(`Current heartbeat count: ${countBefore}`);
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
      
      // Wait for next heartbeat interval (35 seconds)
      console.log('Waiting for daemon to detect activity and write heartbeat (35 seconds)...');
      await new Promise(resolve => setTimeout(resolve, 35000));
      
      // Verify heartbeat count increased (heartbeats resumed)
      const heartbeatCountAfter1 = await execInCodespace(
        codespaceName,
        `wc -l < /tmp/keepalive-heartbeat-${port2}.txt`,
        { streamOutput: false }
      );
      const countAfter1 = parseInt(heartbeatCountAfter1.trim());
      
      expect(countAfter1).toBeGreaterThan(countBefore);
      console.log(`✓ Heartbeats resumed (${countBefore} -> ${countAfter1})`);
      console.log('');
      
      // Wait another interval to verify heartbeats continue
      console.log('Waiting another interval (35 seconds) to confirm continued heartbeats...');
      await new Promise(resolve => setTimeout(resolve, 35000));
      
      const heartbeatCountAfter2 = await execInCodespace(
        codespaceName,
        `wc -l < /tmp/keepalive-heartbeat-${port2}.txt`,
        { streamOutput: false }
      );
      const countAfter2 = parseInt(heartbeatCountAfter2.trim());
      
      expect(countAfter2).toBeGreaterThan(countAfter1);
      console.log(`✓ Heartbeats continued (${countAfter1} -> ${countAfter2})`);
      console.log('');
      console.log('Test 3 Complete: Heartbeats resumed after activity restart');
      console.log('');
    }, 120000); // 2 minute timeout
  });
  
  describe('Test 4: Filesystem activity keeps codespace alive (MANUAL)', () => {
    it('should verify filesystem activity prevents codespace timeout', async () => {
      // This test validates that regular filesystem writes (heartbeat file)
      // keep the codespace from being paused by GitHub's idle timeout.
      //
      // Test strategy:
      // 1. Create codespace with 2-minute idle timeout
      // 2. Start daemon with 5-minute keepalive
      // 3. Wait 3+ minutes without any SSH/network activity
      // 4. Verify codespace is still Available (not paused/stopped)
      // 5. Verify server still responds
      //
      // Success criteria: If codespace is still alive after 3 minutes,
      // then file writes are keeping it alive (since idle timeout is 2 minutes)
      //
      // Expected test duration: ~7-8 minutes
      
      console.log('Test 4: Verifying filesystem activity prevents codespace timeout');
      console.log('-----------------------------------------------------------------');
      console.log('');
      console.log('Creating a NEW codespace with 2-minute idle timeout...');
      
      // Create a fresh codespace with 2-minute idle timeout
      const testCodespace = await createCodespace({
        repository,
        machine: 'basicLinux32gb',
        idleTimeout: 2, // 2 minutes
        retentionPeriod: 1
      });
      
      const testCodespaceName = testCodespace.name;
      trackCodespace(testCodespaceName);
      console.log(`✓ Created codespace: ${testCodespaceName}`);
      console.log('  - Idle timeout: 2 minutes');
      console.log('');
      
      try {
        // Wait for ready
        console.log('Waiting for codespace to be ready...');
        await waitForCodespaceReady(testCodespaceName, 30);
        console.log('✓ Codespace is ready');
        console.log('');
        
        // Install sudocode (required to run server)
        console.log('Installing sudocode in dev mode...');
        console.log('(This will take several minutes)');
        await installSudocodeFromLocal(testCodespaceName, workspaceDir);
        console.log('✓ Sudocode installed');
        console.log('');
        
        // Initialize project
        console.log('Initializing sudocode project...');
        await initializeSudocodeProject(testCodespaceName, workspaceDir);
        console.log('✓ Project initialized');
        console.log('');
        
        // Start server
        const testPort = 3003;
        console.log(`Starting server on port ${testPort}...`);
        await startSudocodeServer(testCodespaceName, testPort, workspaceDir);
        await waitForPortListening(testCodespaceName, testPort, 30);
        console.log('✓ Server is running');
        console.log('');
        
        // Start monitor with 5-minute keepalive and 1-minute heartbeat interval
        console.log('Starting traffic monitor with 5-minute keepalive...');
        console.log('- Keepalive: 5 minutes');
        console.log('- Heartbeat interval: 1 minute');
        console.log('- Codespace idle timeout: 2 minutes');
        await startTrafficMonitor({
          codespaceName: testCodespaceName,
          serverPort: testPort,
          serverLogPath: `/tmp/sudocode-${testPort}.log`,
          keepAliveHours: 5 / 60, // 5 minutes
          heartbeatIntervalMinutes: 1 // 1 minute
        });
        console.log('✓ Traffic monitor started');
        console.log('');
        
        // Wait for first heartbeat to confirm daemon is working
        console.log('Waiting for first heartbeat to confirm daemon is active...');
        await waitForCondition(
          async () => {
            try {
              const countResult = await execInCodespace(
                testCodespaceName,
                `wc -l < /tmp/keepalive-heartbeat-${testPort}.txt 2>/dev/null || echo "0"`,
                { streamOutput: false }
              );
              const count = parseInt(countResult.trim());
              return count > 0;
            } catch {
              return false;
            }
          },
          90000,  // 90 second timeout
          10000,  // Check every 10 seconds
          'First heartbeat not written within timeout'
        );
        console.log('✓ First heartbeat confirmed');
        console.log('');
        
        // Now wait 3 minutes WITHOUT any SSH/network activity
        console.log('========================================');
        console.log('CRITICAL TEST PERIOD: Waiting 3 minutes');
        console.log('========================================');
        console.log('');
        console.log('No SSH commands will be run during this time.');
        console.log('The daemon should write heartbeats every 1 minute.');
        console.log('Codespace idle timeout is 2 minutes.');
        console.log('If codespace is still alive after 3 minutes,');
        console.log('then file writes are keeping it alive!');
        console.log('');
        console.log('Waiting...');
        
        // Wait exactly 3 minutes
        const waitMinutes = 3;
        const waitMs = waitMinutes * 60 * 1000;
        await new Promise(resolve => setTimeout(resolve, waitMs));
        
        console.log(`✓ Waited ${waitMinutes} minutes`);
        console.log('');
        
        // Now check if codespace is still alive
        console.log('Checking codespace state...');
        const info = await getCodespaceInfo(testCodespaceName);
        
        console.log(`Codespace state: ${info.state}`);
        expect(info.state).toBe('Available');
        console.log('✓ Codespace is still Available (not paused!)');
        console.log('');
        
        // Verify server is still responding
        console.log('Verifying server is still responding...');
        const isListening = await checkPortListening(testCodespaceName, testPort);
        expect(isListening).toBe(true);
        console.log('✓ Server is still responding');
        console.log('');
        
        // Check heartbeat file was written multiple times during the wait
        console.log('Checking heartbeat file...');
        const heartbeatCount = await execInCodespace(
          testCodespaceName,
          `wc -l < /tmp/keepalive-heartbeat-${testPort}.txt`,
          { streamOutput: false }
        );
        const count = parseInt(heartbeatCount.trim());
        
        // Should have at least 3 heartbeats (one per minute for 3 minutes)
        expect(count).toBeGreaterThanOrEqual(3);
        console.log(`✓ Heartbeat file has ${count} entries (expected >= 3)`);
        console.log('');
        
        console.log('========================================');
        console.log('TEST SUCCESS!');
        console.log('========================================');
        console.log('');
        console.log('The codespace remained alive for 3+ minutes despite');
        console.log('having a 2-minute idle timeout. This proves that the');
        console.log('daemon\'s filesystem writes (heartbeat file) are');
        console.log('keeping the codespace alive!');
        console.log('');
        
      } finally {
        // Clean up the test codespace
        console.log('Cleaning up test codespace...');
        await cleanupTrackedCodespaces();
        console.log('✓ Test codespace deleted');
      }
    }, 900000); // 15 minute timeout (allows for installation + 3 minute wait)
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
    console.log('✓ Test 1: Heartbeats write while server active');
    console.log('✓ Test 2: Heartbeats stop after keepalive expires');
    console.log('✓ Test 3: Heartbeats resume after activity restarts');
    console.log('✓ Both daemons still running');
    console.log('');
  }, 30000); // 30 second timeout
});
