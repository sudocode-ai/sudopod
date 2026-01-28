/**
 * Coder CLI Wrapper Integration Tests
 *
 * Tests the CLI wrapper against a real Coder instance and workspace.
 * Requires CODER_URL, CODER_TOKEN, and TEST_WORKSPACE environment variables.
 *
 * The TEST_WORKSPACE should be a running workspace name (e.g., "test-ws").
 * These tests use an existing workspace to avoid slow workspace creation.
 */

import { describe, it, expect, beforeAll } from 'vitest';
import {
  configureCli,
  execInWorkspace,
  writeFile,
  readFile,
  isProcessRunning,
  waitForPort,
} from '../../../../src/provider/providers/coder/cli.js';
import { CoderApiClient } from '../../../../src/provider/providers/coder/api.js';

// Skip if no Coder credentials
const CODER_URL = process.env.CODER_URL;
const CODER_TOKEN = process.env.CODER_TOKEN;
const TEST_WORKSPACE = process.env.TEST_WORKSPACE ?? 'test-ws';

const skipReason =
  !CODER_URL || !CODER_TOKEN
    ? 'CODER_URL and CODER_TOKEN must be set'
    : undefined;

describe.skipIf(skipReason)('Coder CLI Integration', () => {
  let client: CoderApiClient;
  const testWorkspaceName = TEST_WORKSPACE;

  beforeAll(async () => {
    client = new CoderApiClient(CODER_URL!, CODER_TOKEN!);

    // Configure CLI
    await configureCli(CODER_URL!, CODER_TOKEN!);

    // Verify workspace exists and is running
    const workspaces = await client.listWorkspaces(`name:${testWorkspaceName}`, 1);
    if (workspaces.length === 0) {
      throw new Error(
        `Test workspace "${testWorkspaceName}" not found. Create it first or set TEST_WORKSPACE env var.`
      );
    }

    const workspace = workspaces[0];
    if (workspace.latest_build.status !== 'running') {
      throw new Error(
        `Test workspace "${testWorkspaceName}" is not running (status: ${workspace.latest_build.status}). Start it first.`
      );
    }
  }, 30000);

  describe('execInWorkspace', () => {
    it('should execute simple commands', async () => {
      const result = await execInWorkspace(testWorkspaceName, 'echo "hello world"');

      expect(result.exitCode).toBe(0);
      expect(result.stdout.trim()).toBe('hello world');
    });

    it('should return non-zero exit code for failed commands', async () => {
      // Use a command that actually fails (nonexistent command)
      const result = await execInWorkspace(testWorkspaceName, 'nonexistent_command_xyz');

      expect(result.exitCode).not.toBe(0);
    });

    it('should capture stderr', async () => {
      const result = await execInWorkspace(
        testWorkspaceName,
        'echo "error" >&2; exit 1'
      );

      expect(result.exitCode).toBe(1);
      expect(result.stderr).toContain('error');
    });

    it('should run commands in specified directory', async () => {
      const result = await execInWorkspace(testWorkspaceName, 'pwd', {
        cwd: '/tmp',
      });

      expect(result.exitCode).toBe(0);
      expect(result.stdout.trim()).toBe('/tmp');
    });

    it('should run background commands', async () => {
      // Start a background command
      const result = await execInWorkspace(
        testWorkspaceName,
        'sleep 30',
        { background: true }
      );

      // Background commands return immediately with exit code 0
      expect(result.exitCode).toBe(0);
      // stdout should be empty since output is redirected to /dev/null
      expect(result.stdout.trim()).toBe('');
    });
  });

  describe('writeFile and readFile', () => {
    it('should write and read files', async () => {
      const testContent = `Test content ${Date.now()}`;
      const testPath = `/tmp/cli-test-${Date.now()}.txt`;

      await writeFile(testWorkspaceName, testPath, testContent);

      const content = await readFile(testWorkspaceName, testPath);
      expect(content?.trim()).toBe(testContent);
    });

    it('should handle special characters in content', async () => {
      // Test with special characters including newlines and quotes
      const specialContent = 'Line 1\nLine 2\n"quotes" and \'single\'';
      const testPath = `/tmp/special-test-${Date.now()}.txt`;

      await writeFile(testWorkspaceName, testPath, specialContent);

      const content = await readFile(testWorkspaceName, testPath);
      // Normalize line endings (SSH may convert to CRLF)
      const normalizedContent = content?.replace(/\r\n/g, '\n').trim();
      expect(normalizedContent).toBe(specialContent.trim());
    });

    it('should make files executable', async () => {
      const script = '#!/bin/bash\necho "executed"';
      const testPath = `/tmp/test-script-${Date.now()}.sh`;

      await writeFile(testWorkspaceName, testPath, script, { executable: true });

      const result = await execInWorkspace(testWorkspaceName, testPath);
      expect(result.exitCode).toBe(0);
      expect(result.stdout.trim()).toBe('executed');
    });

    it('should return null for non-existent files', async () => {
      const content = await readFile(
        testWorkspaceName,
        `/tmp/definitely-does-not-exist-${Date.now()}.txt`
      );
      expect(content).toBe(null);
    });
  });

  describe('isProcessRunning', () => {
    // Note: Process detection tests are inherently flaky due to timing issues
    // with SSH and the remote execution environment. These tests verify the
    // basic functionality but may occasionally fail due to race conditions.

    it('should return false for non-existent processes', async () => {
      // Use a very unique pattern that definitely won't match anything
      const uniquePattern = `nonexistent_proc_${Date.now()}_${Math.random().toString(36)}`;
      const isRunning = await isProcessRunning(testWorkspaceName, uniquePattern);
      expect(isRunning).toBe(false);
    });
  });

  describe('waitForPort', () => {
    it('should timeout for closed ports', async () => {
      // Use an unlikely port that should not be in use
      await expect(
        waitForPort(testWorkspaceName, 59999, 2000) // Very short timeout
      ).rejects.toThrow('Timeout waiting for port 59999');
    });

    // Note: Testing "should detect open ports" is difficult without nc or
    // a guaranteed service running. The timeout test above verifies the
    // basic polling logic works.
  });
});
