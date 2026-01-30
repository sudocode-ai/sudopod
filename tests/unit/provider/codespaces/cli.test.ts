/**
 * Codespaces CLI Wrapper Unit Tests
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// Create a mock for execAsync that we can control
const mockExecAsync = vi.fn();

// Mock exec that returns a ChildProcess-like object for forwardPort's spawn pattern
const mockExec = vi.fn();

// Mock child_process and util so promisify(exec) returns our mock
vi.mock('node:child_process', () => ({
  exec: mockExec,
}));

vi.mock('node:util', () => ({
  promisify: () => mockExecAsync,
}));

// Dynamic import to ensure mocks are in place before module loads
const importCli = async () => {
  vi.resetModules();
  return import('../../../../src/provider/codespaces/cli.js');
};

describe('Codespaces CLI Wrapper', () => {
  beforeEach(() => {
    mockExecAsync.mockReset();
    mockExec.mockReset();
  });

  // ==========================================================================
  // execInCodespace
  // ==========================================================================

  describe('execInCodespace', () => {
    it('should execute command via SSH with base64 encoding', async () => {
      const { execInCodespace } = await importCli();

      mockExecAsync.mockResolvedValueOnce({ stdout: 'hello\n', stderr: '' });

      const result = await execInCodespace('my-codespace', 'echo hello');

      const encoded = Buffer.from('echo hello').toString('base64');
      expect(mockExecAsync).toHaveBeenCalledWith(
        `gh codespace ssh -c my-codespace -- "bash -l -c \\"echo ${encoded} | base64 -d | bash\\""`,
        expect.objectContaining({ timeout: 120_000 })
      );
      expect(result.exitCode).toBe(0);
      expect(result.stdout).toBe('hello\n');
      expect(result.stderr).toBe('');
    });

    it('should handle commands with special characters via base64', async () => {
      const { execInCodespace } = await importCli();

      mockExecAsync.mockResolvedValueOnce({ stdout: '', stderr: '' });

      const command = "echo 'hello $USER' && cat /etc/os-release | grep NAME";
      await execInCodespace('my-codespace', command);

      const encoded = Buffer.from(command).toString('base64');
      expect(mockExecAsync).toHaveBeenCalledWith(
        expect.stringContaining(encoded),
        expect.anything()
      );
    });

    it('should place & outside SSH quotes for background commands', async () => {
      const { execInCodespace } = await importCli();

      mockExecAsync.mockResolvedValueOnce({ stdout: '', stderr: '' });

      await execInCodespace('my-codespace', 'node server.js', {
        background: true,
      });

      const encoded = Buffer.from('node server.js').toString('base64');
      // The & goes outside the SSH quotes so SSH returns immediately
      expect(mockExecAsync).toHaveBeenCalledWith(
        `gh codespace ssh -c my-codespace -- "bash -l -c \\"echo ${encoded} | base64 -d | bash\\" &"`,
        expect.objectContaining({ timeout: 10_000 })
      );
    });

    it('should return exit code on command failure', async () => {
      const { execInCodespace } = await importCli();

      mockExecAsync.mockRejectedValueOnce({
        code: 127,
        stdout: '',
        stderr: 'command not found',
      });

      const result = await execInCodespace('my-codespace', 'nonexistent-cmd');

      expect(result.exitCode).toBe(127);
      expect(result.stderr).toBe('command not found');
    });

    it('should default to exit code 1 when code is not available', async () => {
      const { execInCodespace } = await importCli();

      mockExecAsync.mockRejectedValueOnce({
        message: 'exec failed',
      });

      const result = await execInCodespace('my-codespace', 'bad-cmd');

      expect(result.exitCode).toBe(1);
      expect(result.stderr).toBe('exec failed');
    });
  });

  // ==========================================================================
  // createCodespace
  // ==========================================================================

  describe('createCodespace', () => {
    it('should create codespace with correct CLI args', async () => {
      const { createCodespace } = await importCli();

      mockExecAsync.mockResolvedValueOnce({
        stdout: 'my-new-codespace\n',
        stderr: '',
      });

      const name = await createCodespace(
        'owner/repo',
        'main',
        'basicLinux32gb',
        7
      );

      expect(mockExecAsync).toHaveBeenCalledWith(
        'gh codespace create --repo owner/repo --branch main --machine basicLinux32gb --retention-period 168h',
        expect.objectContaining({ timeout: 300_000 })
      );
      expect(name).toBe('my-new-codespace');
    });

    it('should trim whitespace from returned name', async () => {
      const { createCodespace } = await importCli();

      mockExecAsync.mockResolvedValueOnce({
        stdout: '  some-codespace  \n',
        stderr: '',
      });

      const name = await createCodespace('o/r', 'main', 'basic', 1);
      expect(name).toBe('some-codespace');
    });

    it('should throw on creation failure', async () => {
      const { createCodespace } = await importCli();

      mockExecAsync.mockRejectedValueOnce(new Error('quota exceeded'));

      await expect(
        createCodespace('o/r', 'main', 'basic', 1)
      ).rejects.toThrow('quota exceeded');
    });
  });

  // ==========================================================================
  // startCodespace
  // ==========================================================================

  describe('startCodespace', () => {
    it('should call gh codespace start', async () => {
      const { startCodespace } = await importCli();

      mockExecAsync.mockResolvedValueOnce({ stdout: '', stderr: '' });

      await startCodespace('my-codespace');

      expect(mockExecAsync).toHaveBeenCalledWith(
        'gh codespace start -c my-codespace',
        expect.objectContaining({ timeout: 120_000 })
      );
    });

    it('should throw on failure', async () => {
      const { startCodespace } = await importCli();

      mockExecAsync.mockRejectedValueOnce(new Error('already running'));

      await expect(startCodespace('my-codespace')).rejects.toThrow(
        'already running'
      );
    });
  });

  // ==========================================================================
  // stopCodespace
  // ==========================================================================

  describe('stopCodespace', () => {
    it('should call gh codespace stop', async () => {
      const { stopCodespace } = await importCli();

      mockExecAsync.mockResolvedValueOnce({ stdout: '', stderr: '' });

      await stopCodespace('my-codespace');

      expect(mockExecAsync).toHaveBeenCalledWith(
        'gh codespace stop -c my-codespace',
        expect.objectContaining({ timeout: 60_000 })
      );
    });

    it('should throw on failure', async () => {
      const { stopCodespace } = await importCli();

      mockExecAsync.mockRejectedValueOnce(new Error('not running'));

      await expect(stopCodespace('my-codespace')).rejects.toThrow(
        'not running'
      );
    });
  });

  // ==========================================================================
  // deleteCodespace
  // ==========================================================================

  describe('deleteCodespace', () => {
    it('should call gh codespace delete with --force', async () => {
      const { deleteCodespace } = await importCli();

      mockExecAsync.mockResolvedValueOnce({ stdout: '', stderr: '' });

      await deleteCodespace('my-codespace');

      expect(mockExecAsync).toHaveBeenCalledWith(
        'gh codespace delete -c my-codespace --force',
        expect.objectContaining({ timeout: 60_000 })
      );
    });

    it('should throw on failure', async () => {
      const { deleteCodespace } = await importCli();

      mockExecAsync.mockRejectedValueOnce(new Error('not found'));

      await expect(deleteCodespace('my-codespace')).rejects.toThrow(
        'not found'
      );
    });
  });

  // ==========================================================================
  // getCodespace
  // ==========================================================================

  describe('getCodespace', () => {
    it('should return parsed codespace info', async () => {
      const { getCodespace } = await importCli();

      const codespaceData = {
        name: 'my-codespace',
        state: 'Available',
        repository: 'owner/repo',
        createdAt: '2025-01-08T00:00:00Z',
        lastUsedAt: '2025-01-09T12:00:00Z',
      };
      mockExecAsync.mockResolvedValueOnce({
        stdout: JSON.stringify(codespaceData),
        stderr: '',
      });

      const result = await getCodespace('my-codespace');

      expect(mockExecAsync).toHaveBeenCalledWith(
        'gh codespace view -c my-codespace --json name,state,repository,createdAt,lastUsedAt',
        expect.objectContaining({ timeout: 30_000 })
      );
      expect(result).toEqual(codespaceData);
    });

    it('should return null when codespace is not found', async () => {
      const { getCodespace } = await importCli();

      mockExecAsync.mockRejectedValueOnce(new Error('not found'));

      const result = await getCodespace('nonexistent');

      expect(result).toBeNull();
    });
  });

  // ==========================================================================
  // listCodespaces
  // ==========================================================================

  describe('listCodespaces', () => {
    it('should return parsed array of codespaces', async () => {
      const { listCodespaces } = await importCli();

      const codespaces = [
        {
          name: 'cs-1',
          state: 'Available',
          repository: 'owner/repo1',
          createdAt: '2025-01-08T00:00:00Z',
        },
        {
          name: 'cs-2',
          state: 'Shutdown',
          repository: 'owner/repo2',
          createdAt: '2025-01-09T00:00:00Z',
        },
      ];
      mockExecAsync.mockResolvedValueOnce({
        stdout: JSON.stringify(codespaces),
        stderr: '',
      });

      const result = await listCodespaces();

      expect(mockExecAsync).toHaveBeenCalledWith(
        'gh codespace list --json name,state,repository,createdAt,lastUsedAt',
        expect.objectContaining({ timeout: 30_000 })
      );
      expect(result).toHaveLength(2);
      expect(result[0].name).toBe('cs-1');
      expect(result[1].state).toBe('Shutdown');
    });

    it('should return empty array when no codespaces exist', async () => {
      const { listCodespaces } = await importCli();

      mockExecAsync.mockResolvedValueOnce({
        stdout: '[]',
        stderr: '',
      });

      const result = await listCodespaces();

      expect(result).toEqual([]);
    });

    it('should throw on CLI failure', async () => {
      const { listCodespaces } = await importCli();

      mockExecAsync.mockRejectedValueOnce(new Error('auth required'));

      await expect(listCodespaces()).rejects.toThrow('auth required');
    });
  });

  // ==========================================================================
  // getPorts
  // ==========================================================================

  describe('getPorts', () => {
    it('should return parsed array of ports', async () => {
      const { getPorts } = await importCli();

      const ports = [
        { sourcePort: 3000, browseUrl: 'https://cs-3000.app.github.dev' },
        { sourcePort: 8080, browseUrl: 'https://cs-8080.app.github.dev' },
      ];
      mockExecAsync.mockResolvedValueOnce({
        stdout: JSON.stringify(ports),
        stderr: '',
      });

      const result = await getPorts('my-codespace');

      expect(mockExecAsync).toHaveBeenCalledWith(
        'gh codespace ports -c my-codespace --json sourcePort,browseUrl',
        expect.objectContaining({ timeout: 30_000 })
      );
      expect(result).toHaveLength(2);
      expect(result[0].sourcePort).toBe(3000);
      expect(result[1].browseUrl).toBe('https://cs-8080.app.github.dev');
    });

    it('should return empty array when no ports forwarded', async () => {
      const { getPorts } = await importCli();

      mockExecAsync.mockResolvedValueOnce({ stdout: '[]', stderr: '' });

      const result = await getPorts('my-codespace');
      expect(result).toEqual([]);
    });
  });

  // ==========================================================================
  // forwardPort
  // ==========================================================================

  describe('forwardPort', () => {
    // Helper: mock exec() to return a fake ChildProcess with a pid and stderr stream.
    // If stderrData is provided, it's emitted synchronously when the handler is attached,
    // ensuring it's available before the setTimeout callback fires.
    function mockExecSpawn(stderrData?: string) {
      const fakeProcess = {
        pid: 12345,
        stderr: {
          on: (event: string, handler: (data: Buffer) => void) => {
            if (event === 'data' && stderrData) {
              // Emit immediately so it's available before the timer fires
              handler(Buffer.from(stderrData));
            }
          },
        },
      };
      mockExec.mockReturnValueOnce(fakeProcess);
      return fakeProcess;
    }

    let killSpy: ReturnType<typeof vi.spyOn>;
    beforeEach(() => {
      killSpy = vi.spyOn(process, 'kill').mockImplementation(() => true);
      vi.useFakeTimers();
    });
    afterEach(() => {
      killSpy?.mockRestore();
      vi.useRealTimers();
    });

    it('should spawn forward process, wait, and kill it', async () => {
      mockExecSpawn();

      const { forwardPort } = await importCli();
      const promise = forwardPort('my-codespace', 3000);
      await vi.advanceTimersByTimeAsync(2_000);
      await promise;

      expect(mockExec).toHaveBeenCalledWith(
        'gh codespace ports forward 3000:3000 -c my-codespace'
      );
      expect(killSpy).toHaveBeenCalledWith(12345);
    });

    it('should handle missing pid gracefully', async () => {
      mockExec.mockReturnValueOnce({ stderr: null });

      const { forwardPort } = await importCli();
      const promise = forwardPort('my-codespace', 3000);
      await vi.advanceTimersByTimeAsync(2_000);
      await promise;

      expect(killSpy).not.toHaveBeenCalled();
    });

    it('should retry with incremented local port on address conflict', async () => {
      // First attempt: port conflict
      mockExecSpawn('failed to listen to local port over tcp: listen tcp :3000: bind: address already in use');
      // Second attempt: success
      mockExecSpawn();

      const { forwardPort } = await importCli();
      const promise = forwardPort('my-codespace', 3000);
      // First attempt wait
      await vi.advanceTimersByTimeAsync(2_000);
      // Second attempt wait
      await vi.advanceTimersByTimeAsync(2_000);
      await promise;

      // First call with 3000:3000, second with 3000:3001
      expect(mockExec).toHaveBeenCalledTimes(2);
      expect(mockExec).toHaveBeenNthCalledWith(1,
        'gh codespace ports forward 3000:3000 -c my-codespace'
      );
      expect(mockExec).toHaveBeenNthCalledWith(2,
        'gh codespace ports forward 3000:3001 -c my-codespace'
      );
    });

    it('should throw after exhausting all local port attempts', async () => {
      // All 20 attempts fail with address conflict
      for (let i = 0; i < 20; i++) {
        mockExecSpawn('bind: address already in use');
      }

      const { forwardPort } = await importCli();
      let caughtError: Error | undefined;
      const promise = forwardPort('my-codespace', 3000).catch((err) => {
        caughtError = err;
      });

      // Advance past all 20 attempts (20 * 2s)
      await vi.advanceTimersByTimeAsync(50_000);
      await promise;

      expect(caughtError).toBeDefined();
      expect(caughtError!.message).toContain('no available local port');
    });
  });

  // ==========================================================================
  // getPortUrl
  // ==========================================================================

  describe('getPortUrl', () => {
    it('should return browse URL for a registered port', async () => {
      const { getPortUrl } = await importCli();

      mockExecAsync.mockResolvedValueOnce({
        stdout: JSON.stringify([
          { sourcePort: 3000, browseUrl: 'https://cs-3000.app.github.dev' },
        ]),
        stderr: '',
      });

      const url = await getPortUrl('my-codespace', 3000);
      expect(url).toBe('https://cs-3000.app.github.dev');
    });

    it('should throw when port is not found', async () => {
      const { getPortUrl } = await importCli();

      mockExecAsync.mockResolvedValueOnce({ stdout: '[]', stderr: '' });

      await expect(getPortUrl('my-codespace', 3000)).rejects.toThrow(
        'Port 3000 not found in codespace my-codespace'
      );
    });
  });
});
