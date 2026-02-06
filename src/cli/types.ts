import type { Provider } from '../provider/types.js';

export interface CommandContext {
  provider: Provider;
  jsonOutput: boolean;
}
