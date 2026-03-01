import type { Logger } from '@mariachi/core';
import { LifecycleError } from '@mariachi/core';
import type { StartupHook } from './types';

export class StartupManager {
  private hooks: StartupHook[] = [];

  register(hook: StartupHook): void {
    this.hooks.push(hook);
  }

  async runAll(logger: Logger): Promise<void> {
    const sorted = [...this.hooks].sort((a, b) => a.priority - b.priority);
    for (const hook of sorted) {
      logger.info({ hook: hook.name }, `Running startup hook: ${hook.name}`);
      try {
        await hook.fn();
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        throw new LifecycleError('startup/failed', `Startup hook "${hook.name}" failed: ${message}`, {
          hook: hook.name,
          cause: err,
        });
      }
    }
  }
}
