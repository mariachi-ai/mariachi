import { z } from 'zod';
import type { NotificationJob } from './types';

/** Payload of a `notifications.dispatch` job. Use it as the job definition's `schema`. */
export const notificationJobSchema: z.ZodType<NotificationJob> = z.object({
  notificationId: z.string().uuid(),
  channel: z.enum(['email', 'sms', 'push', 'in_app']),
  recipientUserId: z.string().min(1),
  recipientTenantId: z.string().min(1),
  category: z.string().min(1),
  to: z.string().optional(),
  subject: z.string(),
  body: z.string(),
  traceId: z.string(),
  tenantId: z.string().nullable(),
  userId: z.string().nullable(),
});
