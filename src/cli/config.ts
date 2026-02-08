import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';

export interface ProviderAuthConfig {
  url: string;
  token: string;
}

export interface TailscaleConfig {
  /** Headscale control server URL */
  controlServer: string;
  /** Headscale admin API key for generating preauthkeys */
  apiKey: string;
  /** Directory for persisting local Tailscale daemon state */
  stateDir?: string;
}

export interface SudopodConfig {
  defaultProvider?: string;
  coder?: ProviderAuthConfig;
  hub?: ProviderAuthConfig;
  tailscale?: TailscaleConfig;
}

export function getConfigPath(): string {
  return join(homedir(), '.config', 'sudopod', 'config.json');
}

export function loadConfig(): SudopodConfig {
  try {
    const raw = readFileSync(getConfigPath(), 'utf-8');
    return JSON.parse(raw) as SudopodConfig;
  } catch {
    return {};
  }
}

export function saveConfig(config: SudopodConfig): void {
  const configPath = getConfigPath();
  mkdirSync(join(configPath, '..'), { recursive: true });
  writeFileSync(configPath, JSON.stringify(config, null, 2) + '\n');
}
