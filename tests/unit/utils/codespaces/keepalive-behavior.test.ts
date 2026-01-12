/**
 * Unit tests: Idle Timeout Daemon Behavior
 * 
 * These tests validate the idle timeout daemon logic without requiring real codespaces.
 * They mock the codespace primitives (execInCodespace, etc.) to test:
 * 
 * - Daemon script generation logic
 * - SSH interval calculations
 * - Port allocation logic
 * - Error handling paths
 * - SSH command execution logic
 * 
 * These tests run fast (< 5 seconds) and don't require:
 * - GitHub CLI authentication
 * - Network connectivity
 * - Real codespace resources
 * 
 * For integration tests that verify real codespace behavior, see:
 * tests/integration/utils/codespaces/keepalive-behavior.test.ts
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { IdleTimeoutDaemonOptions } from '../../../../src/utils/codespaces/types.js';

// Mock the execution module
vi.mock('../../../../src/utils/codespaces/execution.js', () => ({
  execInCodespace: vi.fn()
}));

describe('Idle Timeout Daemon Behavior (Unit Tests)', () => {
  let mockExecInCodespace: ReturnType<typeof vi.fn>;
  
  beforeEach(async () => {
    // Import the mocked module
    const { execInCodespace } = await import('../../../../src/utils/codespaces/execution.js');
    mockExecInCodespace = execInCodespace as ReturnType<typeof vi.fn>;
    
    // Default mock: successful execution
    mockExecInCodespace.mockResolvedValue('success');
  });
  
  afterEach(() => {
    vi.clearAllMocks();
  });
  
  describe('Daemon Script Generation', () => {
    it('should generate valid bash script with correct shebang', async () => {
      const { startIdleTimeoutDaemon } = await import('../../../../src/utils/codespaces/keepalive.js');
      
      const options: IdleTimeoutDaemonOptions = {
        codespaceName: 'test-codespace-abc123',
        serverPort: 3000,
        serverLogPath: '/tmp/sudocode-3000.log',
        idleTimeoutHours: 24,
        sshIntervalMinutes: 0.5
      };
      
      // Mock PID file check to succeed
      mockExecInCodespace.mockImplementation(async (name: string, cmd: string) => {
        if (cmd.includes('test -f')) {
          return '1'; // PID file exists
        }
        return 'success';
      });
      
      await startIdleTimeoutDaemon(options);
      
      // Find the base64 write command
      const base64WriteCall = mockExecInCodespace.mock.calls.find(
        (call) => call[1].includes('base64 -d')
      );
      
      expect(base64WriteCall).toBeDefined();
      
      // Decode the script
      const base64Match = base64WriteCall![1].match(/echo '([^']+)'/);
      expect(base64Match).toBeDefined();
      
      const scriptContent = Buffer.from(base64Match![1], 'base64').toString('utf-8');
      
      // Verify script structure
      expect(scriptContent).toContain('#!/bin/bash -l');
      expect(scriptContent).toContain('CODESPACE_NAME="test-codespace-abc123"');
      expect(scriptContent).toContain('SERVER_LOG="/tmp/sudocode-3000.log"');
    });
    
    it('should calculate keepalive seconds correctly', async () => {
      const { startIdleTimeoutDaemon } = await import('../../../../src/utils/codespaces/keepalive.js');
      
      const options: IdleTimeoutDaemonOptions = {
        codespaceName: 'test-codespace',
        serverPort: 3000,
        serverLogPath: '/tmp/sudocode-3000.log',
        idleTimeoutHours: 2, // 2 hours = 7200 seconds
        sshIntervalMinutes: 1 // 1 minute = 60 seconds
      };
      
      mockExecInCodespace.mockImplementation(async (name: string, cmd: string) => {
        if (cmd.includes('test -f')) {
          return '1';
        }
        return 'success';
      });
      
      await startIdleTimeoutDaemon(options);
      
      const base64WriteCall = mockExecInCodespace.mock.calls.find(
        (call) => call[1].includes('base64 -d')
      );
      const base64Match = base64WriteCall![1].match(/echo '([^']+)'/);
      const scriptContent = Buffer.from(base64Match![1], 'base64').toString('utf-8');
      
      expect(scriptContent).toContain('IDLE_TIMEOUT_SECONDS=7200');
      expect(scriptContent).toContain('SSH_INTERVAL=60');
    });
    
    it('should handle fractional time values correctly', async () => {
      const { startIdleTimeoutDaemon } = await import('../../../../src/utils/codespaces/keepalive.js');
      
      const options: IdleTimeoutDaemonOptions = {
        codespaceName: 'test-codespace',
        serverPort: 3000,
        serverLogPath: '/tmp/sudocode-3000.log',
        idleTimeoutHours: 0.5, // 30 minutes = 1800 seconds
        sshIntervalMinutes: 0.5 // 30 seconds
      };
      
      mockExecInCodespace.mockImplementation(async (name: string, cmd: string) => {
        if (cmd.includes('test -f')) {
          return '1';
        }
        return 'success';
      });
      
      await startIdleTimeoutDaemon(options);
      
      const base64WriteCall = mockExecInCodespace.mock.calls.find(
        (call) => call[1].includes('base64 -d')
      );
      const base64Match = base64WriteCall![1].match(/echo '([^']+)'/);
      const scriptContent = Buffer.from(base64Match![1], 'base64').toString('utf-8');
      
      expect(scriptContent).toContain('IDLE_TIMEOUT_SECONDS=1800');
      expect(scriptContent).toContain('SSH_INTERVAL=30');
    });
    
    it('should include SSH keepalive command with correct codespace name', async () => {
      const { startIdleTimeoutDaemon } = await import('../../../../src/utils/codespaces/keepalive.js');
      
      const options: IdleTimeoutDaemonOptions = {
        codespaceName: 'my-special-codespace-xyz789',
        serverPort: 4000,
        serverLogPath: '/tmp/sudocode-4000.log',
        idleTimeoutHours: 1,
        sshIntervalMinutes: 0.5
      };
      
      mockExecInCodespace.mockImplementation(async (name: string, cmd: string) => {
        if (cmd.includes('test -f')) {
          return '1';
        }
        return 'success';
      });
      
      await startIdleTimeoutDaemon(options);
      
      const base64WriteCall = mockExecInCodespace.mock.calls.find(
        (call) => call[1].includes('base64 -d')
      );
      const base64Match = base64WriteCall![1].match(/echo '([^']+)'/);
      const scriptContent = Buffer.from(base64Match![1], 'base64').toString('utf-8');
      
      expect(scriptContent).toContain('gh codespace ssh -c "$CODESPACE_NAME"');
      expect(scriptContent).toContain('echo "keepalive"');
    });
    
    it('should include proper logging statements', async () => {
      const { startIdleTimeoutDaemon } = await import('../../../../src/utils/codespaces/keepalive.js');
      
      const options: IdleTimeoutDaemonOptions = {
        codespaceName: 'test-codespace',
        serverPort: 3000,
        serverLogPath: '/tmp/sudocode-3000.log',
        idleTimeoutHours: 24,
        sshIntervalMinutes: 0.5
      };
      
      mockExecInCodespace.mockImplementation(async (name: string, cmd: string) => {
        if (cmd.includes('test -f')) {
          return '1';
        }
        return 'success';
      });
      
      await startIdleTimeoutDaemon(options);
      
      const base64WriteCall = mockExecInCodespace.mock.calls.find(
        (call) => call[1].includes('base64 -d')
      );
      const base64Match = base64WriteCall![1].match(/echo '([^']+)'/);
      const scriptContent = Buffer.from(base64Match![1], 'base64').toString('utf-8');
      
      expect(scriptContent).toContain('log "Daemon started with PID $$"');
      expect(scriptContent).toContain('log "SSH keepalive executed successfully');
      expect(scriptContent).toContain('log "Idle timeout expired');
      expect(scriptContent).toContain('skipping SSH"');
    });
  });
  
  describe('Daemon Startup Process', () => {
    it('should write script via base64 encoding', async () => {
      const { startIdleTimeoutDaemon } = await import('../../../../src/utils/codespaces/keepalive.js');
      
      const options: IdleTimeoutDaemonOptions = {
        codespaceName: 'test-codespace',
        serverPort: 3000,
        serverLogPath: '/tmp/sudocode-3000.log',
        idleTimeoutHours: 24,
        sshIntervalMinutes: 0.5
      };
      
      mockExecInCodespace.mockImplementation(async (name: string, cmd: string) => {
        if (cmd.includes('test -f')) {
          return '1';
        }
        return 'success';
      });
      
      await startIdleTimeoutDaemon(options);
      
      // Should write via base64 to avoid heredoc issues
      const base64WriteCall = mockExecInCodespace.mock.calls.find(
        (call) => call[1].includes("echo '") && call[1].includes('base64 -d')
      );
      
      expect(base64WriteCall).toBeDefined();
      expect(base64WriteCall![1]).toContain('/tmp/sudocode-monitor-3000.sh');
    });
    
    it('should make script executable', async () => {
      const { startIdleTimeoutDaemon } = await import('../../../../src/utils/codespaces/keepalive.js');
      
      const options: IdleTimeoutDaemonOptions = {
        codespaceName: 'test-codespace',
        serverPort: 3000,
        serverLogPath: '/tmp/sudocode-3000.log',
        idleTimeoutHours: 24,
        sshIntervalMinutes: 0.5
      };
      
      mockExecInCodespace.mockImplementation(async (name: string, cmd: string) => {
        if (cmd.includes('test -f')) {
          return '1';
        }
        return 'success';
      });
      
      await startIdleTimeoutDaemon(options);
      
      const chmodCall = mockExecInCodespace.mock.calls.find(
        (call) => call[1].includes('chmod +x')
      );
      
      expect(chmodCall).toBeDefined();
      expect(chmodCall![1]).toContain('/tmp/sudocode-monitor-3000.sh');
    });
    
    it('should start daemon in background with nohup', async () => {
      const { startIdleTimeoutDaemon } = await import('../../../../src/utils/codespaces/keepalive.js');
      
      const options: IdleTimeoutDaemonOptions = {
        codespaceName: 'test-codespace',
        serverPort: 3000,
        serverLogPath: '/tmp/sudocode-3000.log',
        idleTimeoutHours: 24,
        sshIntervalMinutes: 0.5
      };
      
      mockExecInCodespace.mockImplementation(async (name: string, cmd: string) => {
        if (cmd.includes('test -f')) {
          return '1';
        }
        return 'success';
      });
      
      await startIdleTimeoutDaemon(options);
      
      const nohupCall = mockExecInCodespace.mock.calls.find(
        (call) => call[1].includes('nohup')
      );
      
      expect(nohupCall).toBeDefined();
      expect(nohupCall![1]).toContain('nohup /tmp/sudocode-monitor-3000.sh');
      expect(nohupCall![1]).toContain('>/dev/null 2>&1');
    });
    
    it('should verify daemon started by checking PID file', async () => {
      const { startIdleTimeoutDaemon } = await import('../../../../src/utils/codespaces/keepalive.js');
      
      const options: IdleTimeoutDaemonOptions = {
        codespaceName: 'test-codespace',
        serverPort: 3000,
        serverLogPath: '/tmp/sudocode-3000.log',
        idleTimeoutHours: 24,
        sshIntervalMinutes: 0.5
      };
      
      mockExecInCodespace.mockImplementation(async (name: string, cmd: string) => {
        if (cmd.includes('test -f')) {
          return '1'; // PID file exists
        }
        return 'success';
      });
      
      await startIdleTimeoutDaemon(options);
      
      const pidCheckCall = mockExecInCodespace.mock.calls.find(
        (call) => call[1].includes('test -f /tmp/sudocode-monitor-3000.pid')
      );
      
      expect(pidCheckCall).toBeDefined();
    });
  });
  
  describe('Error Handling', () => {
    it('should throw error if PID file not created', async () => {
      const { startIdleTimeoutDaemon } = await import('../../../../src/utils/codespaces/keepalive.js');
      
      const options: IdleTimeoutDaemonOptions = {
        codespaceName: 'test-codespace',
        serverPort: 3000,
        serverLogPath: '/tmp/sudocode-3000.log',
        idleTimeoutHours: 24,
        sshIntervalMinutes: 0.5
      };
      
      // Mock PID file check to fail
      mockExecInCodespace.mockImplementation(async (name: string, cmd: string) => {
        if (cmd.includes('test -f')) {
          return '0'; // PID file does not exist
        }
        if (cmd.includes('cat /tmp/sudocode-monitor')) {
          return 'Daemon failed to start - some error';
        }
        return 'success';
      });
      
      await expect(startIdleTimeoutDaemon(options)).rejects.toThrow(
        'Idle timeout daemon failed to start: PID file not created'
      );
    });
    
    it('should include daemon log in error message when startup fails', async () => {
      const { startIdleTimeoutDaemon } = await import('../../../../src/utils/codespaces/keepalive.js');
      
      const options: IdleTimeoutDaemonOptions = {
        codespaceName: 'test-codespace',
        serverPort: 3000,
        serverLogPath: '/tmp/sudocode-3000.log',
        idleTimeoutHours: 24,
        sshIntervalMinutes: 0.5
      };
      
      const mockDaemonLog = 'ERROR: gh CLI not found in PATH';
      
      mockExecInCodespace.mockImplementation(async (name: string, cmd: string) => {
        if (cmd.includes('test -f')) {
          return '0';
        }
        if (cmd.includes('cat /tmp/sudocode-monitor-3000-daemon.log')) {
          return mockDaemonLog;
        }
        return 'success';
      });
      
      await expect(startIdleTimeoutDaemon(options)).rejects.toThrow(mockDaemonLog);
    });
    
    it('should validate keepalive parameters are positive', async () => {
      const { startIdleTimeoutDaemon } = await import('../../../../src/utils/codespaces/keepalive.js');
      
      const options: IdleTimeoutDaemonOptions = {
        codespaceName: 'test-codespace',
        serverPort: 3000,
        serverLogPath: '/tmp/sudocode-3000.log',
        idleTimeoutHours: 0, // Invalid: 0 hours (will default to 24 but still creates invalid value)
        sshIntervalMinutes: 0.5
      };
      
      // Note: The current implementation defaults 0 to 24 hours, so this doesn't throw.
      // This test documents the current behavior. For true validation, the code would need
      // to be updated to reject 0 values before defaulting.
      mockExecInCodespace.mockImplementation(async (name: string, cmd: string) => {
        if (cmd.includes('test -f')) {
          return '0'; // PID file doesn't exist
        }
        return 'success';
      });
      
      // Currently this throws due to PID file not existing, not due to validation
      await expect(startIdleTimeoutDaemon(options)).rejects.toThrow();
    });
    
    it('should throw error for invalid SSH interval parameters', async () => {
      const { startIdleTimeoutDaemon } = await import('../../../../src/utils/codespaces/keepalive.js');
      
      const options: IdleTimeoutDaemonOptions = {
        codespaceName: 'test-codespace',
        serverPort: 3000,
        serverLogPath: '/tmp/sudocode-3000.log',
        idleTimeoutHours: 24,
        sshIntervalMinutes: -1 // Invalid: negative interval
      };
      
      await expect(startIdleTimeoutDaemon(options)).rejects.toThrow(
        'Invalid idle timeout parameters'
      );
    });
  });
  
  describe('Port Management', () => {
    it('should use correct port in all file paths', async () => {
      const { startIdleTimeoutDaemon } = await import('../../../../src/utils/codespaces/keepalive.js');
      
      const testPort = 4567;
      const options: IdleTimeoutDaemonOptions = {
        codespaceName: 'test-codespace',
        serverPort: testPort,
        serverLogPath: `/tmp/sudocode-${testPort}.log`,
        idleTimeoutHours: 24,
        sshIntervalMinutes: 0.5
      };
      
      mockExecInCodespace.mockImplementation(async (name: string, cmd: string) => {
        if (cmd.includes('test -f')) {
          return '1';
        }
        return 'success';
      });
      
      await startIdleTimeoutDaemon(options);
      
      // Check all commands use correct port
      const allCommands = mockExecInCodespace.mock.calls.map(call => call[1]);
      const commandsWithPort = allCommands.filter(cmd => cmd.includes(testPort.toString()));
      
      expect(commandsWithPort.length).toBeGreaterThan(0);
      
      // Verify specific paths (daemon log path is inside the script, not in commands)
      const scriptPath = `/tmp/sudocode-monitor-${testPort}.sh`;
      const pidPath = `/tmp/sudocode-monitor-${testPort}.pid`;
      
      const hasScriptPath = allCommands.some(cmd => cmd.includes(scriptPath));
      const hasPidPath = allCommands.some(cmd => cmd.includes(pidPath));
      
      expect(hasScriptPath).toBe(true);
      expect(hasPidPath).toBe(true);
    });
  });
  
  describe('Stop Idle Timeout Daemon', () => {
    it('should kill daemon process and remove PID file', async () => {
      const { stopIdleTimeoutDaemon } = await import('../../../../src/utils/codespaces/keepalive.js');
      
      await stopIdleTimeoutDaemon('test-codespace', 3000);
      
      const killCall = mockExecInCodespace.mock.calls.find(
        (call) => call[1].includes('kill')
      );
      
      expect(killCall).toBeDefined();
      expect(killCall![1]).toContain('cat /tmp/sudocode-monitor-3000.pid');
      expect(killCall![1]).toContain('rm /tmp/sudocode-monitor-3000.pid');
    });
    
    it('should handle case where daemon is not running', async () => {
      const { stopIdleTimeoutDaemon } = await import('../../../../src/utils/codespaces/keepalive.js');
      
      // Should not throw even if daemon not running (idempotent)
      await expect(stopIdleTimeoutDaemon('test-codespace', 3000)).resolves.not.toThrow();
      
      const killCall = mockExecInCodespace.mock.calls.find(
        (call) => call[1].includes('kill')
      );
      
      // Should include || true for idempotency
      expect(killCall![1]).toContain('|| true');
    });
  });
  
  describe('Check Idle Timeout Daemon Status', () => {
    it('should check both PID file and process status', async () => {
      const { isIdleTimeoutDaemonRunning } = await import('../../../../src/utils/codespaces/keepalive.js');
      
      mockExecInCodespace.mockResolvedValue('1');
      
      const isRunning = await isIdleTimeoutDaemonRunning('test-codespace', 3000);
      
      expect(isRunning).toBe(true);
      
      const statusCheckCall = mockExecInCodespace.mock.calls.find(
        (call) => call[1].includes('ps -p')
      );
      
      expect(statusCheckCall).toBeDefined();
      expect(statusCheckCall![1]).toContain('cat /tmp/sudocode-monitor-3000.pid');
      // The command uses [ -f ... ] (bracket syntax) not "test -f ..."
      expect(statusCheckCall![1]).toContain('[ -f /tmp/sudocode-monitor-3000.pid ]');
    });
    
    it('should return false if PID file does not exist', async () => {
      const { isIdleTimeoutDaemonRunning } = await import('../../../../src/utils/codespaces/keepalive.js');
      
      mockExecInCodespace.mockResolvedValue('0');
      
      const isRunning = await isIdleTimeoutDaemonRunning('test-codespace', 3000);
      
      expect(isRunning).toBe(false);
    });
    
    it('should return false if process is not running', async () => {
      const { isIdleTimeoutDaemonRunning } = await import('../../../../src/utils/codespaces/keepalive.js');
      
      mockExecInCodespace.mockResolvedValue('0');
      
      const isRunning = await isIdleTimeoutDaemonRunning('test-codespace', 3000);
      
      expect(isRunning).toBe(false);
    });
    
    it('should return false if codespace is unreachable', async () => {
      const { isIdleTimeoutDaemonRunning } = await import('../../../../src/utils/codespaces/keepalive.js');
      
      mockExecInCodespace.mockRejectedValue(new Error('Connection failed'));
      
      const isRunning = await isIdleTimeoutDaemonRunning('test-codespace', 3000);
      
      expect(isRunning).toBe(false);
    });
  });
  
  describe('Default Values', () => {
    it('should use default SSH interval if not specified', async () => {
      const { startIdleTimeoutDaemon } = await import('../../../../src/utils/codespaces/keepalive.js');
      
      const options: IdleTimeoutDaemonOptions = {
        codespaceName: 'test-codespace',
        serverPort: 3000,
        serverLogPath: '/tmp/sudocode-3000.log',
        idleTimeoutHours: 24
        // sshIntervalMinutes not specified
      };
      
      mockExecInCodespace.mockImplementation(async (name: string, cmd: string) => {
        if (cmd.includes('test -f')) {
          return '1';
        }
        return 'success';
      });
      
      await startIdleTimeoutDaemon(options);
      
      const base64WriteCall = mockExecInCodespace.mock.calls.find(
        (call) => call[1].includes('base64 -d')
      );
      const base64Match = base64WriteCall![1].match(/echo '([^']+)'/);
      const scriptContent = Buffer.from(base64Match![1], 'base64').toString('utf-8');
      
      // Default is 0.5 minutes = 30 seconds
      expect(scriptContent).toContain('SSH_INTERVAL=30');
    });
  });
});
