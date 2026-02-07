/**
 * Coder CLI Wrapper Unit Tests
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createCoderExecFn } from '../../../../src/provider/coder/cli.js';
import type { ExecFn } from '../../../../src/provider/types.js';

// Mock child_process.exec
vi.mock('node:child_process', () => {
  const mockExec = vi.fn();
  return {
    exec: mockExec,
    default: { exec: mockExec },
  };
});

// Mock node:util to return our controlled promisify
vi.mock('node:util', () => ({
  promisify: (fn: unknown) => fn,
}));

import { exec as mockExecRaw } from 'node:child_process';
const mockExec = mockExecRaw as unknown as ReturnType<typeof vi.fn>;

describe('createCoderExecFn', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should return a function', () => {
    const execFn = createCoderExecFn({
      coderUrl: 'https://coder.example.com',
      coderToken: 'test-token',
    });

    expect(typeof execFn).toBe('function');
  });

  it('should satisfy ExecFn type', () => {
    const execFn: ExecFn = createCoderExecFn({
      coderUrl: 'https://coder.example.com',
      coderToken: 'test-token',
    });

    expect(execFn).toBeDefined();
  });
});

describe('execInCoderWorkspace (via createCoderExecFn)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should base64-encode the command', async () => {
    mockExec.mockResolvedValue({ stdout: 'ok', stderr: '' });

    const execFn = createCoderExecFn({
      coderUrl: 'https://coder.example.com',
      coderToken: 'test-token',
    });

    await execFn('my-workspace', 'echo hello');

    expect(mockExec).toHaveBeenCalledTimes(1);
    const [command] = mockExec.mock.calls[0];

    // Verify base64 encoding of the command
    const encoded = Buffer.from('echo hello').toString('base64');
    expect(command).toContain(encoded);
  });

  it('should use coder ssh with workspace name', async () => {
    mockExec.mockResolvedValue({ stdout: '', stderr: '' });

    const execFn = createCoderExecFn({
      coderUrl: 'https://coder.example.com',
      coderToken: 'test-token',
    });

    await execFn('my-workspace', 'ls');

    const [command] = mockExec.mock.calls[0];
    expect(command).toContain('coder ssh my-workspace');
  });

  it('should pass CODER_URL and CODER_SESSION_TOKEN as env vars', async () => {
    mockExec.mockResolvedValue({ stdout: '', stderr: '' });

    const execFn = createCoderExecFn({
      coderUrl: 'https://coder.example.com',
      coderToken: 'secret-token-123',
    });

    await execFn('my-workspace', 'ls');

    const [, options] = mockExec.mock.calls[0];
    expect(options.env.CODER_URL).toBe('https://coder.example.com');
    expect(options.env.CODER_SESSION_TOKEN).toBe('secret-token-123');
  });

  it('should return exitCode 0 on success', async () => {
    mockExec.mockResolvedValue({ stdout: 'output', stderr: 'warn' });

    const execFn = createCoderExecFn({
      coderUrl: 'https://coder.example.com',
      coderToken: 'test-token',
    });

    const result = await execFn('my-workspace', 'echo hi');

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toBe('output');
    expect(result.stderr).toBe('warn');
  });

  it('should return non-zero exitCode on failure', async () => {
    mockExec.mockRejectedValue({
      code: 42,
      stdout: 'partial output',
      stderr: 'command failed',
    });

    const execFn = createCoderExecFn({
      coderUrl: 'https://coder.example.com',
      coderToken: 'test-token',
    });

    const result = await execFn('my-workspace', 'exit 42');

    expect(result.exitCode).toBe(42);
    expect(result.stdout).toBe('partial output');
    expect(result.stderr).toBe('command failed');
  });

  it('should treat background command errors as success', async () => {
    mockExec.mockRejectedValue({
      code: 1,
      stdout: '',
      stderr: 'background exit',
    });

    const execFn = createCoderExecFn({
      coderUrl: 'https://coder.example.com',
      coderToken: 'test-token',
    });

    const result = await execFn('my-workspace', 'nohup server &', {
      background: true,
    });

    expect(result.exitCode).toBe(0);
  });

  it('should append & for background commands', async () => {
    mockExec.mockResolvedValue({ stdout: '', stderr: '' });

    const execFn = createCoderExecFn({
      coderUrl: 'https://coder.example.com',
      coderToken: 'test-token',
    });

    await execFn('my-workspace', 'nohup server', { background: true });

    const [command] = mockExec.mock.calls[0];
    expect(command).toMatch(/& *"$/);
  });

  it('should NOT append & for foreground commands', async () => {
    mockExec.mockResolvedValue({ stdout: '', stderr: '' });

    const execFn = createCoderExecFn({
      coderUrl: 'https://coder.example.com',
      coderToken: 'test-token',
    });

    await execFn('my-workspace', 'echo hello');

    const [command] = mockExec.mock.calls[0];
    expect(command).not.toMatch(/&/);
  });

  it('should use custom timeout when provided', async () => {
    mockExec.mockResolvedValue({ stdout: '', stderr: '' });

    const execFn = createCoderExecFn({
      coderUrl: 'https://coder.example.com',
      coderToken: 'test-token',
    });

    await execFn('my-workspace', 'long command', { timeout: 300_000 });

    const [, options] = mockExec.mock.calls[0];
    expect(options.timeout).toBe(300_000);
  });

  it('should use 120s default timeout for foreground commands', async () => {
    mockExec.mockResolvedValue({ stdout: '', stderr: '' });

    const execFn = createCoderExecFn({
      coderUrl: 'https://coder.example.com',
      coderToken: 'test-token',
    });

    await execFn('my-workspace', 'echo hello');

    const [, options] = mockExec.mock.calls[0];
    expect(options.timeout).toBe(120_000);
  });

  it('should use 10s default timeout for background commands', async () => {
    mockExec.mockResolvedValue({ stdout: '', stderr: '' });

    const execFn = createCoderExecFn({
      coderUrl: 'https://coder.example.com',
      coderToken: 'test-token',
    });

    await execFn('my-workspace', 'nohup server', { background: true });

    const [, options] = mockExec.mock.calls[0];
    expect(options.timeout).toBe(10_000);
  });
});
