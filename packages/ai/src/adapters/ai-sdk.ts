import { generateText, streamText, type JSONValue, type LanguageModel, type ModelMessage } from 'ai';
import { AIError } from '@mariachi/core';
import type { AIMessage, AIResponse, StreamChunk, ToolDefinition } from '../types';

function toModelMessages(messages: AIMessage[]): { instructions?: string; messages: ModelMessage[] } {
  const systems: string[] = [];
  const out: ModelMessage[] = [];
  for (const message of messages) {
    if (message.role === 'system') {
      systems.push(message.content);
      continue;
    }
    if (message.role === 'tool') {
      const parsed = JSON.parse(message.content) as { callId?: string; result?: unknown; toolName?: string; isError?: boolean };
      out.push({
        role: 'tool',
        content: [{
          type: 'tool-result',
          toolCallId: parsed.callId ?? '',
          toolName: parsed.toolName ?? 'tool',
          output: parsed.isError
            ? { type: 'error-text', value: typeof parsed.result === 'string' ? parsed.result : JSON.stringify(parsed.result) }
            : { type: 'json', value: JSON.parse(JSON.stringify(parsed.result ?? null)) as JSONValue },
        }],
      });
      continue;
    }
    if (message.role === 'assistant' && message.toolCalls?.length) {
      out.push({
        role: 'assistant',
        content: [
          ...(message.content ? [{ type: 'text' as const, text: message.content }] : []),
          ...message.toolCalls.map((call) => ({
            type: 'tool-call' as const,
            toolCallId: call.id,
            toolName: call.name,
            input: call.arguments,
          })),
        ],
      });
      continue;
    }
    out.push({ role: message.role, content: message.content });
  }
  return { instructions: systems.length ? systems.join('\n') : undefined, messages: out };
}

function toTools(tools: ToolDefinition[] | undefined) {
  if (!tools?.length) return undefined;
  return Object.fromEntries(tools.map((item) => [item.name, {
    description: item.description,
    inputSchema: item.schema,
  }]));
}

function usageOf(usage: { inputTokens?: number; outputTokens?: number } | undefined) {
  const inputTokens = usage?.inputTokens ?? 0;
  const outputTokens = usage?.outputTokens ?? 0;
  return { inputTokens, outputTokens, totalTokens: inputTokens + outputTokens };
}

/**
 * Adapter over any AI SDK provider. `OpenAIAdapter` and `AnthropicAdapter` are thin subclasses;
 * pass another provider's model factory to support it without a new adapter.
 */
export class AISdkAdapter {
  constructor(
    readonly name: string,
    private readonly model: (modelId: string) => LanguageModel,
    protected readonly defaultModel: string,
  ) {}

  async generate(
    messages: AIMessage[],
    config: { model?: string; tools?: ToolDefinition[] } = {},
  ): Promise<AIResponse> {
    const modelId = config.model ?? this.defaultModel;
    const prompt = toModelMessages(messages);
    const start = performance.now();
    try {
      const result = await generateText({
        model: this.model(modelId),
        instructions: prompt.instructions,
        messages: prompt.messages,
        tools: toTools(config.tools),
      });
      return {
        content: result.text ?? '',
        toolCalls: result.toolCalls?.map((call) => ({
          id: call.toolCallId,
          name: call.toolName,
          arguments: (call.input ?? {}) as Record<string, unknown>,
        })),
        usage: usageOf(result.usage),
        model: modelId,
        latencyMs: Math.round(performance.now() - start),
      };
    } catch (error) {
      throw new AIError('ai/request-failed', error instanceof Error ? error.message : `${this.name} request failed`, {
        provider: this.name,
        model: modelId,
      });
    }
  }

  async *stream(
    messages: AIMessage[],
    config: { model?: string; tools?: ToolDefinition[] } = {},
  ): AsyncIterable<StreamChunk> {
    const modelId = config.model ?? this.defaultModel;
    const prompt = toModelMessages(messages);
    try {
      const result = streamText({
        model: this.model(modelId),
        instructions: prompt.instructions,
        messages: prompt.messages,
        tools: toTools(config.tools),
      });
      for await (const part of result.textStream) {
        yield { content: part, done: false };
      }
      const usage = await result.usage;
      yield { content: '', done: true, usage: { inputTokens: usage.inputTokens ?? 0, outputTokens: usage.outputTokens ?? 0 } };
    } catch (error) {
      if (error instanceof AIError) throw error;
      throw new AIError('ai/request-failed', error instanceof Error ? error.message : `${this.name} stream failed`, {
        provider: this.name,
        model: modelId,
      });
    }
  }
}
