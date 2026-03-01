import type { NotificationTemplate, RenderedNotification } from './types';

export function renderTemplate(template: NotificationTemplate, variables: Record<string, string>): RenderedNotification {
  let subject = template.subject;
  let body = template.body;

  for (const [key, value] of Object.entries(variables)) {
    const placeholder = `{{${key}}}`;
    subject = subject.replaceAll(placeholder, value);
    body = body.replaceAll(placeholder, value);
  }

  return { subject, body };
}
