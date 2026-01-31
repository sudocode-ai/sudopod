/**
 * CoderClient Hub User Operations — Integration Tests
 *
 * Tests headless user creation and management via admin token.
 * This is the core hub flow: admin creates users with login_type "none"
 * who are managed entirely through the API.
 *
 * Requires CODER_HUB_URL and CODER_HUB_TOKEN env vars (Flow 2).
 *
 * @see s-7rdw - Coder Local Development (Flow 2)
 */

import { describe, it, expect, beforeAll } from 'vitest';
import { CoderClient } from '../../../src/coder-sdk/client.js';
import { CoderApiError } from '../../../src/coder-sdk/errors.js';
import { getCoderHubEnv, createTestClient } from './helpers.js';

const result = getCoderHubEnv();
const skipReason = result.skipReason;

describe.skipIf(skipReason)('CoderClient Hub User Operations (integration)', () => {
  let client: CoderClient;
  let orgId: string;
  const testSuffix = Date.now();

  beforeAll(async () => {
    client = createTestClient(result.env!);
    const admin = await client.getCurrentUser();
    orgId = admin.organization_ids[0];
  });

  it('getCurrentUser() returns the admin user', async () => {
    const user = await client.getCurrentUser();

    expect(user).toBeDefined();
    expect(user.id).toBeDefined();
    expect(user.email).toBeDefined();
    expect(user.status).toBe('active');
    expect(user.organization_ids.length).toBeGreaterThan(0);
  });

  it('createUser() creates a headless user with login_type "none"', async () => {
    const user = await client.createUser({
      email: `headless-${testSuffix}@test.local`,
      username: `headless-${testSuffix}`,
      name: 'Test Headless User',
      loginType: 'none',
      organizationIds: [orgId],
    });

    expect(user).toBeDefined();
    expect(user.id).toBeDefined();
    expect(user.username).toBe(`headless-${testSuffix}`);
    expect(user.email).toBe(`headless-${testSuffix}@test.local`);
    expect(user.login_type).toBe('none');
  });

  it('getUser() retrieves the headless user by username', async () => {
    const user = await client.getUser(`headless-${testSuffix}`);

    expect(user).toBeDefined();
    expect(user.username).toBe(`headless-${testSuffix}`);
    expect(user.login_type).toBe('none');
  });

  it('listUsers() includes the headless user', async () => {
    const response = await client.listUsers();

    const found = response.users.find((u) => u.username === `headless-${testSuffix}`);
    expect(found).toBeDefined();
    expect(found!.login_type).toBe('none');
  });

  it('createUser() with duplicate username throws conflict error', async () => {
    try {
      await client.createUser({
        email: `headless-dup-${testSuffix}@test.local`,
        username: `headless-${testSuffix}`,
        loginType: 'none',
        organizationIds: [orgId],
      });
      expect.fail('Expected CoderApiError to be thrown');
    } catch (error) {
      expect(error).toBeInstanceOf(CoderApiError);
      expect((error as CoderApiError).isConflict).toBe(true);
    }
  });

  it('createUser() with duplicate email throws conflict error', async () => {
    try {
      await client.createUser({
        email: `headless-${testSuffix}@test.local`,
        username: `headless-dup-${testSuffix}`,
        loginType: 'none',
        organizationIds: [orgId],
      });
      expect.fail('Expected CoderApiError to be thrown');
    } catch (error) {
      expect(error).toBeInstanceOf(CoderApiError);
      expect((error as CoderApiError).isConflict).toBe(true);
    }
  });
});
