import type { z } from 'zod';

export interface AIConfig {
  adapter: string;
  apiKey?: string;
  defaultModel?: string;
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
}

export interface AISession {
  id: string;
  send(message: string, toolResults?: ToolResult[]): Promise<AIResponse>;
  getHistory(): AIMessage[];
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
  systemPrompt?: string;
  tenantId?: string;
  userId?: string;
  tools?: ToolDefinition[];
  maxIterations?: number;
}
