export interface RetryConfig {
  attempts: number;
  backoff: 'exponential' | 'linear' | 'fixed';
  baseDelayMs: number;
  maxDelayMs: number;
  jitter: boolean;
  retryOn?: (error: Error) => boolean;
}

export const DEFAULT_RETRY_CONFIG: RetryConfig = {
  attempts: 3,
  backoff: 'exponential',
  baseDelayMs: 200,
  maxDelayMs: 10_000,
  jitter: true,
};

function computeDelay(config: RetryConfig, attempt: number): number {
  let delay: number;
  switch (config.backoff) {
    case 'exponential':
      delay = config.baseDelayMs * Math.pow(2, attempt);
      break;
    case 'linear':
      delay = config.baseDelayMs * (attempt + 1);
      break;
    case 'fixed':
      delay = config.baseDelayMs;
      break;
  }
  delay = Math.min(delay, config.maxDelayMs);
  if (config.jitter) {
    delay = delay * (0.5 + Math.random() * 0.5);
  }
  return delay;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function retry<T>(
  fn: () => Promise<T>,
  config: Partial<RetryConfig> = {},
): Promise<T> {
  const resolved: RetryConfig = { ...DEFAULT_RETRY_CONFIG, ...config };
  let lastError: Error | undefined;

  for (let attempt = 0; attempt < resolved.attempts; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));
      if (resolved.retryOn && !resolved.retryOn(lastError)) {
        throw lastError;
      }
      if (attempt < resolved.attempts - 1) {
        await sleep(computeDelay(resolved, attempt));
      }
    }
  }

  throw lastError;
}
