/**
 * Integration test: Codespaces CLI Primitives
 *
 * Validates that each CLI wrapper function in src/provider/codespaces/cli.ts
 * works against real GitHub Codespaces infrastructure.
 *
 * Test Flow:
 * 1. Create a real codespace
 * 2. Wait for it to be available
 * 3. Exercise all CLI primitives
 * 4. Delete the codespace
 *
 * Expected Duration: ~5-10 minutes
 *
 * Prerequisites:
 * - GitHub CLI installed and authenticated
 * - Access to create codespaces
 *
 * IMPORTANT: Requires RUN_INTEGRATION_TESTS=1
 *
 * @see i-37ax - Integration tests: Codespaces CLI primitives
 * @see s-84xz - Codespaces Provider Implementation specification
 */

import { describe, it, beforeAll, afterAll, expect } from 'vitest';

if (!process.env.RUN_INTEGRATION_TESTS) {
  console.log(
    '\n⚠️  Skipping integration tests: RUN_INTEGRATION_TESTS not set'
  );
  console.log(
    '   To run: RUN_INTEGRATION_TESTS=1 npx vitest run tests/integration/provider/codespaces/cli.test.ts --config vitest.integration.config.ts\n'
  );
  process.exit(0);
}

import {
  createCodespace,
  startCodespace,
  stopCodespace,
  deleteCodespace,
  getCodespace,
  listCodespaces,
  execInCodespace,
  getPorts,
  forwardPort,
  getPortUrl,
} from '../../../../src/provider/codespaces/cli.js';
import {
  verifyTestPrerequisites,
  trackCodespace,
  cleanupTrackedCodespaces,
  waitForCondition,
} from '../../utils/codespaces/helpers.js';

const TEST_REPO = 'sudocode-ai/sudocode';
const TEST_BRANCH = 'main';
const TEST_MACHINE = 'basicLinux32gb';
const RETENTION_DAYS = 1;

describe('Codespaces CLI Primitives (Integration)', () => {
  let codespaceName: string;

  // ──────────────────────────────────────────────────────────────────────────
  // Setup & Teardown
  // ──────────────────────────────────────────────────────────────────────────

  beforeAll(async () => {
    console.log('Verifying integration test prerequisites...');
    await verifyTestPrerequisites();
  }, 30_000);

  afterAll(async () => {
    console.log('Cleaning up test codespaces...');
    await cleanupTrackedCodespaces(false); // always clean up
  }, 120_000);

  // ──────────────────────────────────────────────────────────────────────────
  // createCodespace
  // ──────────────────────────────────────────────────────────────────────────

  it('should create a real codespace', async () => {
    console.log(`Creating codespace in ${TEST_REPO}...`);

    codespaceName = await createCodespace(
      TEST_REPO,
      TEST_BRANCH,
      TEST_MACHINE,
      RETENTION_DAYS
    );

    trackCodespace(codespaceName);

    expect(codespaceName).toBeTruthy();
    expect(typeof codespaceName).toBe('string');
    expect(codespaceName.length).toBeGreaterThan(0);

    console.log(`  Created: ${codespaceName}`);
  }, 300_000); // 5 min — creation can be slow

  // ──────────────────────────────────────────────────────────────────────────
  // getCodespace + wait for Available
  // ──────────────────────────────────────────────────────────────────────────

  it('should get codespace info and wait for Available state', async () => {
    console.log('Waiting for codespace to become Available...');

    await waitForCondition(
      async () => {
        const cs = await getCodespace(codespaceName);
        if (!cs) return false;
        console.log(`  State: ${cs.state}`);
        return cs.state === 'Available';
      },
      180_000, // 3 min
      5_000,
      `Codespace ${codespaceName} did not become Available`
    );

    const cs = await getCodespace(codespaceName);
    expect(cs).not.toBeNull();
    expect(cs!.name).toBe(codespaceName);
    expect(cs!.state).toBe('Available');
    expect(cs!.repository).toBe(TEST_REPO);
    expect(cs!.createdAt).toBeTruthy();

    console.log(`  Available: ${codespaceName}`);
  }, 240_000);

  // ──────────────────────────────────────────────────────────────────────────
  // listCodespaces
  // ──────────────────────────────────────────────────────────────────────────

  it('should list codespaces and find the created one', async () => {
    console.log('Listing codespaces...');

    const codespaces = await listCodespaces();

    expect(Array.isArray(codespaces)).toBe(true);
    expect(codespaces.length).toBeGreaterThan(0);

    const found = codespaces.find((cs) => cs.name === codespaceName);
    expect(found).toBeDefined();
    expect(found!.state).toBe('Available');

    console.log(`  Found ${codespaceName} in list of ${codespaces.length} codespaces`);
  }, 30_000);

  // ──────────────────────────────────────────────────────────────────────────
  // execInCodespace
  // ──────────────────────────────────────────────────────────────────────────

  it('should execute a command in the codespace via SSH', async () => {
    console.log('Executing command in codespace...');

    const result = await execInCodespace(codespaceName, 'echo "hello from integration test"');

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain('hello from integration test');

    console.log(`  stdout: ${result.stdout.trim()}`);
  }, 60_000);

  it('should handle command failure gracefully', async () => {
    console.log('Testing command failure handling...');

    const result = await execInCodespace(codespaceName, 'exit 42');

    expect(result.exitCode).not.toBe(0);

    console.log(`  Exit code: ${result.exitCode}`);
  }, 60_000);

  // ──────────────────────────────────────────────────────────────────────────
  // getPorts
  // ──────────────────────────────────────────────────────────────────────────

  it('should get ports (empty initially)', async () => {
    console.log('Getting ports...');

    const ports = await getPorts(codespaceName);

    expect(Array.isArray(ports)).toBe(true);
    // No ports forwarded yet — may be empty or have default ports

    console.log(`  Ports: ${JSON.stringify(ports)}`);
  }, 30_000);

  // ──────────────────────────────────────────────────────────────────────────
  // forwardPort
  // ──────────────────────────────────────────────────────────────────────────

  it('should forward a port and retrieve its browse URL', async () => {
    console.log('Starting a listener and forwarding port 9999...');

    // Start a simple listener inside the codespace
    await execInCodespace(
      codespaceName,
      'nohup python3 -m http.server 9999 > /dev/null 2>&1',
      { background: true }
    );

    // Give the server a moment to start
    await new Promise((r) => setTimeout(r, 2_000));

    // Register the port with GitHub's forwarding system
    await forwardPort(codespaceName, 9999);

    // Retrieve the public browse URL
    const url = await getPortUrl(codespaceName, 9999);

    expect(url).toBeTruthy();
    expect(typeof url).toBe('string');
    expect(url).toContain('github.dev');

    console.log(`  Forwarded URL: ${url}`);
  }, 60_000);

  // ──────────────────────────────────────────────────────────────────────────
  // stopCodespace
  // ──────────────────────────────────────────────────────────────────────────

  it('should stop the codespace', async () => {
    console.log('Stopping codespace...');

    await stopCodespace(codespaceName);

    // Wait for Shutdown state
    await waitForCondition(
      async () => {
        const cs = await getCodespace(codespaceName);
        if (!cs) return false;
        console.log(`  State: ${cs.state}`);
        return cs.state === 'Shutdown';
      },
      120_000,
      5_000,
      `Codespace ${codespaceName} did not stop`
    );

    const cs = await getCodespace(codespaceName);
    expect(cs!.state).toBe('Shutdown');

    console.log(`  Stopped: ${codespaceName}`);
  }, 180_000);

  // ──────────────────────────────────────────────────────────────────────────
  // startCodespace
  // ──────────────────────────────────────────────────────────────────────────

  it('should start a stopped codespace', async () => {
    console.log('Starting codespace...');

    await startCodespace(codespaceName);

    // Wait for Available state
    await waitForCondition(
      async () => {
        const cs = await getCodespace(codespaceName);
        if (!cs) return false;
        console.log(`  State: ${cs.state}`);
        return cs.state === 'Available';
      },
      180_000,
      5_000,
      `Codespace ${codespaceName} did not start`
    );

    const cs = await getCodespace(codespaceName);
    expect(cs!.state).toBe('Available');

    console.log(`  Started: ${codespaceName}`);
  }, 240_000);

  // ──────────────────────────────────────────────────────────────────────────
  // getCodespace — returns null for nonexistent
  // ──────────────────────────────────────────────────────────────────────────

  it('should return null for a nonexistent codespace', async () => {
    const cs = await getCodespace('nonexistent-codespace-xyz-12345');
    expect(cs).toBeNull();
  }, 30_000);

  // ──────────────────────────────────────────────────────────────────────────
  // deleteCodespace
  // ──────────────────────────────────────────────────────────────────────────

  it('should delete the codespace', async () => {
    console.log('Deleting codespace...');

    await deleteCodespace(codespaceName);

    // Verify it's gone
    const cs = await getCodespace(codespaceName);
    expect(cs).toBeNull();

    console.log(`  Deleted: ${codespaceName}`);
  }, 60_000);
});
