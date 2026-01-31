/**
 * CoderClient template operations tests (i-5wwl)
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { CoderClient } from '../../../src/coder-sdk/client.js';

describe('CoderClient template operations', () => {
  const mockFetch = vi.fn();
  let client: CoderClient;

  beforeEach(() => {
    vi.stubGlobal('fetch', mockFetch);
    client = new CoderClient({
      baseUrl: 'https://coder.example.com',
      token: 'test-token',
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('getTemplateByName', () => {
    it('constructs URL with organizationId and templateName', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        status: 200,
        json: () => Promise.resolve({ id: 'tmpl-1', name: 'docker' }),
      });

      await client.getTemplateByName('org-abc', 'docker');

      const [url, init] = mockFetch.mock.calls[0];
      expect(url).toBe('https://coder.example.com/api/v2/organizations/org-abc/templates/docker');
      expect(init.method).toBe('GET');
    });
  });

  describe('listTemplates', () => {
    it('constructs URL with organizationId', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        status: 200,
        json: () => Promise.resolve([{ id: 'tmpl-1', name: 'docker' }]),
      });

      const result = await client.listTemplates('org-abc');

      const [url] = mockFetch.mock.calls[0];
      expect(url).toBe('https://coder.example.com/api/v2/organizations/org-abc/templates');
      expect(result).toEqual([{ id: 'tmpl-1', name: 'docker' }]);
    });
  });

  describe('getTemplateVersion', () => {
    it('constructs URL with templateVersionId', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        status: 200,
        json: () => Promise.resolve({ id: 'ver-1', name: 'v1.0' }),
      });

      await client.getTemplateVersion('ver-1');

      const [url] = mockFetch.mock.calls[0];
      expect(url).toBe('https://coder.example.com/api/v2/templateversions/ver-1');
    });
  });
});
