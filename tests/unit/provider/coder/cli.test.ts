/**
 * Coder CLI Wrapper Unit Tests
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// Create a mock for execAsync that we can control
const mockExecAsync = vi.fn();

// Mock the entire module
vi.mock('node:child_process', () => ({
  exec: vi.fn(),
}));

vi.mock('node:util', () => ({
  promisify: () => mockExecAsync,
}));

// Dynamic import to ensure mocks are in place
const importCli = async () => {
  // Clear module cache to ensure fresh import with mocks
  vi.resetModules();
  return import('../../../../src/provider/providers/coder/cli.js');
};

describe('Coder CLI Wrapper (Unit)', () => {
  beforeEach(() => {
    mockExecAsync.mockReset();
  });

  describe('configureCli', () => {
    it('should call coder login with url and token', async () => {
      const { configureCli } = await importCli();

      mockExecAsync.mockResolvedValueOnce({ stdout: '', stderr: '' });

      await configureCli('https://coder.example.com', 'test-token');

      expect(mockExecAsync).toHaveBeenCalledWith(
        'coder login https://coder.example.com --token test-token',
        expect.objectContaining({ timeout: 30000 })
      );
    });

    it('should throw error on CLI failure', async () => {
      const { configureCli } = await importCli();

      mockExecAsync.mockRejectedValueOnce({
        message: 'CLI error',
        stderr: 'Invalid token',
      });

      await expect(
        configureCli('https://coder.example.com', 'bad-token')
      ).rejects.toThrow('Failed to configure coder CLI: Invalid token');
    });
  });

  describe('execInWorkspace', () => {
    it('should execute simple command via coder ssh directly', async () => {
      const { execInWorkspace } = await importCli();

      mockExecAsync.mockResolvedValueOnce({ stdout: 'output\n', stderr: '' });

      const result = await execInWorkspace('my-workspace', 'echo hello');

      // Simple commands are passed directly without bash -c wrapper
      expect(mockExecAsync).toHaveBeenCalledWith(
        'coder ssh my-workspace -- echo hello',
        expect.anything()
      );
      expect(result.exitCode).toBe(0);
      expect(result.stdout).toBe('output\n');
    });

    it('should wrap complex commands with bash -c', async () => {
      const { execInWorkspace } = await importCli();

      mockExecAsync.mockResolvedValueOnce({ stdout: '', stderr: '' });

      // Command with pipe requires bash -c
      await execInWorkspace('my-workspace', 'cat file | grep pattern');

      expect(mockExecAsync).toHaveBeenCalledWith(
        expect.stringContaining("bash -c 'cat file | grep pattern'"),
        expect.anything()
      );
    });

    it('should escape single quotes in complex commands', async () => {
      const { execInWorkspace } = await importCli();

      mockExecAsync.mockResolvedValueOnce({ stdout: '', stderr: '' });

      // Command with single quote and && (triggers bash wrapper)
      await execInWorkspace('my-workspace', "echo 'hello' && echo 'world'");

      // Single quotes should be escaped as '\"'\"'
      expect(mockExecAsync).toHaveBeenCalledWith(
        expect.stringContaining("'\"'\"'hello'\"'\"'"),
        expect.anything()
      );
    });

    it('should use nohup for background commands', async () => {
      const { execInWorkspace } = await importCli();

      mockExecAsync.mockResolvedValueOnce({ stdout: '', stderr: '' });

      await execInWorkspace('my-workspace', 'sleep 100', { background: true });

      expect(mockExecAsync).toHaveBeenCalledWith(
        expect.stringContaining("nohup sleep 100 > /dev/null 2>&1 &"),
        expect.anything()
      );
    });

    it('should change directory if cwd is specified', async () => {
      const { execInWorkspace } = await importCli();

      mockExecAsync.mockResolvedValueOnce({ stdout: '', stderr: '' });

      await execInWorkspace('my-workspace', 'ls', { cwd: '/tmp' });

      // cwd triggers bash wrapper with cd && command pattern
      expect(mockExecAsync).toHaveBeenCalledWith(
        expect.stringContaining('cd "/tmp" && ls'),
        expect.anything()
      );
    });

    it('should return exit code on command failure', async () => {
      const { execInWorkspace } = await importCli();

      mockExecAsync.mockRejectedValueOnce({
        code: 127,
        stdout: '',
        stderr: 'command not found',
      });

      const result = await execInWorkspace('my-workspace', 'nonexistent-cmd');

      expect(result.exitCode).toBe(127);
      expect(result.stderr).toBe('command not found');
    });
  });

  describe('bumpWorkspace', () => {
    it('should call coder bump with workspace and hours', async () => {
      const { bumpWorkspace } = await importCli();

      mockExecAsync.mockResolvedValueOnce({ stdout: '', stderr: '' });

      await bumpWorkspace('my-workspace', 2);

      expect(mockExecAsync).toHaveBeenCalledWith(
        'coder bump my-workspace 2h',
        expect.objectContaining({ timeout: 30000 })
      );
    });
  });

  describe('isProcessRunning', () => {
    it('should return true when process is running', async () => {
      const { isProcessRunning } = await importCli();

      // New implementation uses `ps aux | grep | wc -l` which returns a count
      mockExecAsync.mockResolvedValueOnce({ stdout: '1\n', stderr: '' });

      const result = await isProcessRunning('my-workspace', 'node server.js');

      expect(result).toBe(true);
    });

    it('should return false when process is not running', async () => {
      const { isProcessRunning } = await importCli();

      // Returns 0 when no matching processes
      mockExecAsync.mockResolvedValueOnce({ stdout: '0\n', stderr: '' });

      const result = await isProcessRunning('my-workspace', 'nonexistent-process');

      expect(result).toBe(false);
    });
  });

  describe('writeFile', () => {
    it('should write file using base64 encoding', async () => {
      const { writeFile } = await importCli();

      // mkdir, then base64 write
      mockExecAsync.mockResolvedValueOnce({ stdout: '', stderr: '' });
      mockExecAsync.mockResolvedValueOnce({ stdout: '', stderr: '' });

      await writeFile('my-workspace', '/tmp/test.txt', 'hello world');

      // Should create directory first
      expect(mockExecAsync).toHaveBeenNthCalledWith(
        1,
        expect.stringContaining("mkdir -p '/tmp'"),
        expect.anything()
      );

      // Should base64 encode and pipe
      const base64Content = Buffer.from('hello world').toString('base64');
      expect(mockExecAsync).toHaveBeenNthCalledWith(
        2,
        expect.stringContaining(base64Content),
        expect.anything()
      );
    });

    it('should make file executable when requested', async () => {
      const { writeFile } = await importCli();

      // mkdir, base64 write, chmod
      mockExecAsync.mockResolvedValueOnce({ stdout: '', stderr: '' });
      mockExecAsync.mockResolvedValueOnce({ stdout: '', stderr: '' });
      mockExecAsync.mockResolvedValueOnce({ stdout: '', stderr: '' });

      await writeFile('my-workspace', '/tmp/script.sh', '#!/bin/bash\necho hi', {
        executable: true,
      });

      expect(mockExecAsync).toHaveBeenNthCalledWith(
        3,
        expect.stringContaining("chmod +x '/tmp/script.sh'"),
        expect.anything()
      );
    });
  });

  describe('readFile', () => {
    it('should return file content', async () => {
      const { readFile } = await importCli();

      mockExecAsync.mockResolvedValueOnce({ stdout: 'file content\n', stderr: '' });

      const content = await readFile('my-workspace', '/tmp/test.txt');

      expect(content).toBe('file content\n');
    });

    it('should return null when file does not exist', async () => {
      const { readFile } = await importCli();

      mockExecAsync.mockResolvedValueOnce({ stdout: '__FILE_NOT_FOUND__\n', stderr: '' });

      const content = await readFile('my-workspace', '/nonexistent/file.txt');

      expect(content).toBe(null);
    });
  });

  describe('waitForPort', () => {
    it('should return when port is open', async () => {
      const { waitForPort } = await importCli();

      mockExecAsync.mockResolvedValueOnce({ stdout: 'open\n', stderr: '' });

      await waitForPort('my-workspace', 3000);

      expect(mockExecAsync).toHaveBeenCalledWith(
        expect.stringContaining('nc -z localhost 3000'),
        expect.anything()
      );
    });

    it('should poll until port is open', async () => {
      const { waitForPort } = await importCli();

      // First two attempts: closed, third: open
      mockExecAsync
        .mockResolvedValueOnce({ stdout: 'closed\n', stderr: '' })
        .mockResolvedValueOnce({ stdout: 'closed\n', stderr: '' })
        .mockResolvedValueOnce({ stdout: 'open\n', stderr: '' });

      await waitForPort('my-workspace', 3000, 10000, 10); // Fast poll for test

      expect(mockExecAsync).toHaveBeenCalledTimes(3);
    });

    it('should throw on timeout', async () => {
      const { waitForPort } = await importCli();

      mockExecAsync.mockResolvedValue({ stdout: 'closed\n', stderr: '' });

      await expect(
        waitForPort('my-workspace', 3000, 50, 10) // Very short timeout
      ).rejects.toThrow('Timeout waiting for port 3000');
    });
  });
});
