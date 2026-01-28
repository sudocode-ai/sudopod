/**
 * Coder API Client Integration Tests
 *
 * Tests the CoderApiClient against a real Coder instance.
 * Requires CODER_URL and CODER_TOKEN environment variables.
 *
 * @see tests/integration/provider/coder/README.md for setup instructions
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { CoderApiClient, CoderApiError } from '../../../../src/provider/providers/coder/api.js';
import type { CoderWorkspace } from '../../../../src/provider/providers/coder/types.js';

// Skip if no Coder credentials
const CODER_URL = process.env.CODER_URL;
const CODER_TOKEN = process.env.CODER_TOKEN;

const skipReason = !CODER_URL || !CODER_TOKEN
  ? 'CODER_URL and CODER_TOKEN must be set'
  : undefined;

describe.skipIf(skipReason)('CoderApiClient Integration', () => {
  let client: CoderApiClient;
  let testWorkspace: CoderWorkspace | undefined;
  const testWorkspaceName = `test-${Date.now()}`;

  beforeAll(() => {
    client = new CoderApiClient(CODER_URL!, CODER_TOKEN!);
  });

  afterAll(async () => {
    // Cleanup: delete test workspace if created
    if (testWorkspace) {
      try {
        await client.deleteWorkspace(testWorkspace.id);
        // Wait for deletion to complete
        await new Promise((resolve) => setTimeout(resolve, 2000));
      } catch (error) {
        console.warn('Failed to cleanup test workspace:', error);
      }
    }
  });

  describe('User Operations', () => {
    it('should get current user (getMe)', async () => {
      const user = await client.getMe();

      expect(user).toBeDefined();
      expect(user.id).toBeDefined();
      expect(user.username).toBeDefined();
      expect(user.email).toBeDefined();
      expect(user.organization_ids).toBeInstanceOf(Array);
      expect(user.organization_ids.length).toBeGreaterThan(0);
    });
  });

  describe('Template Operations', () => {
    it('should get template by name', async () => {
      const user = await client.getMe();
      const orgId = user.organization_ids[0];

      // Assumes 'local-docker' template exists from coder-infra setup
      const template = await client.getTemplate(orgId, 'local-docker');

      expect(template).toBeDefined();
      expect(template.id).toBeDefined();
      expect(template.name).toBe('local-docker');
      expect(template.active_version_id).toBeDefined();
    });

    it('should get template version', async () => {
      const user = await client.getMe();
      const orgId = user.organization_ids[0];
      const template = await client.getTemplate(orgId, 'local-docker');

      const version = await client.getTemplateVersion(template.active_version_id);

      expect(version).toBeDefined();
      expect(version.id).toBe(template.active_version_id);
      expect(version.template_id).toBe(template.id);
    });
  });

  describe('Workspace Operations', () => {
    it('should create a workspace', async () => {
      const user = await client.getMe();
      const orgId = user.organization_ids[0];
      const template = await client.getTemplate(orgId, 'local-docker');

      testWorkspace = await client.createWorkspace(orgId, user.username, {
        name: testWorkspaceName,
        template_id: template.id,
        rich_parameter_values: [
          { name: 'repository', value: 'coder/coder' },
        ],
      });

      expect(testWorkspace).toBeDefined();
      expect(testWorkspace.name).toBe(testWorkspaceName);
      expect(testWorkspace.owner_name).toBe(user.username);
      expect(testWorkspace.template_id).toBe(template.id);
    }, 60000); // Allow 60 seconds for workspace creation

    it('should get workspace by ID', async () => {
      expect(testWorkspace).toBeDefined();

      const workspace = await client.getWorkspace(testWorkspace!.id);

      expect(workspace).toBeDefined();
      expect(workspace.id).toBe(testWorkspace!.id);
      expect(workspace.name).toBe(testWorkspaceName);
    });

    it('should list workspaces', async () => {
      const workspaces = await client.listWorkspaces('owner:me', 10);

      expect(workspaces).toBeInstanceOf(Array);
      // Should include our test workspace
      const found = workspaces.find((w) => w.name === testWorkspaceName);
      expect(found).toBeDefined();
    });

    it('should wait for workspace to be running', async () => {
      expect(testWorkspace).toBeDefined();

      const workspace = await client.waitForStatus(
        testWorkspace!.id,
        'running',
        120000 // 2 minutes timeout
      );

      expect(workspace.latest_build.status).toBe('running');
    }, 130000);

    it('should stop workspace', async () => {
      expect(testWorkspace).toBeDefined();

      await client.stopWorkspace(testWorkspace!.id);

      const workspace = await client.waitForStatus(
        testWorkspace!.id,
        'stopped',
        120000
      );

      expect(workspace.latest_build.status).toBe('stopped');
    }, 130000);

    it('should start workspace', async () => {
      expect(testWorkspace).toBeDefined();

      await client.startWorkspace(testWorkspace!.id);

      const workspace = await client.waitForStatus(
        testWorkspace!.id,
        'running',
        120000
      );

      expect(workspace.latest_build.status).toBe('running');
    }, 130000);
  });

  describe('Error Handling', () => {
    it('should throw CoderApiError on 404 (valid UUID that does not exist)', async () => {
      // Use a valid UUID format that doesn't exist
      const nonExistentId = '00000000-0000-0000-0000-000000000000';

      await expect(client.getWorkspace(nonExistentId)).rejects.toThrow(
        CoderApiError
      );

      try {
        await client.getWorkspace(nonExistentId);
      } catch (error) {
        expect(error).toBeInstanceOf(CoderApiError);
        expect((error as CoderApiError).isNotFound()).toBe(true);
      }
    });

    it('should throw CoderApiError on invalid token', async () => {
      const badClient = new CoderApiClient(CODER_URL!, 'invalid-token');

      await expect(badClient.getMe()).rejects.toThrow(CoderApiError);

      try {
        await badClient.getMe();
      } catch (error) {
        expect(error).toBeInstanceOf(CoderApiError);
        expect((error as CoderApiError).isUnauthorized()).toBe(true);
      }
    });
  });
});
