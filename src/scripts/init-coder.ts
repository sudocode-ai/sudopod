/**
 * Coder initialization script.
 *
 * Bootstraps a fresh Coder instance for the hub flow:
 * 1. Waits for Coder to be healthy
 * 2. Creates the first admin user (idempotent)
 * 3. Logs in and creates a long-lived API token
 * 4. Pushes a workspace template via Coder CLI
 * 5. Writes credentials to output directory
 *
 * Environment variables:
 * - CODER_URL: Coder server URL (required)
 * - CODER_ADMIN_EMAIL: Admin email (required)
 * - CODER_ADMIN_PASSWORD: Admin password (optional, auto-generated)
 * - CODER_TEMPLATE_DIR: Path to template directory (optional)
 * - CODER_TEMPLATE_NAME: Template name (optional, defaults to directory name)
 * - CODER_OUTPUT_DIR: Where to write credentials (default: /var/lib/sudopod)
 *
 * Output files (in CODER_OUTPUT_DIR):
 * - admin-token: The long-lived API token
 * - credentials.json: Full credentials JSON
 *
 * Used by:
 * - docker-compose.hub.yml (as coder-init container)
 * - Production deployment (as Kubernetes Job)
 *
 * @see s-7rdw - Coder Local Development (Flow 2)
 */

import { execSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { basename, join } from 'node:path';
import { randomBytes } from 'node:crypto';
import { CoderClient } from '../coder-sdk/client.js';

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

const CODER_URL = process.env.CODER_URL;
const ADMIN_EMAIL = process.env.CODER_ADMIN_EMAIL;
const ADMIN_PASSWORD = process.env.CODER_ADMIN_PASSWORD || randomBytes(32).toString('hex');
const TEMPLATE_DIR = process.env.CODER_TEMPLATE_DIR;
const TEMPLATE_NAME = process.env.CODER_TEMPLATE_NAME;
const OUTPUT_DIR = process.env.CODER_OUTPUT_DIR || '/var/lib/sudopod';

const ADMIN_USERNAME =
  ADMIN_EMAIL?.split('@')[0]?.replace(/[^a-z0-9-]/gi, '-').toLowerCase() || 'admin';

interface Credentials {
  adminToken: string;
  adminEmail: string;
  adminUsername: string;
  coderUrl: string;
  createdAt: string;
}

// ---------------------------------------------------------------------------
// Bootstrap helpers (raw fetch — used before we have a token)
// ---------------------------------------------------------------------------

async function waitForCoderReady(coderUrl: string, timeoutMs = 120_000): Promise<void> {
  const start = Date.now();
  console.log(`[init] Waiting for Coder at ${coderUrl}...`);

  while (Date.now() - start < timeoutMs) {
    try {
      const res = await fetch(`${coderUrl}/api/v2/buildinfo`, {
        signal: AbortSignal.timeout(5000),
      });
      if (res.ok) {
        const info = (await res.json()) as { version: string };
        console.log(`[init] Coder ready — version ${info.version}`);
        return;
      }
    } catch {
      // not ready yet
    }
    await sleep(2000);
  }

  throw new Error(`Coder did not become ready within ${timeoutMs}ms`);
}

/** Returns true if the first user has already been created. */
async function isFirstUserCreated(coderUrl: string): Promise<boolean> {
  try {
    const res = await fetch(`${coderUrl}/api/v2/users/first`);
    // 200 = first user NOT created yet; 405 = already created
    return res.status === 405;
  } catch {
    return false;
  }
}

async function createFirstUser(
  coderUrl: string,
  email: string,
  username: string,
  password: string,
): Promise<void> {
  console.log(`[init] Creating first user: ${email} (${username})`);

  const res = await fetch(`${coderUrl}/api/v2/users/first`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, username, password }),
  });

  if (!res.ok) {
    throw new Error(`Failed to create first user: ${await res.text()}`);
  }
  console.log('[init] First user created');
}

async function login(coderUrl: string, email: string, password: string): Promise<string> {
  console.log(`[init] Logging in as ${email}...`);

  const res = await fetch(`${coderUrl}/api/v2/users/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });

  if (!res.ok) {
    throw new Error(`Login failed: ${await res.text()}`);
  }

  const data = (await res.json()) as { session_token: string };
  console.log('[init] Login successful');
  return data.session_token;
}

async function createApiToken(coderUrl: string, sessionToken: string): Promise<string> {
  console.log('[init] Creating long-lived API token...');

  const res = await fetch(`${coderUrl}/api/v2/users/me/keys`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Coder-Session-Token': sessionToken,
    },
    body: JSON.stringify({
      lifetime: 0, // maximum (~100 years)
      name: `init-script-${Date.now()}`,
    }),
  });

  if (!res.ok) {
    throw new Error(`Token creation failed: ${await res.text()}`);
  }

  const data = (await res.json()) as { key: string };
  console.log('[init] API token created');
  return data.key;
}

// ---------------------------------------------------------------------------
// Template push (Coder CLI — no REST API equivalent)
// ---------------------------------------------------------------------------

function pushTemplate(
  coderUrl: string,
  sessionToken: string,
  templateDir: string,
  templateName?: string,
): void {
  const name = templateName || basename(templateDir);
  const versionName = `init-${Date.now()}`;

  console.log(`[init] Pushing template "${name}" from ${templateDir}`);

  if (!existsSync(templateDir)) {
    throw new Error(`Template directory not found: ${templateDir}`);
  }

  try {
    execSync('which coder', { stdio: 'pipe' });
  } catch {
    throw new Error('Coder CLI not found. Install: curl -fsSL https://coder.com/install.sh | sh');
  }

  execSync(
    `coder templates push "${name}" --directory "${templateDir}" --name "${versionName}" --yes`,
    {
      stdio: 'inherit',
      env: {
        ...process.env,
        CODER_URL: coderUrl,
        CODER_SESSION_TOKEN: sessionToken,
      },
    },
  );

  console.log(`[init] Template "${name}" pushed`);
}

// ---------------------------------------------------------------------------
// Credential management
// ---------------------------------------------------------------------------

function writeCredentials(outputDir: string, credentials: Credentials): void {
  console.log(`[init] Writing credentials to ${outputDir}`);

  if (!existsSync(outputDir)) {
    mkdirSync(outputDir, { recursive: true });
  }

  writeFileSync(join(outputDir, 'admin-token'), credentials.adminToken, { mode: 0o600 });
  writeFileSync(join(outputDir, 'credentials.json'), JSON.stringify(credentials, null, 2), {
    mode: 0o600,
  });

  console.log('[init] Credentials written');
}

async function checkExistingCredentials(
  coderUrl: string,
  outputDir: string,
): Promise<Credentials | null> {
  const credentialsPath = join(outputDir, 'credentials.json');

  if (!existsSync(credentialsPath)) return null;

  try {
    const credentials: Credentials = JSON.parse(readFileSync(credentialsPath, 'utf-8'));

    // Validate the token still works by making a simple API call
    const client = new CoderClient({ baseUrl: coderUrl, token: credentials.adminToken });
    await client.getCurrentUser();

    console.log('[init] Existing credentials are valid');
    return credentials;
  } catch {
    console.log('[init] Existing credentials invalid, will recreate');
    return null;
  }
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main(): Promise<void> {
  console.log('[init] Starting Coder initialization...');

  if (!CODER_URL) {
    console.error('Error: CODER_URL is required');
    process.exit(1);
  }
  if (!ADMIN_EMAIL) {
    console.error('Error: CODER_ADMIN_EMAIL is required');
    process.exit(1);
  }

  console.log(`[init] URL: ${CODER_URL}`);
  console.log(`[init] Admin: ${ADMIN_EMAIL}`);
  console.log(`[init] Output: ${OUTPUT_DIR}`);

  // Check for existing valid credentials
  const existing = await checkExistingCredentials(CODER_URL, OUTPUT_DIR);
  if (existing) {
    // Re-push template if requested (template may have changed)
    if (TEMPLATE_DIR) {
      const sessionToken = await login(CODER_URL, ADMIN_EMAIL, ADMIN_PASSWORD);
      pushTemplate(CODER_URL, sessionToken, TEMPLATE_DIR, TEMPLATE_NAME);
    }
    console.log('[init] Done (existing credentials reused)');
    return;
  }

  // Wait for Coder
  await waitForCoderReady(CODER_URL);

  // Create first user if needed
  const userExists = await isFirstUserCreated(CODER_URL);
  if (!userExists) {
    await createFirstUser(CODER_URL, ADMIN_EMAIL, ADMIN_USERNAME, ADMIN_PASSWORD);
  } else {
    console.log('[init] First user already exists');
  }

  // Login + create token
  const sessionToken = await login(CODER_URL, ADMIN_EMAIL, ADMIN_PASSWORD);
  const adminToken = await createApiToken(CODER_URL, sessionToken);

  // Push template
  if (TEMPLATE_DIR) {
    pushTemplate(CODER_URL, sessionToken, TEMPLATE_DIR, TEMPLATE_NAME);
  }

  // Verify token works using CoderClient
  const client = new CoderClient({ baseUrl: CODER_URL, token: adminToken });
  const me = await client.getCurrentUser();
  console.log(`[init] Token verified — logged in as ${me.username}`);

  // Write credentials
  const credentials: Credentials = {
    adminToken,
    adminEmail: ADMIN_EMAIL,
    adminUsername: ADMIN_USERNAME,
    coderUrl: CODER_URL,
    createdAt: new Date().toISOString(),
  };
  writeCredentials(OUTPUT_DIR, credentials);

  console.log('[init] Initialization complete!');
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

main().catch((error) => {
  console.error('[init] Fatal error:', error.message);
  process.exit(1);
});
