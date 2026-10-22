import { defineComponent } from '../../contract/component';
import { ref, t } from '../../contract/tokens';

export const alert = defineComponent({
  name: 'alert',
  title: 'Alert',
  category: 'feedback',
  description: 'An inline message about the page or a section: success, warning, error or information.',
  useWhen: 'A message that stays on the page until the cause changes. Use a toast for transient confirmations.',
  anatomy: {
    '.m-alert': 'The container; add role="alert" for urgent errors or role="status" for the rest',
    '.m-alert-icon': 'Optional leading icon (aria-hidden)',
    '.m-alert-content': 'Wraps title, body and actions',
    '.m-alert-title': 'Short summary',
    '.m-alert-body': 'Details',
    '.m-alert-actions': 'Optional buttons or links',
    '[data-tone]': 'neutral (default) | accent | success | warning | danger | info',
  },
  tokens: {
    bg: t.color('Neutral background', ref('color.bg.sunken')),
    fg: t.color('Neutral text', ref('color.fg.default')),
    border: t.color('Neutral border', ref('color.border.default')),
    borderWidth: t.length('Border width', ref('borderWidth.thin')),
    accentWidth: t.length('Width of the leading (inline-start) border', ref('components.alert.borderWidth')),
    radius: t.length('Corner radius', ref('radius.container')),
    shadow: t.shadow('Shadow', 'none'),
    padding: t.length('Padding', ref('space.4')),
    gap: t.length('Space between icon and content', ref('space.3')),
    fontSize: t.length('Text size', ref('font.size.sm')),
    titleWeight: t.fontWeight('Title weight', ref('font.weight.semibold')),
  },
  contrast: [{ fg: 'fg', bg: 'bg', min: 4.5 }],
  a11y: [
    'role="alert" interrupts screen readers: use it only for errors that need immediate attention; use role="status" otherwise.',
    'Alerts present on page load are not announced; insert the element (or its text) dynamically when it should be.',
    'Don\'t rely on colour alone: keep a title or icon that says what kind of message it is.',
    'Mark decorative icons aria-hidden="true".',
  ],
});
