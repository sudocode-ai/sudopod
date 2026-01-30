/**
 * Coder-to-Provider mapper tests (i-4jhh)
 */

import { describe, it, expect } from 'vitest';
import {
  mapCoderStatusToWorkspaceStatus,
  mapCoderWorkspaceToWorkspace,
} from '../../../src/coder-sdk/mapper.js';
import type { CoderWorkspace, CoderWorkspaceStatus } from '../../../src/coder-sdk/types.js';

function makeCoderWorkspace(overrides?: Partial<CoderWorkspace>): CoderWorkspace {
  return {
    id: 'ws-abc',
    name: 'my-workspace',
    owner_id: 'user-1',
    owner_name: 'testuser',
    organization_id: 'org-1',
    template_id: 'tmpl-1',
    template_name: 'docker',
    template_display_name: 'Docker',
    created_at: '2025-06-01T10:00:00Z',
    updated_at: '2025-06-01T11:00:00Z',
    last_used_at: '2025-06-01T12:00:00Z',
    latest_build: {
      id: 'build-1',
      build_number: 1,
      transition: 'start',
      status: 'running',
      created_at: '2025-06-01T10:00:00Z',
      updated_at: '2025-06-01T10:05:00Z',
      resources: [],
      job: { id: 'job-1', status: 'succeeded' },
    },
    health: { healthy: true, failing_agents: [] },
    ...overrides,
  };
}

describe('mapCoderStatusToWorkspaceStatus', () => {
  const cases: Array<[CoderWorkspaceStatus, string]> = [
    ['pending', 'creating'],
    ['starting', 'starting'],
    ['running', 'running'],
    ['stopping', 'stopping'],
    ['stopped', 'stopped'],
    ['deleting', 'deleting'],
    ['deleted', 'deleting'],
    ['canceling', 'failed'],
    ['canceled', 'failed'],
    ['failed', 'failed'],
  ];

  it.each(cases)('maps Coder "%s" to Provider "%s"', (coderStatus, expectedProviderStatus) => {
    expect(mapCoderStatusToWorkspaceStatus(coderStatus)).toBe(expectedProviderStatus);
  });

  it('maps unknown status to "failed"', () => {
    expect(mapCoderStatusToWorkspaceStatus('unknown_status' as CoderWorkspaceStatus)).toBe(
      'failed',
    );
  });
});

describe('mapCoderWorkspaceToWorkspace', () => {
  const options = { baseUrl: 'https://coder.example.com' };

  it('maps basic workspace fields', () => {
    const cw = makeCoderWorkspace();
    const result = mapCoderWorkspaceToWorkspace(cw, options);

    expect(result.id).toBe('ws-abc');
    expect(result.name).toBe('my-workspace');
    expect(result.status).toBe('running');
    expect(result.createdAt).toEqual(new Date('2025-06-01T10:00:00Z'));
    expect(result.lastActivityAt).toEqual(new Date('2025-06-01T12:00:00Z'));
  });

  it('maps SSH connection command', () => {
    const cw = makeCoderWorkspace();
    const result = mapCoderWorkspaceToWorkspace(cw, options);

    expect(result.connection.ssh.command).toBe('ssh coder.my-workspace');
  });

  it('maps dashboard URL with owner and workspace name', () => {
    const cw = makeCoderWorkspace();
    const result = mapCoderWorkspaceToWorkspace(cw, options);

    expect(result.connection.urls?.dashboard).toBe(
      'https://coder.example.com/@testuser/my-workspace',
    );
  });

  it('extracts repository from resource metadata', () => {
    const cw = makeCoderWorkspace({
      latest_build: {
        ...makeCoderWorkspace().latest_build,
        resources: [
          {
            id: 'res-1',
            name: 'main',
            type: 'docker_container',
            metadata: [
              { key: 'repository', value: 'octocat/hello-world', sensitive: false },
              { key: 'cpu', value: '2', sensitive: false },
            ],
          },
        ],
      },
    });

    const result = mapCoderWorkspaceToWorkspace(cw, options);

    expect(result.repository.owner).toBe('octocat');
    expect(result.repository.repo).toBe('hello-world');
  });

  it('returns empty repository when no metadata present', () => {
    const cw = makeCoderWorkspace();
    const result = mapCoderWorkspaceToWorkspace(cw, options);

    expect(result.repository.owner).toBe('');
    expect(result.repository.repo).toBe('');
  });

  it('returns empty repository when metadata has no repository key', () => {
    const cw = makeCoderWorkspace({
      latest_build: {
        ...makeCoderWorkspace().latest_build,
        resources: [
          {
            id: 'res-1',
            name: 'main',
            type: 'docker_container',
            metadata: [{ key: 'cpu', value: '2', sensitive: false }],
          },
        ],
      },
    });

    const result = mapCoderWorkspaceToWorkspace(cw, options);

    expect(result.repository.owner).toBe('');
    expect(result.repository.repo).toBe('');
  });

  it('handles lastActivityAt when last_used_at is empty string', () => {
    const cw = makeCoderWorkspace({ last_used_at: '' });
    const result = mapCoderWorkspaceToWorkspace(cw, options);

    expect(result.lastActivityAt).toBeUndefined();
  });
});
