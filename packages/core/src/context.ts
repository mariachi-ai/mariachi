export interface Logger {
  info(obj: Record<string, unknown>, msg?: string): void;
  warn(obj: Record<string, unknown>, msg?: string): void;
  error(obj: Record<string, unknown>, msg?: string): void;
  debug(obj: Record<string, unknown>, msg?: string): void;
  child(bindings: Record<string, unknown>): Logger;
}

export interface Context {
  traceId: string;
  userId: string | null;
  tenantId: string | null;
  scopes: string[];
  identityType: string;
  apiKeyId?: string;
  sessionId?: string;
  logger: Logger;
  server?: string;
}

export function createContext(overrides: Partial<Context> & { logger: Logger }): Context {
  return {
    traceId: overrides.traceId ?? crypto.randomUUID(),
    userId: overrides.userId ?? null,
    tenantId: overrides.tenantId ?? null,
    scopes: overrides.scopes ?? [],
    identityType: overrides.identityType ?? 'anonymous',
    apiKeyId: overrides.apiKeyId,
    sessionId: overrides.sessionId,
    logger: overrides.logger,
    server: overrides.server,
  };
}
