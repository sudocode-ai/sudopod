/**
 * Workspace Manifest Unit Tests
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  writeManifest,
  readManifest,
  MANIFEST_PATH,
} from '../../../src/services/manifest.js';
import type { WorkspaceManifest } from '../../../src/services/manifest.js';
import type { ExecFn } from '../../../src/provider/codespaces/setup.js';

describe('MANIFEST_PATH', () => {
  it('should point to /workspaces/.sudopod/manifest.json', () => {
    expect(MANIFEST_PATH).toBe('/workspaces/.sudopod/manifest.json');
  });
});

describe('writeManifest', () => {
  let mockExec: ExecFn;
  let execCalls: Array<{ name: string; command: string }>;

  beforeEach(() => {
    execCalls = [];
    mockExec = vi.fn(async (name: string, command: string) => {
      execCalls.push({ name, command });
      return { exitCode: 0, stdout: '', stderr: '' };
    });
  });

  it('should create directory and write base64-encoded JSON', async () => {
    const manifest: WorkspaceManifest = {
      version: 1,
      services: [
        {
          name: 'sudocode',
          type: 'service',
          install: '',
          start: 'nohup sudocode server --port 3000 > /tmp/sudocode-3000.log 2>&1',
          port: 3000,
        },
      ],
      createdAt: '2025-01-01T00:00:00.000Z',
    };

    await writeManifest('my-cs', mockExec, manifest);

    expect(execCalls).toHaveLength(2);

    // First call: mkdir
    expect(execCalls[0].name).toBe('my-cs');
    expect(execCalls[0].command).toContain('mkdir -p');

    // Second call: write base64 JSON
    expect(execCalls[1].name).toBe('my-cs');
    expect(execCalls[1].command).toContain('base64 -d');
    expect(execCalls[1].command).toContain(MANIFEST_PATH);

    // Verify the base64 payload decodes to the manifest
    const encoded = execCalls[1].command.match(/echo "([^"]+)"/)?.[1];
    expect(encoded).toBeTruthy();
    const decoded = JSON.parse(Buffer.from(encoded!, 'base64').toString());
    expect(decoded.version).toBe(1);
    expect(decoded.services[0].name).toBe('sudocode');
    expect(decoded.createdAt).toBe('2025-01-01T00:00:00.000Z');
  });

  it('should pass the codespace name to all exec calls', async () => {
    const manifest: WorkspaceManifest = {
      version: 1,
      services: [],
      createdAt: '2025-01-01T00:00:00.000Z',
    };

    await writeManifest('specific-name', mockExec, manifest);

    for (const call of execCalls) {
      expect(call.name).toBe('specific-name');
    }
  });
});

describe('readManifest', () => {
  it('should return parsed manifest from stdout', async () => {
    const manifest: WorkspaceManifest = {
      version: 1,
      services: [
        { name: 'sudocode', type: 'service', install: '', port: 3000 },
      ],
      credentials: { claudeLtt: 'test-token' },
      lifecycle: { idleTimeoutMinutes: 30 },
      createdAt: '2025-01-01T00:00:00.000Z',
    };

    const mockExec: ExecFn = vi.fn(async () => ({
      exitCode: 0,
      stdout: JSON.stringify(manifest),
      stderr: '',
    }));

    const result = await readManifest('my-cs', mockExec);

    expect(result).not.toBeNull();
    expect(result!.version).toBe(1);
    expect(result!.services[0].name).toBe('sudocode');
    expect(result!.credentials?.claudeLtt).toBe('test-token');
    expect(result!.lifecycle?.idleTimeoutMinutes).toBe(30);
  });

  it('should return null when file is missing (empty stdout)', async () => {
    const mockExec: ExecFn = vi.fn(async () => ({
      exitCode: 0,
      stdout: '',
      stderr: '',
    }));

    const result = await readManifest('my-cs', mockExec);
    expect(result).toBeNull();
  });

  it('should return null for invalid JSON', async () => {
    const mockExec: ExecFn = vi.fn(async () => ({
      exitCode: 0,
      stdout: 'not-json{{{',
      stderr: '',
    }));

    const result = await readManifest('my-cs', mockExec);
    expect(result).toBeNull();
  });

  it('should pass the codespace name to exec', async () => {
    const mockExec: ExecFn = vi.fn(async () => ({
      exitCode: 0,
      stdout: '',
      stderr: '',
    }));

    await readManifest('specific-cs', mockExec);

    expect(mockExec).toHaveBeenCalledWith(
      'specific-cs',
      expect.stringContaining(MANIFEST_PATH),
    );
  });
});
