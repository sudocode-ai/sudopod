/**
 * Vitest setup file for Hub provider E2E tests.
 *
 * Loads .env.coder-staging to get CODER_URL and CODER_TOKEN,
 * which the mock hub server uses to delegate to CoderOrchestrator.
 */

import { resolve, dirname } from 'node:path';
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const envFile = resolve(__dirname, '../../../../.env.coder-staging');

if (existsSync(envFile)) {
  for (const line of readFileSync(envFile, 'utf-8').split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    const val = trimmed.slice(eq + 1).trim();
    if (!process.env[key]) process.env[key] = val;
  }
  console.log(`[setup] Hub E2E: loaded ${envFile}`);
} else {
  console.warn(`[setup] Hub E2E: ${envFile} not found — tests will be skipped`);
}
