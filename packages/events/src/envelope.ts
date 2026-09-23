import { randomUUID } from 'node:crypto';
import { EventsError, createContext, type Context, type Logger } from '@mariachi/core';
import type { EventEnvelope } from './types';

export function createEnvelope<T>(
  ctx: Pick<Context, 'traceId' | 'tenantId' | 'userId' | 'identityType'>,
  type: string,
  payload: T,
  options: { id?: string; source?: string; occurredAt?: Date } = {},
): EventEnvelope<T> {
  return {
    id: options.id ?? randomUUID(),
    type,
    payload,
    occurredAt: (options.occurredAt ?? new Date()).toISOString(),
    traceId: ctx.traceId,
    tenantId: ctx.tenantId,
    userId: ctx.userId,
    identityType: ctx.identityType,
    source: options.source,
  };
}

export function contextFromEnvelope(envelope: EventEnvelope, logger: Logger): Context {
  return createContext({
    traceId: envelope.traceId,
    tenantId: envelope.tenantId,
    userId: envelope.userId,
    identityType: envelope.identityType === 'anonymous' ? 'system' : envelope.identityType,
    logger: logger.child({ event: envelope.type, eventId: envelope.id, traceId: envelope.traceId, tenantId: envelope.tenantId ?? undefined }),
  });
}

export function encodeEnvelope(envelope: EventEnvelope): string {
  return JSON.stringify(envelope);
}

export function decodeEnvelope(raw: string): EventEnvelope {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new EventsError('events/malformed', 'Event message is not valid JSON');
  }
  const e = parsed as Partial<EventEnvelope>;
  if (!e || typeof e !== 'object' || typeof e.id !== 'string' || typeof e.type !== 'string' || typeof e.traceId !== 'string') {
    throw new EventsError('events/malformed', 'Event message is not a mariachi envelope');
  }
  return {
    id: e.id,
    type: e.type,
    payload: e.payload,
    occurredAt: e.occurredAt ?? new Date().toISOString(),
    traceId: e.traceId,
    tenantId: e.tenantId ?? null,
    userId: e.userId ?? null,
    identityType: e.identityType ?? 'system',
    source: e.source,
  };
}
