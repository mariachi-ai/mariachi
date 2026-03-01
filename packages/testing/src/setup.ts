import type { Logger } from '@mariachi/core';
import { TestCacheClient } from './adapters/cache';
import { TestEventBus } from './adapters/events';
import { TestJobQueue } from './adapters/jobs';
import { TestStorageClient } from './adapters/storage';
import { TestEmailAdapter } from './adapters/notifications';

export interface LogEntry {
  level: 'info' | 'warn' | 'error' | 'debug';
  obj: Record<string, unknown>;
  msg?: string;
}

export class TestLogger implements Logger {
  private readonly entries: LogEntry[] = [];

  info(obj: Record<string, unknown>, msg?: string): void {
    this.entries.push({ level: 'info', obj, msg });
  }

  warn(obj: Record<string, unknown>, msg?: string): void {
    this.entries.push({ level: 'warn', obj, msg });
  }

  error(obj: Record<string, unknown>, msg?: string): void {
    this.entries.push({ level: 'error', obj, msg });
  }

  debug(obj: Record<string, unknown>, msg?: string): void {
    this.entries.push({ level: 'debug', obj, msg });
  }

  child(bindings: Record<string, unknown>): Logger {
    const self = this;
    return {
      info(obj: Record<string, unknown>, msg?: string) {
        self.info({ ...bindings, ...obj }, msg);
      },
      warn(obj: Record<string, unknown>, msg?: string) {
        self.warn({ ...bindings, ...obj }, msg);
      },
      error(obj: Record<string, unknown>, msg?: string) {
        self.error({ ...bindings, ...obj }, msg);
      },
      debug(obj: Record<string, unknown>, msg?: string) {
        self.debug({ ...bindings, ...obj }, msg);
      },
      child(extra: Record<string, unknown>) {
        return self.child({ ...bindings, ...extra });
      },
    };
  }

  getLogEntries(): LogEntry[] {
    return [...this.entries];
  }
}

export interface TestSetup {
  logger: TestLogger;
  cache: TestCacheClient;
  events: TestEventBus;
  jobs: TestJobQueue;
  storage: TestStorageClient;
  email: TestEmailAdapter;
}

export function createTestSetup(): TestSetup {
  return {
    logger: new TestLogger(),
    cache: new TestCacheClient(),
    events: new TestEventBus(),
    jobs: new TestJobQueue(),
    storage: new TestStorageClient(),
    email: new TestEmailAdapter(),
  };
}
