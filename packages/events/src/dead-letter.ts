import type { Logger } from '@mariachi/core';

export interface DeadLetterConfig {
  maxRetries: number;
  retryDelayMs: number;
}

export class DeadLetterHandler {
  private readonly failed = new Map<string, { event: string; payload: unknown; error: Error; attempts: number }[]>();

  constructor(
    private readonly logger: Logger,
    private readonly config: DeadLetterConfig = { maxRetries: 3, retryDelayMs: 1000 },
  ) {}

  async handle(eventName: string, payload: unknown, error: Error, handler: (payload: unknown) => Promise<void>): Promise<boolean> {
    const key = `${eventName}:${JSON.stringify(payload)}`;
    const entries = this.failed.get(key) ?? [];
    const attempts = entries.length + 1;

    if (attempts <= this.config.maxRetries) {
      this.logger.warn({ event: eventName, attempt: attempts, error: error.message }, 'Retrying failed event handler');
      await new Promise(resolve => setTimeout(resolve, this.config.retryDelayMs * attempts));
      try {
        await handler(payload);
        this.failed.delete(key);
        return true;
      } catch (retryError) {
        entries.push({ event: eventName, payload, error: retryError as Error, attempts });
        this.failed.set(key, entries);
        return false;
      }
    }

    this.logger.error({ event: eventName, attempts, error: error.message }, 'Event sent to dead letter after max retries');
    return false;
  }

  getDeadLetters(): Array<{ event: string; payload: unknown; error: Error; attempts: number }> {
    return Array.from(this.failed.values()).flat();
  }
}
