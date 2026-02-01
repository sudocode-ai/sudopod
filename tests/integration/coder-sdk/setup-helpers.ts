/**
 * Shared helpers for Coder integration test setup files.
 */

import { execSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';

export const CODER_INFRA_DIR = resolve(import.meta.dirname, '../../../refs/coder-infra');

export function hasCoderInfra(): boolean {
  return existsSync(resolve(CODER_INFRA_DIR, 'docker-compose.self-hosted.yml'));
}

export async function isReachable(baseUrl: string): Promise<boolean> {
  try {
    const res = await fetch(`${baseUrl}/api/v2/buildinfo`, {
      signal: AbortSignal.timeout(3000),
    });
    return res.ok;
  } catch {
    return false;
  }
}

export function runScript(script: string, label: string): void {
  console.log(`[setup] ${label}: not running, provisioning...`);
  execSync(`bash "${script}"`, {
    stdio: 'inherit',
    timeout: 300_000,
    cwd: CODER_INFRA_DIR,
  });
}

export async function loginAndCreateToken(baseUrl: string, email: string, password: string): Promise<string> {
  const loginRes = await fetch(`${baseUrl}/api/v2/users/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });
  if (!loginRes.ok) throw new Error(`Login failed (${loginRes.status}): ${await loginRes.text()}`);
  const { session_token } = (await loginRes.json()) as { session_token: string };

  const tokenRes = await fetch(`${baseUrl}/api/v2/users/me/keys/tokens`, {
    method: 'POST',
    headers: {
      'Coder-Session-Token': session_token,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      lifetime: 86400000000000,
      token_name: `sdk-integration-${Date.now()}`,
    }),
  });
  if (!tokenRes.ok) throw new Error(`Token creation failed (${tokenRes.status}): ${await tokenRes.text()}`);
  return ((await tokenRes.json()) as { key: string }).key;
}
