/**
 * Coder Keepalive Daemon Unit Tests
 */

import { describe, it, expect } from 'vitest';
import {
  generateKeepaliveScript,
  getKeepaliveScriptPath,
  getKeepalivePidPath,
  generateStartCommand,
  generateStopCommand,
  generateCheckCommand,
} from '../../../../src/provider/providers/coder/keepalive.js';

describe('Coder Keepalive Daemon', () => {
  describe('generateKeepaliveScript', () => {
    it('should generate a bash script', () => {
      const script = generateKeepaliveScript(3000, 60);

      expect(script).toContain('#!/bin/bash');
      expect(script).toContain('Sudocode Keepalive Daemon for Coder');
    });

    it('should include the correct log file path', () => {
      const script = generateKeepaliveScript(3000, 60);

      expect(script).toContain('LOG_FILE="/tmp/sudocode-3000.log"');
    });

    it('should calculate idle timeout in seconds', () => {
      const script = generateKeepaliveScript(3000, 60);

      expect(script).toContain('IDLE_TIMEOUT_SECONDS=3600');
    });

    it('should use custom bump hours', () => {
      const script = generateKeepaliveScript(3000, 60, 4);

      expect(script).toContain('BUMP_HOURS=4');
    });

    it('should use custom check interval', () => {
      const script = generateKeepaliveScript(3000, 60, 2, 60);

      expect(script).toContain('CHECK_INTERVAL=60');
    });

    it('should use coder bump command', () => {
      const script = generateKeepaliveScript(3000, 60);

      expect(script).toContain('coder bump "$CODER_WORKSPACE_NAME"');
    });

    it('should reference CODER_WORKSPACE_NAME environment variable', () => {
      const script = generateKeepaliveScript(3000, 60);

      expect(script).toContain('$CODER_WORKSPACE_NAME');
      expect(script).toContain('CODER_WORKSPACE_NAME');
    });

    it('should include cross-platform stat command', () => {
      const script = generateKeepaliveScript(3000, 60);

      // Linux format
      expect(script).toContain('stat -c %Y');
      // macOS format as fallback
      expect(script).toContain('stat -f %m');
    });

    it('should include logging function', () => {
      const script = generateKeepaliveScript(3000, 60);

      expect(script).toContain('log()');
      expect(script).toContain('[keepalive]');
    });

    it('should include main loop', () => {
      const script = generateKeepaliveScript(3000, 60);

      expect(script).toContain('while true; do');
      expect(script).toContain('sleep $CHECK_INTERVAL');
      expect(script).toContain('done');
    });

    it('should check file existence before reading', () => {
      const script = generateKeepaliveScript(3000, 60);

      expect(script).toContain('if [ -f "$LOG_FILE" ]');
    });

    it('should compare idle time to timeout', () => {
      const script = generateKeepaliveScript(3000, 60);

      expect(script).toContain('IDLE_SECONDS=$((NOW - LAST_MODIFIED))');
      expect(script).toContain('if [ $IDLE_SECONDS -lt $IDLE_TIMEOUT_SECONDS ]');
    });
  });

  describe('getKeepaliveScriptPath', () => {
    it('should return the default script path', () => {
      const path = getKeepaliveScriptPath();

      expect(path).toBe('/tmp/sudocode-keepalive.sh');
    });
  });

  describe('getKeepalivePidPath', () => {
    it('should return the default PID path', () => {
      const path = getKeepalivePidPath();

      expect(path).toBe('/tmp/sudocode-keepalive.pid');
    });
  });

  describe('generateStartCommand', () => {
    it('should generate nohup command with default paths', () => {
      const cmd = generateStartCommand();

      expect(cmd).toContain('nohup /tmp/sudocode-keepalive.sh');
      expect(cmd).toContain('> /tmp/sudocode-keepalive.log 2>&1 &');
      expect(cmd).toContain('echo $! > /tmp/sudocode-keepalive.pid');
    });

    it('should use custom paths when provided', () => {
      const cmd = generateStartCommand('/custom/script.sh', '/custom/pid.file');

      expect(cmd).toContain('nohup /custom/script.sh');
      expect(cmd).toContain('echo $! > /custom/pid.file');
    });
  });

  describe('generateStopCommand', () => {
    it('should generate kill command with default PID path', () => {
      const cmd = generateStopCommand();

      expect(cmd).toContain('/tmp/sudocode-keepalive.pid');
      expect(cmd).toContain('kill $(cat');
      expect(cmd).toContain('rm -f');
    });

    it('should use custom PID path when provided', () => {
      const cmd = generateStopCommand('/custom/pid.file');

      expect(cmd).toContain('/custom/pid.file');
    });

    it('should handle missing PID file gracefully', () => {
      const cmd = generateStopCommand();

      expect(cmd).toContain('if [ -f');
      expect(cmd).toContain('|| true');
    });
  });

  describe('generateCheckCommand', () => {
    it('should generate check command', () => {
      const cmd = generateCheckCommand();

      expect(cmd).toContain('kill -0');
      expect(cmd).toContain('echo "running"');
      expect(cmd).toContain('echo "stopped"');
    });

    it('should use custom PID path when provided', () => {
      const cmd = generateCheckCommand('/custom/pid.file');

      expect(cmd).toContain('/custom/pid.file');
    });
  });
});
