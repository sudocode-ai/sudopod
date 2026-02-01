/**
 * Vitest setup file for self-hosted Coder integration tests (port 7080).
 *
 * Provisions the self-hosted Docker stack if not already running,
 * then sets CODER_URL and CODER_TOKEN env vars.
 */

import { resolve } from 'node:path';
import {
  CODER_INFRA_DIR,
  hasCoderInfra,
  runScript,
  loginAndCreateToken,
} from './setup-helpers.js';

const SELF_HOSTED_SETUP = resolve(CODER_INFRA_DIR, 'scripts/self-hosted-testing-setup.sh');
const SELF_HOSTED_URL = 'http://localhost:7080';
const SELF_HOSTED_EMAIL = 'ssh.fake1@gmail.com';
const SELF_HOSTED_PASSWORD = 'ABC151qwe!@';

if (!hasCoderInfra()) {
  console.warn(
    '[setup] refs/coder-infra not found — self-hosted tests will be skipped.\n' +
    '  To fix: git submodule update --init refs/coder-infra',
  );
} else if (process.env.CODER_URL && process.env.CODER_TOKEN) {
  console.log(`[setup] Self-hosted: using existing env (${process.env.CODER_URL})`);
} else {
  try {
    runScript(SELF_HOSTED_SETUP, 'Self-hosted');

    const token = await loginAndCreateToken(SELF_HOSTED_URL, SELF_HOSTED_EMAIL, SELF_HOSTED_PASSWORD);
    process.env.CODER_URL = SELF_HOSTED_URL;
    process.env.CODER_TOKEN = token;
    console.log('[setup] Self-hosted: ready');
  } catch (error) {
    console.warn(`[setup] Self-hosted: failed — ${(error as Error).message}`);
    console.warn('[setup] Self-hosted tests will be skipped');
  }
}
