/**
 * CoderClient Error Handling — Integration Tests
 *
 * Tests that CoderApiError surfaces correctly for real API failures:
 * invalid token, non-existent resources, duplicate names.
 *
 * Requires CODER_URL and CODER_TOKEN env vars (Flow 1).
 *
 * @see s-7rdw - Coder Local Development (Flow 1)
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { CoderClient } from '../../../src/coder-sdk/client.js';
import { CoderApiError } from '../../../src/coder-sdk/errors.js';
import type { CoderWorkspace } from '../../../src/coder-sdk/types.js';
import {
  getCoderSelfHostedEnv,
  createTestClient,
  generateTestWorkspaceName,
  safeDeleteWorkspace,
} from './helpers.js';

const result = getCoderSelfHostedEnv();
const skipReason = result.skipReason;

describe.skipIf(skipReason)('CoderClient Error Handling (integration)', () => {
  let client: CoderClient;
  let orgId: string;
  let templateId: string;

  // Workspace created for the duplicate-name test
  let conflictWorkspace: CoderWorkspace | undefined;
  const conflictName = generateTestWorkspaceName('err-test');

  beforeAll(async () => {
    client = createTestClient(result.env!);
    const user = await client.getCurrentUser();
    orgId = user.organization_ids[0];

    const template = await client.getTemplateByName(orgId, 'default');
    templateId = template.id;
  });

  afterAll(async () => {
    if (conflictWorkspace) {
      await safeDeleteWorkspace(client, conflictWorkspace.id);
    }
  });

  it('invalid token → isUnauthorized', async () => {
    const badClient = new CoderClient({
      baseUrl: result.env!.url,
      token: 'invalid-token-abc123',
    });

    try {
      await badClient.getCurrentUser();
      expect.fail('Expected CoderApiError to be thrown');
    } catch (error) {
      expect(error).toBeInstanceOf(CoderApiError);
      expect((error as CoderApiError).isUnauthorized).toBe(true);
      expect((error as CoderApiError).status).toBe(401);
    }
  });

  it('non-existent workspace → isNotFound', async () => {
    const fakeId = '00000000-0000-0000-0000-000000000000';

    try {
      await client.getWorkspace(fakeId);
      expect.fail('Expected CoderApiError to be thrown');
    } catch (error) {
      expect(error).toBeInstanceOf(CoderApiError);
      expect((error as CoderApiError).isNotFound).toBe(true);
      expect((error as CoderApiError).status).toBe(404);
    }
  });

  it('duplicate workspace name → isConflict', async () => {
    // First, create a workspace
    conflictWorkspace = await client.createWorkspace({
      organizationId: orgId,
      username: 'me',
      name: conflictName,
      templateId,
      richParameterValues: [
        { name: 'repository', value: 'coder/coder' },
      ],
    });

    // Now try to create another with the same name
    try {
      await client.createWorkspace({
        organizationId: orgId,
        username: 'me',
        name: conflictName,
        templateId,
        richParameterValues: [
          { name: 'repository', value: 'coder/coder' },
        ],
      });
      expect.fail('Expected CoderApiError to be thrown');
    } catch (error) {
      expect(error).toBeInstanceOf(CoderApiError);
      expect((error as CoderApiError).isConflict).toBe(true);
      expect((error as CoderApiError).status).toBe(409);
    }
  }, 60_000);
});
