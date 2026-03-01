import pino from 'pino';
import type { Logger } from '@mariachi/core';

export class PinoLoggerAdapter implements Logger {
  #instance: pino.Logger;

  constructor(options?: { level?: string } | { __pino: pino.Logger }) {
    if (options && '__pino' in options) {
      this.#instance = options.__pino;
    } else {
      this.#instance = pino({ level: options?.level ?? 'info' });
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
