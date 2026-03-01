import { z } from 'zod';

export const SystemCleanupJob = {
  name: 'system.cleanup',
  schema: z.object({}),
  retry: { attempts: 1, backoff: 'fixed' as const },
  handler: async (_data: object, ctx: { logger: any; traceId: string; attemptNumber: number; jobId: string }) => {
    ctx.logger.info('Running daily cleanup');
  },
};
