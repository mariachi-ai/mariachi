import type { Entity, BaseEntity, Context, PaginatedResult, PaginationParams, SortParams } from '@mariachi/core';

export type { Entity, BaseEntity, PaginatedResult, PaginationParams, SortParams };

export type FilterOp = 'eq' | 'neq' | 'gt' | 'gte' | 'lt' | 'lte';

export interface FilterCondition {
  field: string;
  op: FilterOp;
  value: unknown;
}

export type QueryFilter<T> = Partial<T> | FilterCondition[];

export interface CacheClient {
  get<T = string>(key: string): Promise<T | null>;
  set(key: string, value: unknown, ttlSeconds?: number): Promise<void>;
  del(key: string): Promise<void>;
  has(key: string): Promise<boolean>;
  keys(pattern: string): Promise<string[]>;
  flush(): Promise<void>;
  connect(): Promise<void>;
  disconnect(): Promise<void>;
  key(...segments: string[]): string;
}

export type EventHandler<T = unknown> = (event: T, ctx?: Context) => Promise<void>;

export interface EventBus {
  publish<T>(eventName: string, payload: T): Promise<void>;
  subscribe<T>(eventName: string, handler: EventHandler<T>): void;
  unsubscribe(eventName: string, handler: EventHandler): void;
  connect(): Promise<void>;
  disconnect(): Promise<void>;
}

export interface JobQueue {
  enqueue<T>(
    jobName: string,
    data: T,
    options?: { delay?: number; priority?: number; traceId?: string }
  ): Promise<string>;
  connect(): Promise<void>;
  disconnect(): Promise<void>;
}

export interface JobDefinition<T = unknown> {
  name: string;
  schema: import('zod').ZodType<T>;
  retry: { attempts: number; backoff: string; delay?: number };
  handler: (data: T, ctx: unknown) => Promise<void>;
}

export interface JobWorker {
  registerJob<T>(definition: JobDefinition<T>): void;
  start(): Promise<void>;
  stop(): Promise<void>;
}

export interface PutOptions {
  access: 'public' | 'private';
  contentType?: string;
  metadata?: Record<string, string>;
}

export interface StorageClient {
  key(...segments: string[]): string;
  put(key: string, data: Buffer | Uint8Array | string, options: PutOptions): Promise<void>;
  get(key: string): Promise<Buffer | null>;
  delete(key: string): Promise<void>;
  exists(key: string): Promise<boolean>;
  signedUrl(key: string, options?: { expiresIn?: number }): Promise<string>;
  publicUrl(key: string): string;
}

export interface EmailMessage {
  to: string | string[];
  subject: string;
  html?: string;
  text?: string;
  from?: string;
  replyTo?: string;
  templateId?: string;
  templateData?: Record<string, unknown>;
}

export interface EmailAdapter {
  send(message: EmailMessage): Promise<{ id: string }>;
}

export interface Repository<T extends Entity> {
  findById(ctx: Context, id: string): Promise<T | null>;
  findMany(ctx: Context, filter?: QueryFilter<T>, sort?: SortParams): Promise<T[]>;
  create(ctx: Context, data: Omit<T, 'id'>): Promise<T>;
  update(ctx: Context, id: string, data: Partial<Omit<T, 'id'>>): Promise<T>;
  softDelete(ctx: Context, id: string): Promise<void>;
  hardDelete(ctx: Context, id: string): Promise<void>;
  paginate(ctx: Context, params: PaginationParams, filter?: QueryFilter<T>, sort?: SortParams): Promise<PaginatedResult<T>>;
  count(ctx: Context, filter?: QueryFilter<T>): Promise<number>;
  deleteWhere(ctx: Context, filter: QueryFilter<T>): Promise<number>;
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

export interface AIResponse {
  content: string;
  toolCalls?: ToolCall[];
  usage: { inputTokens: number; outputTokens: number; totalTokens: number };
  model: string;
  latencyMs: number;
}

export interface AISession {
  id: string;
  send(message: string, toolResults?: ToolResult[]): Promise<AIResponse>;
  getHistory(): AIMessage[];
}

export interface TypedEvent<T = unknown> {
  type: string;
  payload: T;
  occurredAt: string;
  traceId?: string;
  tenantId?: string;
}
