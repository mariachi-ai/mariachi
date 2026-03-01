import { ResendEmailAdapter } from './adapters/email/resend';
import { NotificationError } from '@mariachi/core';
import type { NotificationsConfig } from './notifications';
import type {
  EmailAdapter,
  EmailMessage,
  InAppNotification,
  InAppNotificationStore,
  NotificationTemplate,
  RenderedNotification,
  NotificationChannel,
  NotificationIntent,
  DeliveryRecord,
  SMSAdapter,
  PushAdapter,
  NotificationPreferencesStore,
} from './types';

export type {
  NotificationsConfig,
  EmailMessage,
  EmailAdapter,
  InAppNotification,
  InAppNotificationStore,
  NotificationTemplate,
  RenderedNotification,
  NotificationChannel,
  NotificationIntent,
  DeliveryRecord,
  SMSAdapter,
  PushAdapter,
  NotificationPreferencesStore,
};
export { renderTemplate } from './template';

export { ResendEmailAdapter } from './adapters/email/resend';

export function createEmailAdapter(config: { email?: { adapter: string; apiKey?: string; from?: string } }): EmailAdapter {
  const emailConfig = config.email;
  if (!emailConfig) {
    throw new NotificationError('notifications/missing-email-config', 'Email config is required');
  }
  if (emailConfig.adapter === 'resend') {
    if (!emailConfig.apiKey) {
      throw new NotificationError('notifications/missing-api-key', 'Resend adapter requires apiKey');
    }
    return new ResendEmailAdapter({
      apiKey: emailConfig.apiKey,
      from: emailConfig.from,
    });
  }
  throw new NotificationError('notifications/unknown-adapter', `Unknown email adapter: ${emailConfig.adapter}`);
}

export { Notifications, DefaultNotifications } from './notifications';
export * from './schema/index';
