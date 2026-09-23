import { randomUUID } from 'node:crypto';
import { MariachiError, computeRetryDelay, createContext, type Context, type Logger } from '@mariachi/core';
import type { EnqueueOptions, JobContext, JobContextEnvelope, JobDefinition, JobPriority, RetryConfig } from './types';
import { JOB_PRIORITY_VALUES } from './types';

export interface WireJob {
  __mariachi: { v: 1; context?: JobContextEnvelope };
  payload: unknown;
}

export function toEnvelope(ctx: Pick<Context, 'traceId' | 'tenantId' | 'userId' | 'scopes' | 'identityType'>): JobContextEnvelope {
  return { traceId: ctx.traceId, tenantId: ctx.tenantId, userId: ctx.userId, scopes: ctx.scopes, identityType: ctx.identityType };
}

export function wrap(data: unknown, options: EnqueueOptions = {}): WireJob {
  const context = options.context ?? (options.traceId ? { traceId: options.traceId, tenantId: null, userId: null, scopes: [], identityType: 'system' } : undefined);
  return { __mariachi: { v: 1, context }, payload: data };
}

export function unwrap(raw: unknown): { payload: unknown; context?: JobContextEnvelope } {
  if (raw && typeof raw === 'object' && '__mariachi' in raw) {
    const w = raw as WireJob;
    return { payload: w.payload, context: w.__mariachi.context };
  }
  return { payload: raw };
}

export function priorityValue(p: EnqueueOptions['priority']): number | undefined {
  if (p === undefined) return undefined;
  return typeof p === 'number' ? p : JOB_PRIORITY_VALUES[p as JobPriority];
}

export const DEFAULT_RETRY: RetryConfig = { attempts: 3, backoff: 'exponential', delay: 1000 };

export function retryDelay(retry: RetryConfig, attempt: number): number {
  const base = retry.delay ?? 1000;
  if (retry.backoff === 'fixed') return base;
  if (retry.backoff === 'linear') return base * attempt;
  return computeRetryDelay({ backoff: 'exponential', baseDelayMs: base, maxDelayMs: 60 * 60_000, jitter: true }, attempt - 1);
}

export function buildJobContext(args: {
  logger: Logger;
  envelope?: JobContextEnvelope;
  jobId: string;
  jobName: string;
  attemptNumber: number;
  maxAttempts: number;
  signal: AbortSignal;
  updateProgress: JobContext['updateProgress'];
}): JobContext {
  const env = args.envelope;
  const traceId = env?.traceId ?? randomUUID();
  const base = createContext({
    traceId,
    logger: args.logger.child({ jobId: args.jobId, jobName: args.jobName, attempt: args.attemptNumber, traceId, tenantId: env?.tenantId ?? undefined }),
    userId: env?.userId ?? null,
    tenantId: env?.tenantId ?? null,
    scopes: env?.scopes ?? [],
    identityType: env?.identityType ?? 'system',
  });
  return {
    ...base,
    jobId: args.jobId,
    jobName: args.jobName,
    attemptNumber: args.attemptNumber,
    maxAttempts: args.maxAttempts,
    signal: args.signal,
    updateProgress: args.updateProgress,
  };
}

export function isNonRetryable(definition: JobDefinition, error: unknown): boolean {
  const code = (error as { code?: string })?.code;
  if (code === 'validation/invalid-input' || code === 'jobs/invalid-payload') return true;
  return !!code && (definition.nonRetryableCodes ?? []).includes(code);
}

export async function runWithTimeout<T>(fn: (signal: AbortSignal) => Promise<T>, timeoutMs: number | undefined, parent: AbortSignal): Promise<T> {
  const controller = new AbortController();
  const onAbort = () => controller.abort(parent.reason);
  parent.addEventListener('abort', onAbort, { once: true });
  let timer: NodeJS.Timeout | undefined;
  try {
    if (!timeoutMs) return await fn(controller.signal);
    return await Promise.race([
      fn(controller.signal),
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => {
          controller.abort();
          reject(new MariachiError('jobs/timeout', `Job exceeded ${timeoutMs}ms`));
        }, timeoutMs);
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
    parent.removeEventListener('abort', onAbort);
  }
}
