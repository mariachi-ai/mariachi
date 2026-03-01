import type { Logger } from '@mariachi/core';
import type { EventBus } from '@mariachi/events';
import type { Realtime } from '@mariachi/realtime';

export function setupEventBridge(events: EventBus, realtime: Realtime, logger: Logger) {
  events.subscribe('billing.subscription.created', async (payload: any) => {
    logger.info({ tenantId: payload.tenantId }, 'Bridging subscription.created to realtime');
    await realtime.broadcast(`tenant:${payload.tenantId}`, {
      type: 'billing.subscription.created',
      data: payload,
    });
  });

  events.subscribe('notification.created', async (payload: any) => {
    await realtime.sendToUser(payload.userId, {
      type: 'notification',
      data: { id: payload.id, title: payload.title, body: payload.body },
    });
  });

  events.subscribe('chat.message.sent', async (payload: any) => {
    await realtime.broadcast(`chat:${payload.roomId}`, {
      type: 'chat.message',
      data: payload,
    });
  });

  logger.info({}, 'Event bridge configured: billing, notifications, chat');
}
