/**
 * CoderClient User Operations — Integration Tests
 *
 * Tests getCurrentUser, getUser, and listUsers against a real self-hosted Coder instance.
 * Requires CODER_URL and CODER_TOKEN env vars (Flow 1).
 *
 * @see s-7rdw - Coder Local Development (Flow 1)
 */

import { describe, it, expect, beforeAll } from 'vitest';
import { CoderClient } from '../../../src/coder-sdk/client.js';
import { getCoderSelfHostedEnv, createTestClient } from './helpers.js';

const result = getCoderSelfHostedEnv();
const skipReason = result.skipReason;

describe.skipIf(skipReason)('CoderClient User Operations (integration)', () => {
  let client: CoderClient;

  beforeAll(() => {
    client = createTestClient(result.env!);
  });

  it('getCurrentUser() returns a valid user with organization_ids', async () => {
    const user = await client.getCurrentUser();

    expect(user).toBeDefined();
    expect(user.id).toBeDefined();
    expect(user.username).toBeDefined();
    expect(user.email).toBeDefined();
    expect(user.organization_ids).toBeInstanceOf(Array);
    expect(user.organization_ids.length).toBeGreaterThan(0);
    expect(user.status).toBe('active');
  });

  it('getUser("me") returns the same user as getCurrentUser()', async () => {
    const currentUser = await client.getCurrentUser();
    const meUser = await client.getUser('me');

    expect(meUser.id).toBe(currentUser.id);
    expect(meUser.username).toBe(currentUser.username);
    expect(meUser.email).toBe(currentUser.email);
  });

  it('listUsers() returns at least the admin user', async () => {
    const response = await client.listUsers();

    expect(response.users).toBeInstanceOf(Array);
    expect(response.users.length).toBeGreaterThan(0);
    expect(response.count).toBeGreaterThan(0);

    const currentUser = await client.getCurrentUser();
    const found = response.users.find((u) => u.id === currentUser.id);
    expect(found).toBeDefined();
  });
});
