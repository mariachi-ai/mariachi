import type { AIConfig } from './types';
import { OpenAIAdapter } from './adapters/openai';
import { SessionManager } from './session/manager';
import { ToolRegistry } from './tools/registry';
import { PromptRegistry } from './prompts/registry';
import { AITelemetryTracker } from './telemetry';

export function createAI(config: AIConfig) {
  let adapter;
  if (config.adapter === 'openai') {
    adapter = new OpenAIAdapter({
      apiKey: config.apiKey,
      defaultModel: config.defaultModel,
    });
  } else {
    throw new Error(`Unknown adapter: ${config.adapter}`);
  }

  const sessions = new SessionManager(adapter);
  const tools = new ToolRegistry();
  const prompts = new PromptRegistry();
  const telemetry = new AITelemetryTracker();

  return {
    sessions,
    tools,
    prompts,
    telemetry,
  };
}

export type {
  AIConfig,
  AIMessage,
  AISession,
  AIResponse,
  ToolCall,
  ToolResult,
  ToolDefinition,
  PromptTemplate,
  AITelemetryEntry,
  SessionConfig,
  StreamChunk,
  TokenBudget,
} from './types';

export { OpenAIAdapter } from './adapters/openai';
export { SessionManager } from './session/manager';
export { ToolRegistry } from './tools/registry';
export { PromptRegistry } from './prompts/registry';
export { AITelemetryTracker } from './telemetry';
export { runAgent } from './patterns/agent';
export { createRAGPipeline } from './patterns/rag';
export { estimateCost } from './cost';
export { AI, DefaultAI } from './ai';
export * from './schema/index';
