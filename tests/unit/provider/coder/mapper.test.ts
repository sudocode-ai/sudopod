/**
 * Coder Workspace Mapper Unit Tests
 */

import { describe, it, expect } from 'vitest';
import {
  mapStatus,
  mapToWorkspace,
  extractRepoInfo,
  buildParameters,
  buildParametersUnfiltered,
} from '../../../../src/provider/providers/coder/mapper.js';
import type {
  CoderWorkspace,
  CoderAgent,
  CoderTemplateVersion,
} from '../../../../src/provider/providers/coder/types.js';

describe('Coder Workspace Mapper', () => {
  describe('mapStatus', () => {
    it('should map running to running', () => {
      expect(mapStatus('running')).toBe('running');
    });

    it('should map starting to starting', () => {
      expect(mapStatus('starting')).toBe('starting');
    });

    it('should map stopped to stopped', () => {
      expect(mapStatus('stopped')).toBe('stopped');
    });

    it('should map stopping to stopping', () => {
      expect(mapStatus('stopping')).toBe('stopping');
    });

    it('should map pending to creating', () => {
      expect(mapStatus('pending')).toBe('creating');
    });

    it('should map deleting to deleting', () => {
      expect(mapStatus('deleting')).toBe('deleting');
    });

    it('should map deleted to deleting', () => {
      expect(mapStatus('deleted')).toBe('deleting');
    });

    it('should map failed to failed', () => {
      expect(mapStatus('failed')).toBe('failed');
    });

    it('should map canceled to failed', () => {
      expect(mapStatus('canceled')).toBe('failed');
    });

    it('should map canceling to failed', () => {
      expect(mapStatus('canceling')).toBe('failed');
    });

    it('should map unknown status to failed', () => {
      expect(mapStatus('unknown')).toBe('failed');
    });
  });

  describe('mapToWorkspace', () => {
    const baseWorkspace: CoderWorkspace = {
      id: 'ws-123',
      name: 'test-workspace',
      owner_name: 'testuser',
      owner_id: 'user-123',
      template_id: 'tmpl-123',
      template_name: 'docker',
      created_at: '2024-01-01T00:00:00Z',
      last_used_at: '2024-01-02T00:00:00Z',
      organization_id: 'org-1',
      automatic_updates: 'never',
      outdated: false,
      latest_build: {
        id: 'build-123',
        build_number: 1,
        transition: 'start',
        status: 'running',
        job_id: 'job-123',
        template_version_id: 'ver-123',
        resources: [],
        created_at: '2024-01-01T00:00:00Z',
        updated_at: '2024-01-01T00:00:00Z',
      },
    };

    it('should map basic workspace fields', () => {
      const workspace = mapToWorkspace(baseWorkspace);

      expect(workspace.id).toBe('ws-123');
      expect(workspace.name).toBe('test-workspace');
      expect(workspace.provider).toBe('coder');
      expect(workspace.status).toBe('running');
    });

    it('should map dates correctly', () => {
      const workspace = mapToWorkspace(baseWorkspace);

      expect(workspace.createdAt).toBeInstanceOf(Date);
      expect(workspace.createdAt.toISOString()).toBe('2024-01-01T00:00:00.000Z');
      expect(workspace.lastActivityAt).toBeInstanceOf(Date);
      expect(workspace.lastActivityAt?.toISOString()).toBe('2024-01-02T00:00:00.000Z');
    });

    it('should handle missing lastActivityAt', () => {
      const ws = { ...baseWorkspace, last_used_at: undefined };
      const workspace = mapToWorkspace(ws);

      expect(workspace.lastActivityAt).toBeUndefined();
    });

    it('should build SSH command', () => {
      const workspace = mapToWorkspace(baseWorkspace);

      expect(workspace.ssh?.command).toBe('coder ssh test-workspace');
    });

    it('should build dashboard URL from baseUrl', () => {
      const workspace = mapToWorkspace(
        baseWorkspace,
        undefined,
        'https://coder.example.com'
      );

      expect(workspace.urls.dashboard).toBe(
        'https://coder.example.com/@testuser/test-workspace'
      );
    });

    it('should handle trailing slash in baseUrl', () => {
      const workspace = mapToWorkspace(
        baseWorkspace,
        undefined,
        'https://coder.example.com/'
      );

      expect(workspace.urls.dashboard).toBe(
        'https://coder.example.com/@testuser/test-workspace'
      );
    });

    it('should use app URLs when available', () => {
      const agent: CoderAgent = {
        id: 'agent-123',
        name: 'main',
        status: 'connected',
        architecture: 'amd64',
        operating_system: 'linux',
        apps: [
          {
            slug: 'sudocode',
            display_name: 'Sudocode',
            url: 'https://sudocode.example.com',
            health: 'healthy',
          },
          {
            slug: 'code-server',
            display_name: 'VS Code',
            url: 'https://vscode.example.com',
            health: 'healthy',
          },
        ],
      };

      const workspace = mapToWorkspace(baseWorkspace, agent);

      expect(workspace.urls.sudocode).toBe('https://sudocode.example.com');
      expect(workspace.urls.ide).toBe('https://vscode.example.com');
    });
  });

  describe('extractRepoInfo', () => {
    it('should extract repo from metadata', () => {
      const ws: CoderWorkspace = {
        id: 'ws-123',
        name: 'test',
        owner_name: 'user',
        owner_id: 'user-123',
        template_id: 'tmpl-123',
        template_name: 'docker',
        created_at: '2024-01-01T00:00:00Z',
        organization_id: 'org-1',
        automatic_updates: 'never',
        outdated: false,
        latest_build: {
          id: 'build-123',
          build_number: 1,
          transition: 'start',
          status: 'running',
          job_id: 'job-123',
          template_version_id: 'ver-123',
          resources: [
            {
              id: 'res-1',
              name: 'main',
              type: 'docker_container',
              metadata: [{ key: 'repository', value: 'owner/repo' }],
            },
          ],
          created_at: '2024-01-01T00:00:00Z',
          updated_at: '2024-01-01T00:00:00Z',
        },
      };

      const repoInfo = extractRepoInfo(ws);

      expect(repoInfo.owner).toBe('owner');
      expect(repoInfo.repo).toBe('repo');
    });

    it('should handle repo paths with slashes', () => {
      const ws: CoderWorkspace = {
        id: 'ws-123',
        name: 'test',
        owner_name: 'user',
        owner_id: 'user-123',
        template_id: 'tmpl-123',
        template_name: 'docker',
        created_at: '2024-01-01T00:00:00Z',
        organization_id: 'org-1',
        automatic_updates: 'never',
        outdated: false,
        latest_build: {
          id: 'build-123',
          build_number: 1,
          transition: 'start',
          status: 'running',
          job_id: 'job-123',
          template_version_id: 'ver-123',
          resources: [
            {
              id: 'res-1',
              name: 'main',
              type: 'docker_container',
              metadata: [
                { key: 'repository', value: 'org/team/repo' },
              ],
            },
          ],
          created_at: '2024-01-01T00:00:00Z',
          updated_at: '2024-01-01T00:00:00Z',
        },
      };

      const repoInfo = extractRepoInfo(ws);

      expect(repoInfo.owner).toBe('org');
      expect(repoInfo.repo).toBe('team/repo');
    });

    it('should return empty strings when no metadata', () => {
      const ws: CoderWorkspace = {
        id: 'ws-123',
        name: 'test',
        owner_name: 'user',
        owner_id: 'user-123',
        template_id: 'tmpl-123',
        template_name: 'docker',
        created_at: '2024-01-01T00:00:00Z',
        organization_id: 'org-1',
        automatic_updates: 'never',
        outdated: false,
        latest_build: {
          id: 'build-123',
          build_number: 1,
          transition: 'start',
          status: 'running',
          job_id: 'job-123',
          template_version_id: 'ver-123',
          resources: [],
          created_at: '2024-01-01T00:00:00Z',
          updated_at: '2024-01-01T00:00:00Z',
        },
      };

      const repoInfo = extractRepoInfo(ws);

      expect(repoInfo.owner).toBe('');
      expect(repoInfo.repo).toBe('');
    });
  });

  describe('buildParameters', () => {
    const baseVersion: CoderTemplateVersion = {
      id: 'ver-123',
      template_id: 'tmpl-123',
      name: 'v1',
      job: {
        id: 'job-123',
        status: 'succeeded',
        rich_parameter_values: [
          { name: 'repository', value: '' },
          { name: 'branch', value: 'main' },
          { name: 'cpu', value: '2' },
          { name: 'memory', value: '4' },
        ],
      },
      created_at: '2024-01-01T00:00:00Z',
    };

    it('should build repository parameter', () => {
      const params = buildParameters(
        {
          name: 'test',
          repository: { owner: 'foo', repo: 'bar' },
          retentionDays: 7,
        },
        baseVersion
      );

      const repoParam = params.find((p) => p.name === 'repository');
      expect(repoParam?.value).toBe('foo/bar');
    });

    it('should build branch parameter when provided', () => {
      const params = buildParameters(
        {
          name: 'test',
          repository: { owner: 'foo', repo: 'bar', branch: 'develop' },
          retentionDays: 7,
        },
        baseVersion
      );

      const branchParam = params.find((p) => p.name === 'branch');
      expect(branchParam?.value).toBe('develop');
    });

    it('should map resource options', () => {
      const params = buildParameters(
        {
          name: 'test',
          repository: { owner: 'foo', repo: 'bar' },
          retentionDays: 7,
          resources: { cpuCores: 4, memoryGb: 8 },
        },
        baseVersion
      );

      expect(params.find((p) => p.name === 'cpu')?.value).toBe('4');
      expect(params.find((p) => p.name === 'memory')?.value).toBe('8');
    });

    it('should filter to valid parameters', () => {
      const params = buildParameters(
        {
          name: 'test',
          repository: { owner: 'foo', repo: 'bar' },
          retentionDays: 7,
          providerParams: {
            unknown_param: 'value',
            cpu: '2',
          },
        },
        baseVersion
      );

      // unknown_param should be filtered out
      expect(params.find((p) => p.name === 'unknown_param')).toBeUndefined();
      // cpu from providerParams should be included
      expect(params.find((p) => p.name === 'cpu')?.value).toBe('2');
    });

    it('should exclude template from providerParams', () => {
      const params = buildParameters(
        {
          name: 'test',
          repository: { owner: 'foo', repo: 'bar' },
          retentionDays: 7,
          providerParams: {
            template: 'docker',
          },
        },
        baseVersion
      );

      expect(params.find((p) => p.name === 'template')).toBeUndefined();
    });
  });

  describe('buildParametersUnfiltered', () => {
    it('should include all parameters without filtering', () => {
      const params = buildParametersUnfiltered({
        name: 'test',
        repository: { owner: 'foo', repo: 'bar', branch: 'main' },
        retentionDays: 7,
        resources: { cpuCores: 4, memoryGb: 8, diskSizeGb: 100 },
        providerParams: {
          custom_param: 'custom_value',
        },
      });

      expect(params.find((p) => p.name === 'repository')?.value).toBe('foo/bar');
      expect(params.find((p) => p.name === 'branch')?.value).toBe('main');
      expect(params.find((p) => p.name === 'cpu')?.value).toBe('4');
      expect(params.find((p) => p.name === 'memory')?.value).toBe('8');
      expect(params.find((p) => p.name === 'disk_size')?.value).toBe('100');
      expect(params.find((p) => p.name === 'custom_param')?.value).toBe('custom_value');
    });
  });
});
