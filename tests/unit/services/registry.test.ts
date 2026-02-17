/**
 * Service Registry Unit Tests
 */

import { describe, it, expect } from 'vitest';
import {
  getServiceDefinition,
  resolveService,
  getBuiltInServiceNames,
} from '../../../src/services/registry.js';

describe('getServiceDefinition', () => {
  it('should return definition for sudocode', () => {
    const def = getServiceDefinition('sudocode');
    expect(def).toBeDefined();
    expect(def!.name).toBe('sudocode');
    expect(def!.type).toBe('service');
    expect(def!.defaultPort).toBe(3000);
    expect(def!.start).toContain('{port}');
  });

  it('should return definition for claude-code', () => {
    const def = getServiceDefinition('claude-code');
    expect(def).toBeDefined();
    expect(def!.name).toBe('claude-code');
    expect(def!.type).toBe('tool');
    expect(def!.install).toContain('@anthropic-ai/claude-code');
  });

  it('should return definition for aider', () => {
    const def = getServiceDefinition('aider');
    expect(def).toBeDefined();
    expect(def!.name).toBe('aider');
    expect(def!.type).toBe('tool');
    expect(def!.install).toContain('aider-chat');
  });

  it('should return undefined for unknown service', () => {
    expect(getServiceDefinition('nonexistent')).toBeUndefined();
  });
});

describe('resolveService', () => {
  it('should resolve sudocode with default port', () => {
    const resolved = resolveService('sudocode');
    expect(resolved.name).toBe('sudocode');
    expect(resolved.type).toBe('service');
    expect(resolved.port).toBe(3000);
    expect(resolved.start).toContain('--port 3000');
    expect(resolved.start).not.toContain('{port}');
    expect(resolved.check).toContain('--port 3000');
    expect(resolved.healthCheck).toBe('http://localhost:3000/health');
    expect(resolved.logFile).toBe('/tmp/sudocode-3000.log');
  });

  it('should resolve sudocode with port override', () => {
    const resolved = resolveService('sudocode', 4000);
    expect(resolved.port).toBe(4000);
    expect(resolved.start).toContain('--port 4000');
    expect(resolved.check).toContain('--port 4000');
    expect(resolved.healthCheck).toBe('http://localhost:4000/health');
    expect(resolved.logFile).toBe('/tmp/sudocode-4000.log');
  });

  it('should resolve claude-code (tool, no start/check)', () => {
    const resolved = resolveService('claude-code');
    expect(resolved.name).toBe('claude-code');
    expect(resolved.type).toBe('tool');
    expect(resolved.install).toContain('@anthropic-ai/claude-code');
    expect(resolved.start).toBeUndefined();
    expect(resolved.check).toBeUndefined();
  });

  it('should resolve aider (tool, no start/check)', () => {
    const resolved = resolveService('aider');
    expect(resolved.name).toBe('aider');
    expect(resolved.type).toBe('tool');
    expect(resolved.install).toContain('aider-chat');
  });

  it('should throw for unknown service', () => {
    expect(() => resolveService('nonexistent')).toThrow('Unknown service: "nonexistent"');
  });

  it('should include available services in error message', () => {
    expect(() => resolveService('bad')).toThrow('sudocode');
    expect(() => resolveService('bad')).toThrow('claude-code');
    expect(() => resolveService('bad')).toThrow('aider');
  });

  it('should substitute {port} in all template fields', () => {
    const resolved = resolveService('sudocode', 5555);
    // Verify no {port} tokens remain
    const json = JSON.stringify(resolved);
    expect(json).not.toContain('{port}');
  });
});

describe('getBuiltInServiceNames', () => {
  it('should return all built-in service names', () => {
    const names = getBuiltInServiceNames();
    expect(names).toContain('sudocode');
    expect(names).toContain('claude-code');
    expect(names).toContain('aider');
    expect(names).toHaveLength(3);
  });
});
