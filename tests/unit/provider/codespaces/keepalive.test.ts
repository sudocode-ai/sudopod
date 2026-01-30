/**
 * Codespaces Keepalive Script Generator Unit Tests
 */

import { describe, it, expect } from 'vitest';
import { generateKeepaliveScript } from '../../../../src/provider/codespaces/keepalive.js';

describe('generateKeepaliveScript', () => {
  it('should generate a valid bash script', () => {
    const script = generateKeepaliveScript('my-codespace', 3000, 60);

    expect(script).toContain('#!/bin/bash');
    expect(script).toContain('while true; do');
    expect(script).toContain('sleep $CHECK_INTERVAL');
    expect(script).toContain('done');
  });

  it('should include the correct log file path using the port', () => {
    const script = generateKeepaliveScript('my-codespace', 8080, 60);

    expect(script).toContain('LOG_FILE="/tmp/sudocode-8080.log"');
  });

  it('should compute idle timeout in seconds from minutes', () => {
    const script = generateKeepaliveScript('my-codespace', 3000, 45);

    expect(script).toContain('IDLE_TIMEOUT_SECONDS=$((45 * 60))');
  });

  it('should use 30-second check interval', () => {
    const script = generateKeepaliveScript('my-codespace', 3000, 60);

    expect(script).toContain('CHECK_INTERVAL=30');
  });

  it('should include cross-platform stat command', () => {
    const script = generateKeepaliveScript('my-codespace', 3000, 60);

    // GNU Linux stat
    expect(script).toContain('stat -c %Y');
    // BSD/macOS fallback
    expect(script).toContain('stat -f %m');
  });

  it('should include SSH keepalive ping with the correct codespace name', () => {
    const script = generateKeepaliveScript('test-cs-abc123', 3000, 60);

    expect(script).toContain('gh codespace ssh -c test-cs-abc123');
    expect(script).toContain('echo "keepalive"');
  });

  it('should only ping when idle time is less than timeout', () => {
    const script = generateKeepaliveScript('my-codespace', 3000, 60);

    expect(script).toContain('if [ $IDLE_SECONDS -lt $IDLE_TIMEOUT_SECONDS ]');
  });

  it('should check if log file exists before reading mtime', () => {
    const script = generateKeepaliveScript('my-codespace', 3000, 60);

    expect(script).toContain('if [ -f "$LOG_FILE" ]');
  });
});
