import { AIError } from '@mariachi/core';
import type { AISession, AIResponse, ToolCall, ToolDefinition, ToolResult } from '../types';
import { ToolRegistry } from '../tools/registry';

export interface RunAgentConfig {
  maxIterations: number;
  tools: ToolDefinition[];
  toolRegistry?: ToolRegistry;
  onToolCall?: (call: ToolCall) => void;
}

export async function runAgent(
  session: AISession,
  userMessage: string,
  config: RunAgentConfig,
): Promise<AIResponse> {
  const { maxIterations, tools, toolRegistry, onToolCall } = config;
  const registry = toolRegistry ?? (() => {
    const reg = new ToolRegistry();
    for (const t of tools) reg.register(t);
    return reg;
  })();
  let lastResponse: AIResponse = await session.send(userMessage);
  let iterations = 1;

  while (lastResponse.toolCalls?.length && iterations < maxIterations) {
    const toolResults: ToolResult[] = [];
    for (const tc of lastResponse.toolCalls) {
      onToolCall?.(tc);
      const result = await registry.execute(tc.name, tc.arguments);
      toolResults.push({ callId: tc.id, result, toolName: tc.name });
    }
    lastResponse = await session.send('', toolResults);
    iterations++;
  }

  if (iterations >= maxIterations && lastResponse.toolCalls?.length) {
    throw new AIError(
      'ai/max-iterations-exceeded',
      `Agent exceeded maxIterations (${maxIterations})`,
      { toolCalls: lastResponse.toolCalls },
    );
  }

  return lastResponse;
}
