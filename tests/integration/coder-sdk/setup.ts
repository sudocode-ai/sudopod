/**
 * Vitest setup file for Coder SDK integration tests.
 *
 * Runs before any test files (via vitest setupFiles). If a local Coder
 * instance is running on port 7080, this will programmatically log in
 * using the hardcoded dev credentials from refs/coder-infra and set
 * CODER_URL + CODER_TOKEN so tests don't require manual env var setup.
 *
 * Credential priority:
 *   1. Existing CODER_URL + CODER_TOKEN env vars (manual / CI override)
 *   2. Auto-detect running Coder at localhost:7080 and log in
 *
 * @see refs/coder-infra/scripts/setup-self-hosted.sh — hardcoded credentials
 */

const CODER_DEFAULT_URL = 'http://localhost:7080';
const CODER_ADMIN_EMAIL = 'ssh.fake1@gmail.com';
const CODER_ADMIN_PASSWORD = 'ABC151qwe!@';

async function isCoderReachable(baseUrl: string): Promise<boolean> {
  try {
    const response = await fetch(`${baseUrl}/api/v2/buildinfo`, {
      signal: AbortSignal.timeout(3000),
    });
    return response.ok;
  } catch {
    return false;
  }
}

async function login(baseUrl: string, email: string, password: string): Promise<string> {
  const response = await fetch(`${baseUrl}/api/v2/users/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Login failed (${response.status}): ${text}`);
  }

  const data = (await response.json()) as { session_token: string };
  return data.session_token;
}

async function createApiToken(baseUrl: string, sessionToken: string): Promise<string> {
  const response = await fetch(`${baseUrl}/api/v2/users/me/keys/tokens`, {
    method: 'POST',
    headers: {
      'Coder-Session-Token': sessionToken,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      lifetime: 86400000000000, // 24 hours in nanoseconds
      token_name: `sdk-integration-${Date.now()}`,
    }),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Token creation failed (${response.status}): ${text}`);
  }

  const data = (await response.json()) as { key: string };
  return data.key;
}

// Self-executing setup — runs when vitest loads this setupFile
if (!process.env.CODER_URL || !process.env.CODER_TOKEN) {
  const isRunning = await isCoderReachable(CODER_DEFAULT_URL);

  if (isRunning) {
    console.log('[coder-sdk setup] Coder detected at', CODER_DEFAULT_URL, '— logging in...');
    try {
      const sessionToken = await login(CODER_DEFAULT_URL, CODER_ADMIN_EMAIL, CODER_ADMIN_PASSWORD);
      const apiToken = await createApiToken(CODER_DEFAULT_URL, sessionToken);

      process.env.CODER_URL = CODER_DEFAULT_URL;
      process.env.CODER_TOKEN = apiToken;
      console.log('[coder-sdk setup] Authenticated — CODER_URL and CODER_TOKEN set');
    } catch (error) {
      console.warn('[coder-sdk setup] Failed to obtain token:', error);
      console.warn('[coder-sdk setup] Tests will skip. Ensure Coder is set up:');
      console.warn('  cd refs/coder-infra && ./scripts/setup-self-hosted.sh');
    }
  } else {
    console.log('[coder-sdk setup] Coder not running at', CODER_DEFAULT_URL, '— tests will skip');
  }
} else {
  console.log(`[coder-sdk setup] Using existing env: CODER_URL=${process.env.CODER_URL}`);
}
