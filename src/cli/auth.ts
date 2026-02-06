import { execSync } from 'node:child_process';
import type { CodespacesConfig, CoderConfig, HubConfig } from '../provider/types.js';

export interface ResolveOptions {
  provider: string;
  token?: string;
}

/**
 * Resolve provider config from CLI flags, env vars, and system tools.
 *
 * Codespaces token resolution order:
 *   1. --token flag
 *   2. SUDOPOD_TOKEN env var
 *   3. GH_TOKEN env var
 *   4. `gh auth token` subprocess
 *
 * Coder: SUDOPOD_CODER_URL + SUDOPOD_CODER_TOKEN
 * Hub:   SUDOPOD_HUB_URL + SUDOPOD_HUB_TOKEN
 */
export async function resolveProviderConfig(
  options: ResolveOptions
): Promise<CodespacesConfig | CoderConfig | HubConfig> {
  switch (options.provider) {
    case 'codespaces':
      return resolveCodespacesConfig(options.token);
    case 'coder':
      return resolveCoderConfig();
    case 'hub':
      return resolveHubConfig();
    default:
      throw new Error(`Unknown provider: ${options.provider}`);
  }
}

function resolveCodespacesConfig(tokenFlag?: string): CodespacesConfig {
  const token =
    tokenFlag ??
    process.env.SUDOPOD_TOKEN ??
    process.env.GH_TOKEN ??
    detectGhToken();

  if (!token) {
    throw new Error(
      'No GitHub token found. Run `gh auth login` or set SUDOPOD_TOKEN / GH_TOKEN.'
    );
  }

  return { authToken: token };
}

function detectGhToken(): string | undefined {
  try {
    return execSync('gh auth token', { encoding: 'utf-8' }).trim() || undefined;
  } catch {
    return undefined;
  }
}

function resolveCoderConfig(): CoderConfig {
  const url = process.env.SUDOPOD_CODER_URL;
  const token = process.env.SUDOPOD_CODER_TOKEN;

  if (!url || !token) {
    throw new Error(
      'Coder provider requires SUDOPOD_CODER_URL and SUDOPOD_CODER_TOKEN environment variables.'
    );
  }

  return { url, authToken: token };
}

function resolveHubConfig(): HubConfig {
  const url = process.env.SUDOPOD_HUB_URL;
  const token = process.env.SUDOPOD_HUB_TOKEN;

  if (!url || !token) {
    throw new Error(
      'Hub provider requires SUDOPOD_HUB_URL and SUDOPOD_HUB_TOKEN environment variables.'
    );
  }

  return { url, authToken: token };
}
