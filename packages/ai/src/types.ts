import type { z } from 'zod';

export interface AIConfig {
  adapter: string;
  apiKey?: string;
  defaultModel?: string;
  /** Tried in order when the primary model fails. */
  fallbackModels?: string[];
  /** USD per 1K tokens. Overrides the built-in table. */
  costTable?: CostTable;
}

export type CostTable = Record<string, { input: number; output: number }>;

export interface AIProvider {
  id: string;
  generate(messages: AIMessage[], config: { model?: string; tools?: ToolDefinition[] }): Promise<AIResponse>;
  stream?(messages: AIMessage[], config: { model?: string; tools?: ToolDefinition[] }): AsyncIterable<StreamChunk>;
}

export interface AIMessage {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string;
  toolCalls?: ToolCall[];
}

export interface ToolCall {
  id: string;
  name: string;
  arguments: Record<string, unknown>;
}

export interface ToolResult {
  callId: string;
  result: unknown;
  toolName?: string;
  /** Set when the tool threw. The agent loop keeps going and shows this to the model. */
  isError?: boolean;
}

export interface AISession {
  id: string;
  send(message: string, toolResults?: ToolResult[]): Promise<AIResponse>;
  stream?(message: string): AsyncIterable<StreamChunk>;
  getHistory(): AIMessage[];
  usage?(): { inputTokens: number; outputTokens: number; totalTokens: number };
  budget?: TokenBudget;
}

export interface AIResponse {
  content: string;
  toolCalls?: ToolCall[];
  usage: { inputTokens: number; outputTokens: number; totalTokens: number };
  model: string;
  latencyMs: number;
}

export interface ToolDefinition<T = unknown> {
  name: string;
  description: string;
  schema: z.ZodType<T>;
  handler: (input: T) => Promise<unknown>;
}

export interface PromptTemplate {
  name: string;
  version: string;
  template: string;
  variables?: string[];
}

export interface AITelemetryEntry {
  sessionId: string;
  model: string;
  inputTokens: number;
  outputTokens: number;
  latencyMs: number;
  costUsd: number;
  createdAt: Date;
}

export interface StreamChunk {
  content: string;
  done: boolean;
  usage?: { inputTokens: number; outputTokens: number };
}

export interface TokenBudget {
  maxInputTokens?: number;
  maxOutputTokens?: number;
  maxTotalTokens?: number;
  warningThresholdPercent?: number;
}

export interface SessionConfig {
  model?: string;
  /** Tried in order when `model` fails. */
  models?: string[];
  systemPrompt?: string;
  tenantId?: string;
  userId?: string;
  tools?: ToolDefinition[];
  maxIterations?: number;
  budget?: TokenBudget;
}
