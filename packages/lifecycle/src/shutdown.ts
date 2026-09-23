import type { Logger } from '@mariachi/core';
import { withTimeout } from '@mariachi/core';
import type { ShutdownHook } from './types';

export interface SignalHandlerOptions {
  /** Overall drain budget. Exceeding it exits with code 1. */
  timeoutMs?: number;
  signals?: NodeJS.Signals[];
  /** Injected for tests. */
  exit?: (code: number) => void;
  onBeforeShutdown?: () => void;
}

export class ShutdownManager {
  private hooks: ShutdownHook[] = [];
  private running: Promise<boolean> | null = null;
  private listeners: Array<[NodeJS.Signals, () => void]> = [];

  register(hook: ShutdownHook): void {
    this.hooks.push(hook);
  }

  get isShuttingDown(): boolean {
    return this.running !== null;
  }

  /**
   * Runs every hook, highest priority first. Idempotent: concurrent callers share one run.
   * Resolves `true` if every hook succeeded.
   */
  runAll(logger: Logger): Promise<boolean> {
    if (!this.running) this.running = this.execute(logger);
    return this.running;
  }

  private async execute(logger: Logger): Promise<boolean> {
    const sorted = [...this.hooks].sort((a, b) => b.priority - a.priority);
    let ok = true;
    for (const hook of sorted) {
      logger.info({ hook: hook.name }, `Running shutdown hook: ${hook.name}`);
      try {
        const run = hook.fn();
        await (hook.timeoutMs ? withTimeout(run, hook.timeoutMs, 'lifecycle/shutdown-timeout') : run);
      } catch (err) {
        ok = false;
        logger.error({ hook: hook.name, err }, `Shutdown hook "${hook.name}" failed`);
      }
    }
    return ok;
  }

  installSignalHandlers(logger: Logger, options: SignalHandlerOptions = {}): () => void {
    const { timeoutMs = 15_000, signals = ['SIGTERM', 'SIGINT'], exit = (code) => process.exit(code) } = options;
    let received = false;

    const handler = (signal: NodeJS.Signals) => () => {
      if (received) {
        logger.warn({ signal }, 'Second shutdown signal received, forcing exit');
        exit(1);
        return;
      }
      received = true;
      logger.info({ signal }, 'Shutdown signal received, draining');
      options.onBeforeShutdown?.();
      withTimeout(this.runAll(logger), timeoutMs, 'lifecycle/shutdown-timeout')
        .then((ok) => exit(ok ? 0 : 1))
        .catch((err) => {
          logger.error({ err }, 'Shutdown did not complete in time');
          exit(1);
        });
    };

    for (const signal of signals) {
      const fn = handler(signal);
      process.on(signal, fn);
      this.listeners.push([signal, fn]);
    }
    return () => this.removeSignalHandlers();
  }

  removeSignalHandlers(): void {
    for (const [signal, fn] of this.listeners) process.off(signal, fn);
    this.listeners = [];
  }
}
