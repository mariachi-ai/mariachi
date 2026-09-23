import { AIError } from '@mariachi/core';
import type { AIConfig } from './types';
import { OpenAIAdapter } from './adapters/openai';
import { FallbackAdapter, type FallbackProvider } from './adapters/fallback';
import { SessionManager, type AISessionStore, type Adapter as AIAdapter } from './session/manager';
import { ToolRegistry } from './tools/registry';
import { PromptRegistry } from './prompts/registry';
import { AITelemetryTracker } from './telemetry';
import type { AITelemetryEntry } from './types';

/**
 * Builds the pieces `DefaultAI` needs. `adapter: 'openai'` is built in; for Anthropic or any other
 * provider pass `adapter: 'custom'` with `instance` (e.g. `new AnthropicAdapter()` from
 * `@mariachi/ai/anthropic`). `fallbackProviders` are tried in order after the primary fails.
 */
export function createAI(config: AIConfig & {
  instance?: AIAdapter;
  fallbackProviders?: FallbackProvider[];
  sessions?: AISessionStore;
  persistTelemetry?: (entry: AITelemetryEntry) => void | Promise<void>;
  onPersistError?: (error: Error, sessionId: string) => void;
}) {
  let primary: AIAdapter;
  let primaryModels: string[] | undefined;
  if (config.adapter === 'openai') {
    primary = new OpenAIAdapter({ apiKey: config.apiKey, defaultModel: config.defaultModel });
    primaryModels = [config.defaultModel ?? 'gpt-4o-mini'];
  } else if (config.adapter === 'custom') {
    if (!config.instance) throw new AIError('ai/config', "adapter 'custom' requires instance");
    primary = config.instance;
    primaryModels = config.defaultModel ? [config.defaultModel] : undefined;
  } else if (config.adapter === 'anthropic') {
    throw new AIError(
      'ai/config',
      "Use adapter 'custom' with instance: new AnthropicAdapter() from '@mariachi/ai/anthropic' (install @ai-sdk/anthropic)",
    );
  } else {
    throw new AIError('ai/unknown-adapter', `Unknown adapter: ${config.adapter}`);
  }

  const chain: FallbackProvider[] = [];
  if (config.fallbackModels?.length) {
    chain.push({ id: config.adapter, adapter: primary, models: [...(primaryModels ?? []), ...config.fallbackModels] });
  } else if (config.fallbackProviders?.length) {
    chain.push({ id: config.adapter, adapter: primary, models: primaryModels });
  }
  chain.push(...(config.fallbackProviders ?? []));
  const adapter: AIAdapter = chain.length ? new FallbackAdapter(chain) : primary;

  const sessions = new SessionManager(adapter, config.sessions, config.onPersistError);
  const tools = new ToolRegistry();
  const prompts = new PromptRegistry();
  const telemetry = new AITelemetryTracker(config.persistTelemetry);

  return {
    sessions,
    tools,
    prompts,
    telemetry,
    costTable: config.costTable,
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
  CostTable,
  AIProvider,
} from './types';

export { OpenAIAdapter, type OpenAIAdapterConfig } from './adapters/openai';
export { AISdkAdapter } from './adapters/ai-sdk';
export { FallbackAdapter, type FallbackProvider } from './adapters/fallback';
export { SessionManager, type AISessionStore, type SessionState, type Adapter as AIAdapter } from './session/manager';
export { ToolRegistry } from './tools/registry';
export { PromptRegistry } from './prompts/registry';
export { AITelemetryTracker } from './telemetry';
export { runAgent } from './patterns/agent';
export { createRAGPipeline } from './patterns/rag';
export { estimateCost, resolveRates, DEFAULT_COST_TABLE } from './cost';
export { AI, DefaultAI } from './ai';
export * from './schema/index';
