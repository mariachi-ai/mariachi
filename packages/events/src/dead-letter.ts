import type Redis from 'ioredis';
import type { Logger } from '@mariachi/core';
import type { DeadLetter, DeadLetterSink } from './types';

/** Keeps dead letters in memory. For tests and local development. */
export class MemoryDeadLetterSink implements DeadLetterSink {
  readonly entries: DeadLetter[] = [];

  async send(entry: DeadLetter): Promise<void> {
    this.entries.push(entry);
  }

  clear(): void {
    this.entries.length = 0;
  }
}

/** Only logs. The default, so failures are never silent. */
export class LoggingDeadLetterSink implements DeadLetterSink {
  constructor(private readonly logger: Logger) {}

  async send(entry: DeadLetter): Promise<void> {
    this.logger.error(
      { event: entry.envelope.type, eventId: entry.envelope.id, subscriber: entry.subscriber, attempts: entry.attempts, error: entry.error },
      'event dead-lettered',
    );
  }
}

/** Appends dead letters to a Redis stream (default `mariachi.events:dead-letter`) for inspection and replay. */
export class RedisStreamDeadLetterSink implements DeadLetterSink {
  constructor(
    private readonly redis: Redis,
    private readonly stream = 'mariachi.events:dead-letter',
    private readonly maxLen = 100_000,
  ) {}

  async send(entry: DeadLetter): Promise<void> {
    await this.redis.xadd(this.stream, 'MAXLEN', '~', String(this.maxLen), '*', 'd', JSON.stringify(entry));
  }

  async list(count = 100): Promise<DeadLetter[]> {
    const rows = await this.redis.xrevrange(this.stream, '+', '-', 'COUNT', count);
    return rows.map(([, fields]) => JSON.parse(fields[1] ?? '{}') as DeadLetter);
  }
}
