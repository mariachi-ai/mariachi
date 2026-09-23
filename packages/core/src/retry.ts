import { MariachiError } from './errors';

export interface RetryConfig {
  attempts: number;
  backoff: 'exponential' | 'linear' | 'fixed';
  baseDelayMs: number;
  maxDelayMs: number;
  jitter: boolean;
  retryOn?: (error: Error, attempt: number) => boolean;
  onRetry?: (error: Error, attempt: number, delayMs: number) => void;
  signal?: AbortSignal;
}

export const DEFAULT_RETRY_CONFIG: RetryConfig = {
  attempts: 3,
  backoff: 'exponential',
  baseDelayMs: 200,
  maxDelayMs: 10_000,
  jitter: true,
};

export function computeRetryDelay(config: Pick<RetryConfig, 'backoff' | 'baseDelayMs' | 'maxDelayMs' | 'jitter'>, attempt: number): number {
  let delay: number;
  switch (config.backoff) {
    case 'exponential':
      delay = config.baseDelayMs * 2 ** attempt;
      break;
    case 'linear':
      delay = config.baseDelayMs * (attempt + 1);
      break;
    default:
      delay = config.baseDelayMs;
  }
  delay = Math.min(delay, config.maxDelayMs);
  if (config.jitter) delay = delay * (0.5 + Math.random() * 0.5);
  return delay;
}

function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) return reject(abortError(signal));
    const timer = setTimeout(() => {
      signal?.removeEventListener('abort', onAbort);
      resolve();
    }, ms);
    const onAbort = () => {
      clearTimeout(timer);
      reject(abortError(signal!));
    };
    signal?.addEventListener('abort', onAbort, { once: true });
  });
}

function abortError(signal: AbortSignal): Error {
  return signal.reason instanceof Error ? signal.reason : new MariachiError('retry/aborted', 'Retry aborted');
}

export async function retry<T>(fn: (attempt: number) => Promise<T>, config: Partial<RetryConfig> = {}): Promise<T> {
  const resolved: RetryConfig = { ...DEFAULT_RETRY_CONFIG, ...config };
  const attempts = Math.max(1, resolved.attempts);
  let lastError: Error = new MariachiError('retry/exhausted', 'Retry exhausted');

  for (let attempt = 0; attempt < attempts; attempt++) {
    if (resolved.signal?.aborted) throw abortError(resolved.signal);
    try {
      return await fn(attempt);
    } catch (error) {
      lastError = error instanceof Error ? error : new MariachiError('retry/non-error-thrown', String(error));
      if (resolved.retryOn && !resolved.retryOn(lastError, attempt)) throw lastError;
      if (attempt < attempts - 1) {
        const delay = computeRetryDelay(resolved, attempt);
        resolved.onRetry?.(lastError, attempt, delay);
        await sleep(delay, resolved.signal);
      }
    }
  }

  throw lastError;
}

/** Rejects with a `<code>` MariachiError if `promise` does not settle within `ms`. */
export async function withTimeout<T>(promise: Promise<T>, ms: number, code = 'timeout', message?: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new MariachiError(code, message ?? `Timed out after ${ms}ms`, { timeoutMs: ms })), ms);
  });
  try {
    return await Promise.race([promise, timeout]);
  } finally {
    clearTimeout(timer);
  }
}
