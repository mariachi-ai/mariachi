import type { Logger } from '@mariachi/core';

export class ConsoleLoggerAdapter implements Logger {
  #bindings: Record<string, unknown> = {};

  constructor(bindings: Record<string, unknown> = {}) {
    this.#bindings = { ...bindings };
  }

  #log(level: 'info' | 'warn' | 'error' | 'debug', obj: Record<string, unknown>, msg?: string): void {
    const merged = { ...this.#bindings, ...obj };
    const output = Object.keys(merged).length > 0 ? [merged, msg].filter(Boolean) : [msg ?? ''];
    console[level](...output);
  }

  info(obj: Record<string, unknown>, msg?: string): void {
    this.#log('info', obj, msg);
  }

  warn(obj: Record<string, unknown>, msg?: string): void {
    this.#log('warn', obj, msg);
  }

  error(obj: Record<string, unknown>, msg?: string): void {
    this.#log('error', obj, msg);
  }

  debug(obj: Record<string, unknown>, msg?: string): void {
    this.#log('debug', obj, msg);
  }

  child(bindings: Record<string, unknown>): Logger {
    return new ConsoleLoggerAdapter({ ...this.#bindings, ...bindings });
  }
}
