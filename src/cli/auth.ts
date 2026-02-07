import { execSync } from 'node:child_process';
import type { CodespacesConfig, CoderConfig, HubConfig } from '../provider/types.js';
import { loadConfig } from './config.js';

/**
 * Resolve provider config for instantiation.
 *
 * Codespaces: auto-detect via `gh auth token`. Requires GitHub CLI installed and authenticated.
 * Coder/Hub: read from stored config (~/.config/sudopod/config.json).
 */
export function resolveCodespacesConfig(): CodespacesConfig {
  const token = detectGhToken();

  if (!token) {
    throw new Error(
      'GitHub CLI not found or not authenticated.\n' +
      'Install: https://cli.github.com\n' +
      'Then run: gh auth login'
    );
  }

  return { authToken: token };
}

export function resolveCoderConfig(): CoderConfig {
  const config = loadConfig();
  if (!config.coder?.url || !config.coder?.token) {
    throw new Error(
      'Coder not configured. Run `sudopod coder config --url <url> --token <token>` first.'
    );
  }
  return { url: config.coder.url, authToken: config.coder.token };
}

export function resolveHubConfig(): HubConfig {
  const config = loadConfig();
  if (!config.hub?.url || !config.hub?.token) {
    throw new Error(
      'Hub not configured. Run `sudopod hub config --url <url> --token <token>` first.'
    );
  }
  return { url: config.hub.url, authToken: config.hub.token };
}

function detectGhToken(): string | undefined {
  try {
    return execSync('gh auth token', { encoding: 'utf-8' }).trim() || undefined;
  } catch {
    return undefined;
  }
}
