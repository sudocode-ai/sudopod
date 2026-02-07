import { loadConfig, saveConfig } from '../config.js';
import { printSuccess, printError, printJson } from '../output.js';

export interface ConfigCommandOptions {
  provider?: string;
}

export async function handleConfig(opts: ConfigCommandOptions, jsonOutput: boolean): Promise<void> {
  try {
    const config = loadConfig();

    if (opts.provider) {
      const valid = ['codespaces', 'coder', 'hub'];
      if (!valid.includes(opts.provider)) {
        throw new Error(`Invalid provider: "${opts.provider}". Must be one of: ${valid.join(', ')}`);
      }
      config.defaultProvider = opts.provider;
      saveConfig(config);

      if (jsonOutput) {
        printJson({ defaultProvider: opts.provider });
      } else {
        printSuccess(`Default provider set to "${opts.provider}".`);
      }
      return;
    }

    // No flags — show current config
    if (jsonOutput) {
      printJson(config);
    } else {
      console.log(`Default provider: ${config.defaultProvider ?? '(not set, defaults to codespaces)'}`);
      if (config.coder) {
        console.log(`Coder: ${config.coder.url}`);
      }
      if (config.hub) {
        console.log(`Hub: ${config.hub.url}`);
      }
    }
  } catch (err) {
    printError(err instanceof Error ? err.message : String(err));
    process.exit(1);
  }
}

export interface ProviderConfigCommandOptions {
  url: string;
  token: string;
}

export async function handleProviderConfig(
  provider: 'coder' | 'hub',
  opts: ProviderConfigCommandOptions,
  jsonOutput: boolean,
): Promise<void> {
  try {
    const config = loadConfig();
    config[provider] = { url: opts.url, token: opts.token };
    saveConfig(config);

    if (jsonOutput) {
      printJson({ provider, url: opts.url });
    } else {
      printSuccess(`${provider} configured: ${opts.url}`);
    }
  } catch (err) {
    printError(err instanceof Error ? err.message : String(err));
    process.exit(1);
  }
}
