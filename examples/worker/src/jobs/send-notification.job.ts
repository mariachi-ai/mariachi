import { z } from 'zod';
import type { JobDefinition, JobContext } from '@mariachi/jobs';

const SendNotificationPayload = z.object({
  notificationId: z.string(),
  channel: z.enum(['email', 'sms', 'push', 'in_app']),
  recipientUserId: z.string(),
  subject: z.string(),
  body: z.string(),
  to: z.string(),
});

export const SendNotificationJob: JobDefinition<z.infer<typeof SendNotificationPayload>> = {
  name: 'notifications.deliver',
  schema: SendNotificationPayload,
  retry: { attempts: 3, backoff: 'exponential', delay: 5000 },
  handler: async (data, ctx: JobContext) => {
    ctx.logger.info({
      notificationId: data.notificationId,
      channel: data.channel,
      to: data.to,
      attempt: ctx.attemptNumber,
    }, 'Delivering notification');

    switch (data.channel) {
      case 'email':
        // const notifications = getContainer().resolve<Notifications>(KEYS.Notifications);
        // await notifications.sendEmail(context, { to: data.to, subject: data.subject, html: data.body });
        ctx.logger.info({ notificationId: data.notificationId }, 'Email delivered');
        break;
      case 'sms':
        ctx.logger.info({ notificationId: data.notificationId }, 'SMS delivered');
        break;
      case 'push':
        ctx.logger.info({ notificationId: data.notificationId }, 'Push delivered');
        break;
      case 'in_app':
        ctx.logger.info({ notificationId: data.notificationId }, 'In-app notification stored');
        break;
    }
  },
};
