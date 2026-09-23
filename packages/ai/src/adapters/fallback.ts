import { AIError } from '@mariachi/core';
import type { AIMessage, AIResponse, StreamChunk, ToolDefinition } from '../types';
import type { Adapter } from '../session/manager';

export interface FallbackProvider {
  id: string;
  adapter: Adapter;
  /** Models to try on this provider, in order. Omit to use the adapter's default model. */
  models?: string[];
}

type CallConfig = { model?: string; tools?: ToolDefinition[] };

/** Budget and missing-session errors are the caller's problem; another provider would fail the same way. */
function isFinal(error: unknown): boolean {
  return error instanceof AIError && (error.code === 'ai/token-budget-exceeded' || error.code === 'ai/session-not-found');
}

function describe(provider: FallbackProvider, model: string | undefined, error: unknown): string {
  return `${provider.id}${model ? `/${model}` : ''}: ${error instanceof Error ? error.message : String(error)}`;
}

/**
 * Tries each provider, then each of its models, and returns the first success. A model requested
 * by the session only goes to the first provider, since model ids are provider-specific.
 * Streams fall through only if a provider fails before its first chunk.
 */
export class FallbackAdapter implements Adapter {
  constructor(private readonly providers: FallbackProvider[]) {
    if (providers.length === 0) throw new AIError('ai/config', 'FallbackAdapter requires at least one provider');
  }

  private attempts(config: CallConfig): Array<{ provider: FallbackProvider; model: string | undefined }> {
    return this.providers.flatMap((provider, index) => {
      const own = provider.models ?? [];
      const models = index === 0 && config.model ? [config.model, ...own.filter((m) => m !== config.model)] : own;
      return (models.length ? models : [undefined]).map((model) => ({ provider, model }));
    });
  }

  async generate(messages: AIMessage[], config: CallConfig = {}): Promise<AIResponse> {
    const errors: string[] = [];
    for (const { provider, model } of this.attempts(config)) {
      try {
        return await provider.adapter.generate(messages, { ...config, model });
      } catch (error) {
        if (isFinal(error)) throw error;
        errors.push(describe(provider, model, error));
      }
    }
    throw new AIError('ai/providers-exhausted', errors.join('; ') || 'No AI provider succeeded');
  }

  async *stream(messages: AIMessage[], config: CallConfig = {}): AsyncIterable<StreamChunk> {
    const errors: string[] = [];
    for (const { provider, model } of this.attempts(config)) {
      let started = false;
      try {
        if (!provider.adapter.stream) {
          const response = await provider.adapter.generate(messages, { ...config, model });
          yield { content: response.content, done: true, usage: response.usage };
          return;
        }
        for await (const chunk of provider.adapter.stream(messages, { ...config, model })) {
          started = true;
          yield chunk;
        }
        return;
      } catch (error) {
        if (started || isFinal(error)) throw error;
        errors.push(describe(provider, model, error));
      }
    }
    throw new AIError('ai/providers-exhausted', errors.join('; ') || 'No AI provider succeeded');
  }
}
