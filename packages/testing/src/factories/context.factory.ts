import { createContext } from '@mariachi/core';
import type { Context } from '@mariachi/core';
import { TestLogger } from '../setup';

export function createTestContext(overrides?: Partial<Context> & { logger?: TestLogger }): Context {
  const logger = overrides?.logger ?? new TestLogger();
  return createContext({
    traceId: overrides?.traceId ?? crypto.randomUUID(),
    userId: overrides?.userId ?? null,
    tenantId: overrides?.tenantId ?? null,
    scopes: overrides?.scopes ?? [],
    identityType: overrides?.identityType ?? 'anonymous',
    apiKeyId: overrides?.apiKeyId,
    sessionId: overrides?.sessionId,
    logger,
    server: overrides?.server,
  });
}
