/**
 * CoderClient waitForWorkspaceStatus polling tests (i-8oom)
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { CoderClient } from '../../../src/coder-sdk/client.js';
import { CoderApiError } from '../../../src/coder-sdk/errors.js';
import type { CoderWorkspace } from '../../../src/coder-sdk/types.js';

function makeWorkspace(status: string): CoderWorkspace {
  return {
    id: 'ws-1',
    name: 'test-ws',
    owner_id: 'user-1',
    owner_name: 'me',
    organization_id: 'org-1',
    template_id: 'tmpl-1',
    template_name: 'docker',
    template_display_name: 'Docker',
    created_at: '2025-01-01T00:00:00Z',
    updated_at: '2025-01-01T00:00:00Z',
    last_used_at: '2025-01-01T00:00:00Z',
    latest_build: {
      id: 'build-1',
      build_number: 1,
      transition: 'start',
      status: status as CoderWorkspace['latest_build']['status'],
      created_at: '2025-01-01T00:00:00Z',
      updated_at: '2025-01-01T00:00:00Z',
      resources: [],
      job: { id: 'job-1', status: 'succeeded' },
    },
    health: { healthy: true, failing_agents: [] },
  };
}

describe('CoderClient waitForWorkspaceStatus', () => {
  const mockFetch = vi.fn();
  let client: CoderClient;

  beforeEach(() => {
    vi.stubGlobal('fetch', mockFetch);
    vi.useFakeTimers();
    client = new CoderClient({
      baseUrl: 'https://coder.example.com',
      token: 'test-token',
    });
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('returns immediately when status already matches', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      status: 200,
      json: () => Promise.resolve(makeWorkspace('running')),
    });

    const result = await client.waitForWorkspaceStatus({
      workspaceId: 'ws-1',
      targetStatus: 'running',
      pollIntervalMs: 100,
      timeoutMs: 5000,
    });

    expect(result.latest_build.status).toBe('running');
    expect(mockFetch).toHaveBeenCalledOnce();
  });

  it('polls multiple times until status matches', async () => {
    let callCount = 0;
    mockFetch.mockImplementation(() => {
      callCount++;
      const status = callCount < 3 ? 'starting' : 'running';
      return Promise.resolve({
        ok: true,
        status: 200,
        json: () => Promise.resolve(makeWorkspace(status)),
      });
    });

    const promise = client.waitForWorkspaceStatus({
      workspaceId: 'ws-1',
      targetStatus: 'running',
      pollIntervalMs: 100,
      timeoutMs: 10000,
    });

    // Advance timers to allow polling
    await vi.advanceTimersByTimeAsync(500);

    const result = await promise;
    expect(result.latest_build.status).toBe('running');
    expect(callCount).toBe(3);
  });

  it('throws immediately on "failed" status', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      status: 200,
      json: () => Promise.resolve(makeWorkspace('failed')),
    });

    await expect(
      client.waitForWorkspaceStatus({
        workspaceId: 'ws-1',
        targetStatus: 'running',
        pollIntervalMs: 100,
        timeoutMs: 5000,
      }),
    ).rejects.toThrow(CoderApiError);

    await expect(
      client.waitForWorkspaceStatus({
        workspaceId: 'ws-1',
        targetStatus: 'running',
        pollIntervalMs: 100,
        timeoutMs: 5000,
      }),
    ).rejects.toThrow('Workspace build failed');
  });

  it('throws immediately on "canceled" status', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      status: 200,
      json: () => Promise.resolve(makeWorkspace('canceled')),
    });

    await expect(
      client.waitForWorkspaceStatus({
        workspaceId: 'ws-1',
        targetStatus: 'running',
        pollIntervalMs: 100,
        timeoutMs: 5000,
      }),
    ).rejects.toThrow('Workspace build canceled');
  });

  it('throws on timeout', async () => {
    vi.useRealTimers();

    mockFetch.mockImplementation(() =>
      Promise.resolve({
        ok: true,
        status: 200,
        json: () => Promise.resolve(makeWorkspace('starting')),
      }),
    );

    await expect(
      client.waitForWorkspaceStatus({
        workspaceId: 'ws-1',
        targetStatus: 'running',
        pollIntervalMs: 10,
        timeoutMs: 50,
      }),
    ).rejects.toThrow('Timed out waiting for workspace status');
  });

  it('uses custom pollIntervalMs', async () => {
    let callCount = 0;
    mockFetch.mockImplementation(() => {
      callCount++;
      const status = callCount < 2 ? 'starting' : 'running';
      return Promise.resolve({
        ok: true,
        status: 200,
        json: () => Promise.resolve(makeWorkspace(status)),
      });
    });

    const promise = client.waitForWorkspaceStatus({
      workspaceId: 'ws-1',
      targetStatus: 'running',
      pollIntervalMs: 500,
      timeoutMs: 5000,
    });

    // After 100ms, only the first call should have happened
    await vi.advanceTimersByTimeAsync(100);
    expect(callCount).toBe(1);

    // After 500ms more, second poll should fire
    await vi.advanceTimersByTimeAsync(500);

    const result = await promise;
    expect(result.latest_build.status).toBe('running');
  });
});
