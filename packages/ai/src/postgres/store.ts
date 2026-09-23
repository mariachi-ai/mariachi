import { asc, count, eq } from 'drizzle-orm';
import { compileTable, type DrizzleDb } from '@mariachi/database-postgres';
import { aiMessagesTable } from '../schema/messages';
import { aiSessionsTable } from '../schema/sessions';
import { aiTelemetryTable } from '../schema/telemetry';
import type { AISessionStore, SessionState } from '../session/manager';
import type { AIMessage, AITelemetryEntry } from '../types';

const sessions = compileTable(aiSessionsTable);
const messages = compileTable(aiMessagesTable);
const telemetry = compileTable(aiTelemetryTable);

/** Postgres sessions, messages and telemetry. Requires `@mariachi/ai/schema` tables. */
export class DrizzleAISessionStore implements AISessionStore {
  constructor(private readonly db: DrizzleDb) {}

  async load(id: string): Promise<SessionState | null> {
    const [session] = await this.db.select().from(sessions).where(eq(sessions.id, id)).limit(1);
    if (!session) return null;
    const rows = await this.db.select().from(messages).where(eq(messages.sessionId, id)).orderBy(asc(messages.position));
    return {
      messages: rows.map(toMessage),
      config: {
        model: session.model,
        systemPrompt: session.systemPrompt ?? undefined,
        tenantId: session.tenantId,
        userId: session.userId,
        ...(session.config ?? {}),
      },
      totalInputTokens: session.totalInputTokens,
      totalOutputTokens: session.totalOutputTokens,
    };
  }

  /**
   * Upserts the session and appends messages it does not have yet, in one transaction. The upsert
   * locks the session row, so concurrent saves of one session run one after the other.
   */
  async save(id: string, state: SessionState): Promise<void> {
    const values = {
      id,
      tenantId: state.config.tenantId ?? '',
      userId: state.config.userId ?? '',
      model: state.config.model ?? 'default',
      systemPrompt: state.config.systemPrompt ?? null,
      config: state.config,
      totalInputTokens: state.totalInputTokens,
      totalOutputTokens: state.totalOutputTokens,
      updatedAt: new Date(),
    };
    await this.db.transaction(async (tx) => {
      await tx.insert(sessions).values(values).onConflictDoUpdate({ target: sessions.id, set: values });
      const [{ stored }] = await tx.select({ stored: count() }).from(messages).where(eq(messages.sessionId, id));
      let from = Number(stored);
      if (from > state.messages.length) {
        // History was replaced with a shorter one: rewrite it.
        await tx.delete(messages).where(eq(messages.sessionId, id));
        from = 0;
      }
      const fresh = state.messages.slice(from);
      if (fresh.length === 0) return;
      await tx.insert(messages).values(fresh.map((message, i) => ({
        sessionId: id,
        position: from + i,
        role: message.role,
        content: message.content,
        toolCalls: message.toolCalls ?? null,
      })));
    });
  }

  async recordTelemetry(entry: AITelemetryEntry & { tenantId: string }): Promise<void> {
    await this.db.insert(telemetry).values({
      sessionId: entry.sessionId,
      tenantId: entry.tenantId,
      model: entry.model,
      inputTokens: entry.inputTokens,
      outputTokens: entry.outputTokens,
      latencyMs: Math.round(entry.latencyMs),
      costUsd: entry.costUsd.toFixed(6),
    });
  }
}

function toMessage(row: Record<string, any>): AIMessage {
  return { role: row.role, content: row.content, toolCalls: row.toolCalls ?? undefined };
}
