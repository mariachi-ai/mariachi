import { createAnthropic } from '@ai-sdk/anthropic';
import { AISdkAdapter } from './ai-sdk';

export interface AnthropicAdapterConfig {
  apiKey?: string;
  defaultModel?: string;
}

/** Claude models through `@ai-sdk/anthropic` (an optional peer dependency). Import from `@mariachi/ai/anthropic`. */
export class AnthropicAdapter extends AISdkAdapter {
  constructor(config: AnthropicAdapterConfig = {}) {
    const provider = createAnthropic({ apiKey: config.apiKey });
    super('anthropic', (modelId) => provider(modelId), config.defaultModel ?? 'claude-sonnet-5');
  }
}
