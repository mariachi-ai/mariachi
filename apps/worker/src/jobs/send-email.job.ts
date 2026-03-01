import { z } from 'zod';

export const SendEmailJob = {
  name: 'notifications.send-email',
  schema: z.object({ userId: z.string(), templateId: z.string(), to: z.string().email() }),
  retry: { attempts: 3, backoff: 'exponential' as const },
  handler: async (data: { userId: string; templateId: string; to: string }, ctx: { logger: any; traceId: string; attemptNumber: number; jobId: string }) => {
    ctx.logger.info({ to: data.to, templateId: data.templateId }, 'Sending email');
  },
};
