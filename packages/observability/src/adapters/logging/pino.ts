import pino from 'pino';
import type { Logger } from '@mariachi/core';
import { currentContext } from '@mariachi/core';

/** Adds the ambient Context's identifiers to every log line. */
export function contextBindings(): Record<string, unknown> {
  const ctx = currentContext();
  if (!ctx) return {};
  const bindings: Record<string, unknown> = { traceId: ctx.traceId };
  if (ctx.tenantId) bindings.tenantId = ctx.tenantId;
  if (ctx.userId) bindings.userId = ctx.userId;
  return bindings;
}

export interface PinoLoggerOptions {
  level?: string;
  pretty?: boolean;
  redact?: string[];
}

const DEFAULT_REDACT = [
  'password',
  '*.password',
  'token',
  '*.token',
  'secret',
  '*.secret',
  'authorization',
  '*.authorization',
  'headers.authorization',
  'headers.cookie',
  '*.apiKey',
];

export class PinoLoggerAdapter implements Logger {
  #instance: pino.Logger;

  constructor(options?: PinoLoggerOptions | { __pino: pino.Logger }) {
    if (options && '__pino' in options) {
      this.#instance = options.__pino;
    } else {
      this.#instance = pino({
        level: options?.level ?? 'info',
        mixin: contextBindings,
        redact: { paths: options?.redact ?? DEFAULT_REDACT, censor: '[REDACTED]' },
        serializers: { err: pino.stdSerializers.err, error: pino.stdSerializers.err },
      });
    }
  }

  info(obj: Record<string, unknown>, msg?: string): void {
    this.#instance.info(obj, msg);
  }

  warn(obj: Record<string, unknown>, msg?: string): void {
    this.#instance.warn(obj, msg);
  }

  error(obj: Record<string, unknown>, msg?: string): void {
    this.#instance.error(obj, msg);
  }

  debug(obj: Record<string, unknown>, msg?: string): void {
    this.#instance.debug(obj, msg);
  }

  child(bindings: Record<string, unknown>): Logger {
    return new PinoLoggerAdapter({ __pino: this.#instance.child(bindings) });
  }
}
