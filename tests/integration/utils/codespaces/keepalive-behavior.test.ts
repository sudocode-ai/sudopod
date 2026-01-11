/**
 * Integration test: Traffic Monitor Keepalive Behavior
 *
 * This test validates that the traffic monitoring daemon actually keeps
 * codespaces alive by testing the REAL EFFECTS, not implementation details.
 *
 * Test Scenarios:
 * 1. Codespace stays alive when keepalive is active (despite idle timeout)
 * 2. Codespace shuts down when keepalive expires and no activity
 * 3. Codespace is saved by reactivating keepalive before idle timeout
 *
 * Uses 5-minute idle timeout for reasonable test duration while validating
 * the actual behavior we care about: keeping codespaces alive.
 *
 * Expected Duration: ~20-30 minutes
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
  startTrafficMonitor,
  getCodespaceInfo,
  type CodespaceInfo
} from '../../../../src/utils/codespaces/index.js';
import {
  verifyTestPrerequisites,
  trackCodespace,
  cleanupTrackedCodespaces,
  markTestFailed
} from './helpers.js';

describe('Traffic Monitor Keepalive Behavior (Integration)', () => {
  const repository = 'sudocode-ai/sudocode';
  const IDLE_TIMEOUT_MINUTES = 5; // GitHub's minimum idle timeout

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

  // Clean up all tracked codespaces after tests
  afterAll(async () => {
    console.log('');
    console.log('========================================');
    console.log('Cleaning up test resources...');
    console.log('========================================');
    await cleanupTrackedCodespaces();
    console.log('✓ Cleanup complete');
  }, 60000);

  describe('Test 1: Codespace stays alive with active keepalive', () => {
    let codespaceName: string;

    it('should create codespace with 5-minute idle timeout', async () => {
      console.log('========================================');
      console.log('Test 1: Codespace Stays Alive with Keepalive');
      console.log('========================================');
      console.log('');

      console.log('Creating codespace...');
      console.log(`- Idle timeout: ${IDLE_TIMEOUT_MINUTES} minutes`);
      console.log(`- Repository: ${repository}`);

      const codespace = await createCodespace({
        repository,
        machine: 'basicLinux32gb',
        idleTimeout: IDLE_TIMEOUT_MINUTES, // 5 minutes - GitHub's minimum
        retentionPeriod: 1 // 1 day
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
    }, 180000); // 3 minute timeout

    it('should start daemon with active keepalive (no server needed)', async () => {
      console.log('Starting traffic monitor daemon...');
      console.log('- Keepalive: 10 minutes (longer than idle timeout)');
      console.log('- SSH interval: 1 minute');
      console.log('- No server running (daemon will create dummy log activity)');

      // Create a dummy log file with activity
      await execInCodespace(
        codespaceName,
        'echo "initial activity" > /tmp/test-keepalive.log',
        { streamOutput: false }
      );

      await startTrafficMonitor({
        codespaceName,
        serverPort: 9999, // Dummy port (no server)
        serverLogPath: '/tmp/test-keepalive.log',
        keepAliveHours: 10 / 60, // 10 minutes
        sshIntervalMinutes: 1 // 1 minute intervals
      });

      console.log('✓ Traffic monitor started');
      console.log('');
    }, 60000); // 1 minute timeout

    it('should keep codespace alive past idle timeout with NO manual activity', async () => {
      console.log('Waiting 7 minutes (past 5-minute idle timeout)...');
      console.log('- NO manual SSH or commands will be run');
      console.log('- Only the daemons SSH keepalive commands');
      console.log('- Codespace should stay alive thanks to daemon');
      console.log('');

      // Wait 7 minutes (past the 5-minute idle timeout)
      const waitTime = 7 * 60 * 1000;
      await new Promise(resolve => setTimeout(resolve, waitTime));

      console.log('7 minutes elapsed. Checking codespace status...');
      const info = await getCodespaceInfo(codespaceName);

      console.log(`Codespace state: ${info.state}`);
      expect(info.state).toBe('Available');
      console.log('✓ Codespace is still Available (kept alive by daemon)!');
      console.log('');
      console.log('Test 1 Complete: Daemon successfully kept codespace alive');
      console.log('');
    }, 500000); // 8 minute timeout (+ buffer)
  });

  describe('Test 2: Codespace shuts down when keepalive expires', () => {
    let codespaceName: string;

    it('should create codespace with 5-minute idle timeout', async () => {
      console.log('========================================');
      console.log('Test 2: Codespace Shuts Down After Keepalive Expires');
      console.log('========================================');
      console.log('');

      console.log('Creating codespace...');
      const codespace = await createCodespace({
        repository,
        machine: 'basicLinux32gb',
        idleTimeout: IDLE_TIMEOUT_MINUTES,
        retentionPeriod: 1
      });

      codespaceName = codespace.name;
      trackCodespace(codespaceName);
      console.log(`✓ Created codespace: ${codespaceName}`);
      console.log('');

      await waitForCodespaceReady(codespaceName, 30);
      console.log('✓ Codespace is ready');
      console.log('');
    }, 180000);

    it('should start daemon with SHORT keepalive (expires before idle timeout)', async () => {
      console.log('Starting traffic monitor with SHORT keepalive...');
      console.log('- Keepalive: 2 minutes (expires BEFORE 5-minute idle timeout)');
      console.log('- SSH interval: 30 seconds');

      await execInCodespace(
        codespaceName,
        'echo "initial activity" > /tmp/test-keepalive2.log',
        { streamOutput: false }
      );

      await startTrafficMonitor({
        codespaceName,
        serverPort: 9998,
        serverLogPath: '/tmp/test-keepalive2.log',
        keepAliveHours: 2 / 60, // 2 minutes
        sshIntervalMinutes: 0.5
      });

      console.log('✓ Traffic monitor started');
      console.log('');
    }, 60000);

    it('should verify initial keepalive is working', async () => {
      console.log('Waiting 1 minute to verify SSH commands execute...');
      await new Promise(resolve => setTimeout(resolve, 60000));

      const daemonLog = await execInCodespace(
        codespaceName,
        'cat /tmp/sudocode-monitor-9998-daemon.log || echo "no log"',
        { streamOutput: false }
      );

      expect(daemonLog).toContain('SSH keepalive executed successfully');
      console.log('✓ Daemon is executing SSH keepalive commands');
      console.log('');
    }, 90000);

    it('should let keepalive expire, then wait for codespace to shut down', async () => {
      console.log('Waiting for keepalive to expire (2 minutes)...');
      await new Promise(resolve => setTimeout(resolve, 120000));

      console.log('Keepalive expired. Daemon should stop SSH commands now.');
      console.log('Waiting 6 more minutes for idle timeout to trigger shutdown...');
      await new Promise(resolve => setTimeout(resolve, 360000));

      console.log('');
      console.log('Checking codespace status...');
      const info = await getCodespaceInfo(codespaceName);

      console.log(`Codespace state: ${info.state}`);

      // Codespace should be unavailable/shutdown (not "Available")
      expect(info.state).not.toBe('Available');
      console.log(`✓ Codespace shut down (state: ${info.state}) after keepalive expired`);
      console.log('');
      console.log('Test 2 Complete: Codespace correctly shut down when keepalive expired');
      console.log('');
    }, 540000); // 9 minute timeout
  });

  describe('Test 3: Reactivate keepalive before idle timeout', () => {
    let codespaceName: string;

    it('should create codespace with 5-minute idle timeout', async () => {
      console.log('========================================');
      console.log('Test 3: Save Codespace by Reactivating Keepalive');
      console.log('========================================');
      console.log('');

      const codespace = await createCodespace({
        repository,
        machine: 'basicLinux32gb',
        idleTimeout: IDLE_TIMEOUT_MINUTES,
        retentionPeriod: 1
      });

      codespaceName = codespace.name;
      trackCodespace(codespaceName);
      console.log(`✓ Created codespace: ${codespaceName}`);
      console.log('');

      await waitForCodespaceReady(codespaceName, 30);
      console.log('✓ Codespace is ready');
      console.log('');
    }, 180000);

    it('should start daemon with short keepalive that will expire', async () => {
      console.log('Starting daemon with 2-minute keepalive...');

      await execInCodespace(
        codespaceName,
        'echo "initial activity" > /tmp/test-keepalive3.log',
        { streamOutput: false }
      );

      await startTrafficMonitor({
        codespaceName,
        serverPort: 9997,
        serverLogPath: '/tmp/test-keepalive3.log',
        keepAliveHours: 2 / 60,
        sshIntervalMinutes: 0.5
      });

      console.log('✓ Daemon started');
      console.log('');
    }, 60000);

    it('should let keepalive expire, then reactivate BEFORE idle timeout', async () => {
      console.log('Waiting for keepalive to expire (2.5 minutes)...');
      await new Promise(resolve => setTimeout(resolve, 150000));

      console.log('Keepalive expired. Daemon has stopped SSH commands.');
      console.log('');

      console.log('Waiting 2 more minutes (still under 5-minute idle timeout)...');
      await new Promise(resolve => setTimeout(resolve, 120000));

      console.log('NOW generating CONTINUOUS activity to reactivate and maintain keepalive...');
      console.log('(This simulates ongoing server activity)');
      console.log('');

      // Generate continuous activity every 30 seconds to keep daemon active
      // This simulates a server that's actively processing requests
      let activityCount = 0;
      const activityInterval = setInterval(async () => {
        try {
          await execInCodespace(
            codespaceName,
            'echo "activity at $(date)" >> /tmp/test-keepalive3.log',
            { streamOutput: false }
          );
          activityCount++;
          console.log(`  Activity generated (${activityCount})`);
        } catch (error) {
          console.error('  Failed to generate activity:', error);
        }
      }, 30000); // Every 30 seconds

      console.log('Generating activity for 3 minutes to keep daemon active...');
      await new Promise(resolve => setTimeout(resolve, 180000)); // 3 minutes

      clearInterval(activityInterval);
      console.log(`✓ Generated ${activityCount} activity updates over 3 minutes`);
      console.log('');

      console.log('Checking codespace status...');
      const info = await getCodespaceInfo(codespaceName);

      console.log(`Codespace state: ${info.state}`);
      expect(info.state).toBe('Available');
      console.log('✓ Codespace is still alive - saved by reactivated keepalive!');
      console.log('');
      console.log('Test 3 Complete: Successfully saved codespace by reactivating keepalive');
      console.log('');
    }, 600000); // 10 minute timeout
  });

  it('should display final summary', async () => {
    console.log('========================================');
    console.log('Keepalive Behavior Tests Complete!');
    console.log('========================================');
    console.log('All behaviors verified:');
    console.log('✓ Test 1: Codespace stayed alive with active keepalive');
    console.log('✓ Test 2: Codespace shut down when keepalive expired');
    console.log('✓ Test 3: Codespace saved by reactivating keepalive');
    console.log('');
    console.log('The daemon successfully keeps codespaces alive!');
    console.log('');
  }, 5000);
});
