/**
 * Coder API Types Tests
 *
 * Verifies that Coder API types are properly exported and structured.
 * These are compile-time type tests - if this file compiles, the types are correct.
 */

import { describe, it, expect } from 'vitest';
import type {
  CoderUser,
  CoderWorkspace,
  CoderWorkspaceBuild,
  CoderResource,
  CoderAgent,
  CoderApp,
  CoderTemplate,
  CoderTemplateVersion,
  CoderBuildStatus,
  CoderAgentStatus,
  RichParameterValue,
  CreateWorkspaceRequest,
  CreateWorkspaceBuildRequest,
  ExtendWorkspaceRequest,
  ListWorkspacesResponse,
  CoderAPIErrorResponse,
} from '../../../../src/provider/providers/coder/types.js';

describe('Coder API Types', () => {
  describe('CoderUser', () => {
    it('should have required user fields', () => {
      const user: CoderUser = {
        id: 'user-123',
        username: 'testuser',
        email: 'test@example.com',
        organization_ids: ['org-1'],
        created_at: '2024-01-01T00:00:00Z',
        status: 'active',
      };

      expect(user.id).toBe('user-123');
      expect(user.username).toBe('testuser');
      expect(user.organization_ids).toHaveLength(1);
    });
  });

  describe('CoderWorkspace', () => {
    it('should have required workspace fields', () => {
      const workspace: CoderWorkspace = {
        id: 'ws-123',
        name: 'test-workspace',
        owner_name: 'testuser',
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

      expect(workspace.id).toBe('ws-123');
      expect(workspace.latest_build.status).toBe('running');
    });

    it('should support optional fields', () => {
      const workspace: CoderWorkspace = {
        id: 'ws-123',
        name: 'test-workspace',
        owner_name: 'testuser',
        owner_id: 'user-123',
        template_id: 'tmpl-123',
        template_name: 'docker',
        template_display_name: 'Docker Workspace',
        template_icon: '/icons/docker.svg',
        created_at: '2024-01-01T00:00:00Z',
        last_used_at: '2024-01-02T00:00:00Z',
        organization_id: 'org-1',
        automatic_updates: 'always',
        outdated: true,
        dormant_at: '2024-01-03T00:00:00Z',
        ttl_ms: 86400000,
        latest_build: {
          id: 'build-123',
          build_number: 2,
          transition: 'start',
          status: 'running',
          job_id: 'job-123',
          template_version_id: 'ver-123',
          resources: [],
          created_at: '2024-01-01T00:00:00Z',
          updated_at: '2024-01-01T00:00:00Z',
          deadline: '2024-01-01T12:00:00Z',
        },
      };

      expect(workspace.template_display_name).toBe('Docker Workspace');
      expect(workspace.ttl_ms).toBe(86400000);
      expect(workspace.latest_build.deadline).toBeDefined();
    });
  });

  describe('CoderResource', () => {
    it('should have resource fields with optional agents', () => {
      const resource: CoderResource = {
        id: 'res-123',
        name: 'main',
        type: 'docker_container',
        agents: [
          {
            id: 'agent-123',
            name: 'main',
            status: 'connected',
            architecture: 'amd64',
            operating_system: 'linux',
            apps: [
              {
                slug: 'code-server',
                display_name: 'VS Code',
                url: 'https://example.com/vscode',
                health: 'healthy',
              },
            ],
          },
        ],
        metadata: [
          { key: 'repository', value: 'owner/repo' },
          { key: 'cpu', value: '2' },
        ],
      };

      expect(resource.agents).toHaveLength(1);
      expect(resource.agents![0].apps).toHaveLength(1);
      expect(resource.metadata).toHaveLength(2);
    });
  });

  describe('CoderBuildStatus', () => {
    it('should include all valid status values', () => {
      const statuses: CoderBuildStatus[] = [
        'pending',
        'starting',
        'running',
        'stopping',
        'stopped',
        'failed',
        'canceling',
        'canceled',
        'deleting',
        'deleted',
      ];

      expect(statuses).toHaveLength(10);
    });
  });

  describe('CoderAgentStatus', () => {
    it('should include all valid agent status values', () => {
      const statuses: CoderAgentStatus[] = [
        'connecting',
        'connected',
        'disconnected',
        'timeout',
      ];

      expect(statuses).toHaveLength(4);
    });
  });

  describe('CoderTemplate', () => {
    it('should have required template fields', () => {
      const template: CoderTemplate = {
        id: 'tmpl-123',
        name: 'docker',
        active_version_id: 'ver-123',
        organization_id: 'org-1',
        created_at: '2024-01-01T00:00:00Z',
        updated_at: '2024-01-01T00:00:00Z',
      };

      expect(template.name).toBe('docker');
      expect(template.active_version_id).toBeDefined();
    });
  });

  describe('Request Types', () => {
    it('should have CreateWorkspaceRequest fields', () => {
      const request: CreateWorkspaceRequest = {
        name: 'my-workspace',
        template_id: 'tmpl-123',
        rich_parameter_values: [
          { name: 'repository', value: 'owner/repo' },
          { name: 'cpu', value: '4' },
        ],
        ttl_ms: 86400000,
      };

      expect(request.name).toBe('my-workspace');
      expect(request.rich_parameter_values).toHaveLength(2);
    });

    it('should have CreateWorkspaceBuildRequest fields', () => {
      const startRequest: CreateWorkspaceBuildRequest = {
        transition: 'start',
      };

      const stopRequest: CreateWorkspaceBuildRequest = {
        transition: 'stop',
      };

      const deleteRequest: CreateWorkspaceBuildRequest = {
        transition: 'delete',
        orphan: false,
      };

      expect(startRequest.transition).toBe('start');
      expect(stopRequest.transition).toBe('stop');
      expect(deleteRequest.orphan).toBe(false);
    });

    it('should have ExtendWorkspaceRequest fields', () => {
      const request: ExtendWorkspaceRequest = {
        deadline: '2024-01-02T00:00:00Z',
      };

      expect(request.deadline).toBeDefined();
    });
  });

  describe('Response Types', () => {
    it('should have ListWorkspacesResponse fields', () => {
      const response: ListWorkspacesResponse = {
        workspaces: [],
        count: 0,
      };

      expect(response.workspaces).toEqual([]);
      expect(response.count).toBe(0);
    });
  });

  describe('Error Types', () => {
    it('should have CoderAPIErrorResponse fields', () => {
      const error: CoderAPIErrorResponse = {
        message: 'Workspace not found',
        detail: 'No workspace with ID ws-123 exists',
        validations: [
          { field: 'workspace_id', error: 'must be a valid UUID' },
        ],
      };

      expect(error.message).toBe('Workspace not found');
      expect(error.validations).toHaveLength(1);
    });
  });

  describe('RichParameterValue', () => {
    it('should have name and value fields', () => {
      const param: RichParameterValue = {
        name: 'cpu',
        value: '4',
      };

      expect(param.name).toBe('cpu');
      expect(param.value).toBe('4');
    });
  });
});
