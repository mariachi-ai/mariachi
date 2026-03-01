import { generateText, tool } from 'ai';
import { createOpenAI } from '@ai-sdk/openai';
import type { AIMessage, AIResponse, ToolDefinition } from '../types';

function toSdkMessages(messages: AIMessage[]): Array<
  | { role: 'system' | 'user' | 'assistant'; content: string }
  | { role: 'tool'; content: Array<{ type: 'tool-result'; toolCallId: string; toolName: string; result: unknown }> }
> {
  const result: Array<
    | { role: 'system' | 'user' | 'assistant'; content: string }
    | { role: 'tool'; content: Array<{ type: 'tool-result'; toolCallId: string; toolName: string; result: unknown }> }
  > = [];
  for (const m of messages) {
    if (m.role === 'tool') {
      const parsed = typeof m.content === 'string' ? JSON.parse(m.content) : m.content;
      const items = Array.isArray(parsed) ? parsed : [parsed];
      result.push({
        role: 'tool',
        content: items.map((item: { callId?: string; toolCallId?: string; result?: unknown; output?: unknown; toolName?: string }) => ({
          type: 'tool-result' as const,
          toolCallId: item.callId ?? item.toolCallId ?? '',
          toolName: item.toolName ?? '',
          result: item.result ?? item.output,
        })),
      });
    } else {
      result.push({ role: m.role, content: m.content });
    }
  }
  return result;
}

export interface OpenAIAdapterConfig {
  apiKey?: string;
  defaultModel?: string;
}

export class OpenAIAdapter {
  private provider: ReturnType<typeof createOpenAI>;
  private defaultModel: string;

  constructor(config: OpenAIAdapterConfig = {}) {
    this.provider = createOpenAI({ apiKey: config.apiKey });
    this.defaultModel = config.defaultModel ?? 'gpt-4o-mini';
  }

  async generate(
    messages: AIMessage[],
    config: { model?: string; tools?: ToolDefinition[] } = {},
  ): Promise<AIResponse> {
    const modelId = config.model ?? this.defaultModel;
    const model = this.provider(modelId);

    const sdkTools = config.tools
      ? Object.fromEntries(
          config.tools.map((t) => [
            t.name,
            tool({
              description: t.description,
              parameters: t.schema as Parameters<typeof tool>[0]['parameters'],
              execute: async (input) => t.handler(input as Parameters<typeof t.handler>[0]),
            }),
          ]),
        )
      : undefined;

    const sdkMessages = toSdkMessages(messages);

    const start = performance.now();
    const result = await generateText({
      model,
      messages: sdkMessages,
      tools: sdkTools,
    });
    const latencyMs = Math.round(performance.now() - start);

    const toolCalls = result.toolCalls?.map((tc) => ({
      id: tc.toolCallId,
      name: tc.toolName,
      arguments: tc.args as Record<string, unknown>,
    }));

    return {
      content: result.text ?? '',
      toolCalls,
      usage: {
        inputTokens: result.usage?.promptTokens ?? 0,
        outputTokens: result.usage?.completionTokens ?? 0,
        totalTokens: (result.usage?.promptTokens ?? 0) + (result.usage?.completionTokens ?? 0),
      },
      model: modelId,
      latencyMs,
    };
  }
}
