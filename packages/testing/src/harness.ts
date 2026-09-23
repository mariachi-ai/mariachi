import { createContainer, setContainer, KEYS, createContext } from '@mariachi/core';
import type { Container, Context, Logger } from '@mariachi/core';
import { TestTracer, TestMetrics } from './adapters/observability';

/** Captures log entries so tests can assert on them. */
export class TestHarnessLogger implements Logger {
  readonly entries: Array<{ level: string; obj: Record<string, unknown>; msg?: string }> = [];

  constructor(private readonly bindings: Record<string, unknown> = {}, private readonly sink?: TestHarnessLogger) {}

  private push(level: string, obj: Record<string, unknown>, msg?: string) {
    (this.sink ?? this).entries.push({ level, obj: { ...this.bindings, ...obj }, msg });
  }

  info(obj: Record<string, unknown>, msg?: string): void {
    this.push('info', obj, msg);
  }
  warn(obj: Record<string, unknown>, msg?: string): void {
    this.push('warn', obj, msg);
  }
  error(obj: Record<string, unknown>, msg?: string): void {
    this.push('error', obj, msg);
  }
  debug(obj: Record<string, unknown>, msg?: string): void {
    this.push('debug', obj, msg);
  }
  child(bindings: Record<string, unknown>): Logger {
    return new TestHarnessLogger({ ...this.bindings, ...bindings }, this.sink ?? this);
  }
}

export interface TestHarness {
  container: Container;
  logger: TestHarnessLogger;
  tracer: TestTracer;
  metrics: TestMetrics;
  /** Instrumentation deps to pass to service constructors explicitly. */
  deps: { logger: Logger; tracer: TestTracer; metrics: TestMetrics };
  ctx(overrides?: Partial<Context>): Context;
  /** Restores the previous global container. */
  restore(): void;
}

/**
 * Installs a fresh global container (never clears a shared one, so parallel test files stay
 * isolated) with a capturing logger, tracer and metrics registered.
 */
export function createTestHarness(): TestHarness {
  const container = createContainer();
  const previous = setContainer(container);
  const logger = new TestHarnessLogger();
  const tracer = new TestTracer();
  const metrics = new TestMetrics();
  container.register(KEYS.Logger, logger);
  container.register(KEYS.Tracer, tracer);
  container.register(KEYS.Metrics, metrics);
  return {
    container,
    logger,
    tracer,
    metrics,
    deps: { logger, tracer, metrics },
    ctx: (overrides = {}) => createContext({ logger, userId: 'test-user', tenantId: 'test-tenant', scopes: [], identityType: 'user', ...overrides }),
    restore: () => void setContainer(previous),
  };
}
