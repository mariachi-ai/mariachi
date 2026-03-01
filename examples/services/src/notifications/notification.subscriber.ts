import type { Context, Logger } from '@mariachi/core';
import { getContainer, KEYS, createContext } from '@mariachi/core';
import type { EventBus } from '@mariachi/events';
import { DefaultNotifications } from '@mariachi/notifications';
import type { EmailAdapter } from '@mariachi/notifications';

export function setupNotificationSubscribers(events: EventBus, logger: Logger) {
  events.subscribe('users.created', async (payload: any) => {
    const ctx = createContext({ logger, traceId: payload._traceId });
    ctx.logger.info({ userId: payload.userId }, 'Sending welcome email');

    // In a real app, resolve the notifications service from the container
    // const notifications = getContainer().resolve<Notifications>(KEYS.Notifications);
    // await notifications.notify(ctx, {
    //   recipientUserId: payload.userId,
    //   recipientTenantId: payload.tenantId,
    //   category: 'onboarding',
    //   template: welcomeTemplate,
    //   variables: { name: payload.name, email: payload.email },
    // });
  });

  events.subscribe('billing.subscription.past_due', async (payload: any) => {
    const ctx = createContext({ logger });
    ctx.logger.warn({ userId: payload.userId }, 'Sending payment warning');
  });

  logger.info({}, 'Notification subscribers registered');
}
