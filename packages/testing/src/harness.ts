import { getContainer, KEYS } from '@mariachi/core';
import type { Container, Logger } from '@mariachi/core';

// Minimal test logger that captures log entries
class TestHarnessLogger implements Logger {
  readonly entries: Array<{ level: string; obj: Record<string, unknown>; msg?: string }> = [];

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
  child(_bindings: Record<string, unknown>): Logger {
    return this;
  }
}

export interface TestHarness {
  container: Container;
  logger: TestHarnessLogger;
}

export function createTestHarness(): TestHarness {
  const container = getContainer();
  container.clear(); // Reset for clean test state
  const logger = new TestHarnessLogger();
  container.register(KEYS.Logger, logger);
  return { container, logger };
}
