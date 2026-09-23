import { createOpenAI } from '@ai-sdk/openai';
import { AISdkAdapter } from './ai-sdk';

export interface OpenAIAdapterConfig {
  apiKey?: string;
  defaultModel?: string;
}

export class OpenAIAdapter extends AISdkAdapter {
  constructor(config: OpenAIAdapterConfig = {}) {
    const provider = createOpenAI({ apiKey: config.apiKey });
    super('openai', (modelId) => provider(modelId), config.defaultModel ?? 'gpt-4o-mini');
  }
}
