import type { Logger } from '@mariachi/core';
import { PinoLoggerAdapter } from './adapters/logging/pino';
import { ConsoleLoggerAdapter } from './adapters/logging/console';

export function createLogger(config?: { adapter?: string; level?: string }): Logger {
  const adapter = config?.adapter ?? 'pino';
  if (adapter === 'pino') {
    return new PinoLoggerAdapter({ level: config?.level });
  }
  return new ConsoleLoggerAdapter();
}
