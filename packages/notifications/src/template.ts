import type { NotificationTemplate, RenderedNotification } from './types';

const HTML_ESCAPES: Record<string, string> = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (c) => HTML_ESCAPES[c]!);
}

/**
 * Fills `{{name}}` placeholders. With `html: true` (email bodies) values are HTML-escaped;
 * `{{{name}}}` inserts a value unescaped, for HTML you built yourself. Subjects never contain
 * line breaks, so a variable cannot add mail headers. Unknown placeholders are left as is.
 */
export function renderTemplate(
  template: NotificationTemplate,
  variables: Record<string, string>,
  options: { html?: boolean } = {},
): RenderedNotification {
  const fill = (text: string, escapeValues: boolean) =>
    text.replace(/\{\{\{(\w+)\}\}\}|\{\{(\w+)\}\}/g, (match, raw: string | undefined, name: string | undefined) => {
      const key = (raw ?? name)!;
      if (!Object.prototype.hasOwnProperty.call(variables, key)) return match;
      const value = variables[key]!;
      return raw || !escapeValues ? value : escapeHtml(value);
    });
  return {
    subject: fill(template.subject, false).replace(/[\r\n]+/g, ' '),
    body: fill(template.body, options.html ?? false),
  };
}
