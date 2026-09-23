import type { Logger } from '@mariachi/core';
import { contextBindings } from './pino';

const LEVELS = { debug: 10, info: 20, warn: 30, error: 40 } as const;
type Level = keyof typeof LEVELS;

export class ConsoleLoggerAdapter implements Logger {
  #bindings: Record<string, unknown>;
  #level: Level;

  constructor(bindings: Record<string, unknown> = {}, level = 'info') {
    this.#bindings = { ...bindings };
    this.#level = (level in LEVELS ? level : 'info') as Level;
  }

  #log(level: Level, obj: Record<string, unknown>, msg?: string): void {
    if (LEVELS[level] < LEVELS[this.#level]) return;
    const merged = { ...contextBindings(), ...this.#bindings, ...obj };
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
    return new ConsoleLoggerAdapter({ ...this.#bindings, ...bindings }, this.#level);
  }
}
