import { defineComponent } from '../../contract/component';
import { ref, t } from '../../contract/tokens';

export const input = defineComponent({
  name: 'input',
  title: 'Input',
  category: 'forms',
  description: 'Single-line text input and multi-line textarea, with sizes, invalid and disabled states.',
  useWhen: 'Free-text entry. Wrap it in .m-field to give it a label, hint and error.',
  anatomy: {
    '.m-input': 'On <input> (text, email, search, number, password, …) or <textarea>',
    '[data-size]': 'sm | md (default) | lg',
    '[aria-invalid="true"] / :user-invalid': 'Invalid: danger border',
    ':disabled': 'Disabled',
    'textarea.m-input': 'Grows with its content where field-sizing is supported; resizable vertically',
  },
  tokens: {
    fontFamily: t.fontFamily('Text family', ref('font.body.family')),
    fontSize: t.length('Text size', ref('control.fontSize')),
    bg: t.color('Background', ref('color.bg.surface')),
    fg: t.color('Text colour', ref('color.fg.default')),
    placeholder: t.color('Placeholder colour', ref('color.fg.subtle')),
    border: t.color('Resting border', ref('color.border.strong')),
    hoverBorder: t.color('Border on hover', ref('color.fg.muted')),
    focusBorder: t.color('Border while focused', ref('color.accent.default')),
    invalidBorder: t.color('Border when invalid', ref('color.danger.solid')),
    disabledBg: t.color('Background when disabled', ref('color.bg.sunken')),
    disabledOpacity: t.number('Opacity when disabled', '0.6'),
    radius: t.length('Corner radius', ref('radius.control')),
    borderWidth: t.length('Border width', ref('borderWidth.control')),
    shadow: t.shadow('Resting shadow', 'none'),
    height: {
      sm: t.length('Small height', ref('control.height.sm')),
      md: t.length('Default height', ref('control.height.md')),
      lg: t.length('Large height', ref('control.height.lg')),
    },
    paddingX: {
      sm: t.length('Small horizontal padding', ref('control.paddingX.sm')),
      md: t.length('Default horizontal padding', ref('control.paddingX.md')),
      lg: t.length('Large horizontal padding', ref('control.paddingX.lg')),
    },
    paddingY: t.length('Textarea vertical padding', ref('space.2')),
    textareaMinHeight: t.length('Minimum textarea height', '5rem'),
  },
  contrast: [
    { fg: 'fg', bg: 'bg', min: 4.5 },
    { fg: 'placeholder', bg: 'bg', min: 4.5 },
    { fg: 'border', bg: 'bg', min: 3 },
    { fg: 'border', bg: 'color.bg.canvas', min: 3 },
    { fg: 'focusBorder', bg: 'bg', min: 3 },
  ],
  a11y: [
    'Every input needs a visible <label for> (use .m-field-label); a placeholder is not a label.',
    'Mark errors with aria-invalid="true" and point aria-describedby at the .m-field-error element so the message is announced.',
    'Use the right type and autocomplete attributes (type="email", autocomplete="email") so mobile keyboards and autofill work.',
    'Disabled inputs are skipped by the tab order; use readonly when the value must stay focusable and copyable.',
  ],
});
