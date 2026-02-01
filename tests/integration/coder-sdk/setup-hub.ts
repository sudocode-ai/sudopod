/**
 * Vitest setup file for hub Coder integration tests (port 7081).
 *
 * Provisions the hub Docker stack if not already running,
 * then sets CODER_HUB_URL and CODER_HUB_TOKEN env vars.
 */

import { execSync } from 'node:child_process';
import { resolve } from 'node:path';
import {
  CODER_INFRA_DIR,
  hasCoderInfra,
  runScript,
} from './setup-helpers.js';

const HUB_SETUP = resolve(CODER_INFRA_DIR, 'scripts/hub-testing-setup.sh');
const HUB_URL = 'http://localhost:7081';
const HUB_CREDENTIALS_VOLUME = 'coder-hub_hub-coder-credentials';

function readHubToken(): string | null {
  try {
    const output = execSync(
      `docker run --rm -v ${HUB_CREDENTIALS_VOLUME}:/creds:ro alpine cat /creds/admin-token`,
      { encoding: 'utf-8', timeout: 10_000 },
    );
    return output.trim() || null;
  } catch {
    return null;
  }
}

if (!hasCoderInfra()) {
  console.warn(
    '[setup] refs/coder-infra not found — hub tests will be skipped.\n' +
    '  To fix: git submodule update --init refs/coder-infra',
  );
} else if (process.env.CODER_HUB_URL && process.env.CODER_HUB_TOKEN) {
  console.log(`[setup] Hub: using existing env (${process.env.CODER_HUB_URL})`);
} else {
  try {
    runScript(HUB_SETUP, 'Hub');

    const hubToken = readHubToken();
    if (!hubToken) throw new Error('Could not read admin token from credentials volume');

    process.env.CODER_HUB_URL = HUB_URL;
    process.env.CODER_HUB_TOKEN = hubToken;
    console.log('[setup] Hub: ready');
  } catch (error) {
    console.warn(`[setup] Hub: failed — ${(error as Error).message}`);
    console.warn('[setup] Hub tests will be skipped');
  }
}
