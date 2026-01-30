/**
 * CoderClient Template Operations — Integration Tests
 *
 * Tests listTemplates, getTemplateByName, and getTemplateVersion against
 * a real self-hosted Coder instance. Assumes the `default` template has
 * been pushed via setup-self-hosted.sh.
 *
 * @see s-7rdw - Coder Local Development (Flow 1)
 */

import { describe, it, expect, beforeAll } from 'vitest';
import { CoderClient } from '../../../src/coder-sdk/client.js';
import { CoderApiError } from '../../../src/coder-sdk/errors.js';
import { getCoderSelfHostedEnv, createTestClient } from './helpers.js';

const result = getCoderSelfHostedEnv();
const skipReason = result.skipReason;

describe.skipIf(skipReason)('CoderClient Template Operations (integration)', () => {
  let client: CoderClient;
  let orgId: string;

  beforeAll(async () => {
    client = createTestClient(result.env!);
    const user = await client.getCurrentUser();
    orgId = user.organization_ids[0];
  });

  it('listTemplates() returns templates including "default"', async () => {
    const templates = await client.listTemplates(orgId);

    expect(templates).toBeInstanceOf(Array);
    expect(templates.length).toBeGreaterThan(0);

    const defaultTemplate = templates.find((t) => t.name === 'default');
    expect(defaultTemplate).toBeDefined();
    expect(defaultTemplate!.id).toBeDefined();
  });

  it('getTemplateByName() returns template with valid id and active_version_id', async () => {
    const template = await client.getTemplateByName(orgId, 'default');

    expect(template).toBeDefined();
    expect(template.id).toBeDefined();
    expect(template.name).toBe('default');
    expect(template.active_version_id).toBeDefined();
    expect(template.organization_id).toBe(orgId);
  });

  it('getTemplateVersion() returns version details', async () => {
    const template = await client.getTemplateByName(orgId, 'default');
    const version = await client.getTemplateVersion(template.active_version_id);

    expect(version).toBeDefined();
    expect(version.id).toBe(template.active_version_id);
    expect(version.template_id).toBe(template.id);
  });

  it('getTemplateByName() throws CoderApiError with isNotFound for nonexistent template', async () => {
    try {
      await client.getTemplateByName(orgId, 'nonexistent-template-xyz');
      expect.fail('Expected CoderApiError to be thrown');
    } catch (error) {
      expect(error).toBeInstanceOf(CoderApiError);
      expect((error as CoderApiError).isNotFound).toBe(true);
    }
  });
});
