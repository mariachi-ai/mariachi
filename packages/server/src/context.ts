import { createContext, type Context } from '@mariachi/core';
import type { RequestContext } from './types';

/** Who the policy layer (api-facade, webhooks) decided the caller is. */
export interface RequestIdentity {
  userId?: string | null;
  tenantId?: string | null;
  scopes?: string[];
  identityType: string;
  apiKeyId?: string;
  sessionId?: string;
}

const TRACEPARENT_RE = /^[\da-f]{2}-([\da-f]{32})-[\da-f]{16}-[\da-f]{2}$/;

/** Extracts the trace id from a W3C `traceparent` header, if valid. */
export function traceIdFromTraceparent(header: string | undefined): string | undefined {
  const match = header ? TRACEPARENT_RE.exec(header.trim().toLowerCase()) : null;
  if (!match || /^0+$/.test(match[1]!)) return undefined;
  return match[1];
}

/**
 * The single way to turn a transport-level `RequestContext` into an application `Context`.
 * Policy layers call this after authentication; the transport calls it with no identity.
 */
export function contextFromRequest(serverCtx: RequestContext, identity?: RequestIdentity, bindings: Record<string, unknown> = {}): Context {
  const extra = identity?.userId || identity?.tenantId ? { userId: identity.userId ?? undefined, tenantId: identity.tenantId ?? undefined } : {};
  const withBindings = { ...extra, ...bindings };
  return createContext({
    traceId: serverCtx.traceId,
    logger: Object.keys(withBindings).length ? serverCtx.logger.child(withBindings) : serverCtx.logger,
    userId: identity?.userId ?? null,
    tenantId: identity?.tenantId ?? null,
    scopes: identity?.scopes ?? [],
    identityType: identity?.identityType ?? 'anonymous',
    apiKeyId: identity?.apiKeyId,
    sessionId: identity?.sessionId,
    server: serverCtx.server,
  });
}
