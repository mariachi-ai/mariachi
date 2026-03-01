import type { Logger } from '@mariachi/core';
import type { ShutdownHook } from './types';

export class ShutdownManager {
  private hooks: ShutdownHook[] = [];

  register(hook: ShutdownHook): void {
    this.hooks.push(hook);
  }

  async runAll(logger: Logger): Promise<void> {
    const sorted = [...this.hooks].sort((a, b) => a.priority - b.priority);
    for (const hook of sorted) {
      logger.info({ hook: hook.name }, `Running shutdown hook: ${hook.name}`);
      try {
        await hook.fn();
      } catch (err) {
        logger.error(
          { hook: hook.name, err: err instanceof Error ? err.message : String(err) },
          `Shutdown hook "${hook.name}" failed`
        );
      }
    }
  }

  installSignalHandlers(logger: Logger): void {
    const handler = async () => {
      await this.runAll(logger);
      process.exit(0);
    };
    process.on('SIGTERM', () => {
      handler();
    });
    process.on('SIGINT', () => {
      handler();
    });
  }
}
