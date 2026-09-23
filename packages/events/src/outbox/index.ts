import { and, asc, isNotNull, isNull, lt, lte, sql } from 'drizzle-orm';
import { EventsError, fromZodError, type Context, type Disposable, type Logger } from '@mariachi/core';
import { compileTable, currentTransaction, type DrizzleDb } from '@mariachi/database-postgres';
import { createEnvelope } from '../envelope';
import type { EventBus, EventDefinition, EventEnvelope } from '../types';
import { eventOutboxTable } from './schema';

export { eventOutboxTable } from './schema';

const outbox = compileTable(eventOutboxTable);

/** Compiled Drizzle table, for drizzle-kit schema files. */
export const outboxTables = { outbox };

export interface OutboxOptions {
  source?: string;
  /**
   * Refuse to write outside `withTransaction` (the whole point of an outbox is atomicity with
   * the business write). Default true.
   */
  requireTransaction?: boolean;
}

/**
 * Records events in the current database transaction. They are published by an `OutboxRelay`
 * only if the transaction commits, so state changes and events can't diverge.
 */
export class Outbox {
  constructor(
    private readonly db: DrizzleDb,
    private readonly options: OutboxOptions = {},
  ) {}

  async add<T>(ctx: Context, event: string | EventDefinition<T>, payload: T, options: { id?: string } = {}): Promise<EventEnvelope<T>> {
    const name = typeof event === 'string' ? event : event.name;
    let data = payload;
    if (typeof event !== 'string' && event.schema) {
      const parsed = event.schema.safeParse(payload);
      if (!parsed.success) throw fromZodError(parsed.error, `Invalid payload for event ${name}`);
      data = parsed.data;
    }
    const tx = currentTransaction();
    if (!tx && this.options.requireTransaction !== false) {
      throw new EventsError('events/outbox-requires-transaction', 'Outbox.add must run inside withTransaction()');
    }
    const envelope = createEnvelope(ctx, name, data, { id: options.id, source: this.options.source });
    await (tx ?? this.db).insert(outbox).values({ id: envelope.id, type: name, envelope });
    return envelope;
  }
}

export interface OutboxRelayOptions {
  db: DrizzleDb;
  /** Anything that can publish a finished envelope: an `EventBus`, or `Events` via `publishEnvelope`. */
  target: Pick<EventBus, 'publish'> | { publishEnvelope(envelope: EventEnvelope): Promise<void> };
  logger?: Logger;
  batchSize?: number;
  /** Poll interval when the previous batch was empty. Default 500ms. */
  intervalMs?: number;
  /** Max retry backoff for a failing row. Default 5 minutes. */
  maxBackoffMs?: number;
  /** Delete published rows older than this on each sweep. Default 7 days; 0 disables. */
  retentionMs?: number;
}

/**
 * Publishes committed outbox rows. Safe to run on every instance: rows are claimed with
 * `FOR UPDATE SKIP LOCKED`. Delivery is at-least-once (a crash after publish but before the
 * row is marked can republish), so consumers dedupe on the event id.
 */
export class OutboxRelay implements Disposable {
  private timer?: NodeJS.Timeout;
  private running = false;
  private sweeping?: Promise<unknown>;
  private lastPurge = 0;
  private readonly batchSize: number;
  private readonly intervalMs: number;
  private readonly maxBackoffMs: number;
  private readonly retentionMs: number;

  constructor(private readonly options: OutboxRelayOptions) {
    this.batchSize = options.batchSize ?? 100;
    this.intervalMs = options.intervalMs ?? 500;
    this.maxBackoffMs = options.maxBackoffMs ?? 5 * 60_000;
    this.retentionMs = options.retentionMs ?? 7 * 24 * 60 * 60_000;
  }

  private publish(envelope: EventEnvelope): Promise<void> {
    const t = this.options.target;
    return 'publishEnvelope' in t ? t.publishEnvelope(envelope) : t.publish(envelope);
  }

  /** Relays one batch. Returns the number of rows published. */
  async relayOnce(): Promise<number> {
    return this.options.db.transaction(async (tx) => {
      const rows = await tx
        .select({ id: outbox.id, envelope: outbox.envelope, attempts: outbox.attempts })
        .from(outbox)
        .where(and(isNull(outbox.publishedAt), lte(outbox.availableAt, sql`now()`)))
        .orderBy(asc(outbox.createdAt))
        .limit(this.batchSize)
        .for('update', { skipLocked: true });
      let published = 0;
      for (const row of rows) {
        try {
          await this.publish(row.envelope as EventEnvelope);
          await tx.update(outbox).set({ publishedAt: sql`now()`, attempts: row.attempts + 1, lastError: null }).where(sql`${outbox.id} = ${row.id}`);
          published++;
        } catch (error) {
          const attempts = row.attempts + 1;
          const backoff = Math.min(this.maxBackoffMs, 1_000 * 2 ** Math.min(attempts - 1, 20));
          this.options.logger?.error({ eventId: row.id, attempts, error: (error as Error).message }, 'outbox publish failed');
          await tx
            .update(outbox)
            .set({ attempts, lastError: (error as Error).message, availableAt: sql`now() + ${`${backoff} milliseconds`}::interval` })
            .where(sql`${outbox.id} = ${row.id}`);
        }
      }
      return published;
    });
  }

  /** Deletes published rows older than `retentionMs`. */
  async purge(): Promise<number> {
    if (!this.retentionMs) return 0;
    const cutoff = new Date(Date.now() - this.retentionMs);
    const deleted = await this.options.db
      .delete(outbox)
      .where(and(isNotNull(outbox.publishedAt), lt(outbox.publishedAt, cutoff)))
      .returning({ id: outbox.id });
    return deleted.length;
  }

  async connect(): Promise<void> {
    this.start();
  }

  start(): void {
    if (this.running) return;
    this.running = true;
    const tick = async () => {
      if (!this.running) return;
      let published = 0;
      try {
        this.sweeping = this.relayOnce();
        published = (await this.sweeping) as number;
        if (Date.now() - this.lastPurge > 60 * 60_000) {
          this.lastPurge = Date.now();
          await this.purge();
        }
      } catch (error) {
        this.options.logger?.error({ error: (error as Error).message }, 'outbox relay sweep failed');
      }
      if (this.running) this.timer = setTimeout(tick, published >= this.batchSize ? 0 : this.intervalMs);
    };
    void tick();
  }

  async disconnect(): Promise<void> {
    this.running = false;
    if (this.timer) clearTimeout(this.timer);
    await this.sweeping?.catch(() => undefined);
  }

  async isHealthy(): Promise<boolean> {
    return this.running;
  }
}
