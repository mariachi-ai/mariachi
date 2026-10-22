import { defineComponent } from '../../contract/component';
import { ref, t } from '../../contract/tokens';

export const select = defineComponent({
  name: 'select',
  title: 'Select',
  category: 'forms',
  description: 'Native <select> styled to match inputs, with a CSS-only chevron.',
  useWhen: 'Choosing one option from a short, known list. Use radios for two to four options that should all stay visible.',
  anatomy: {
    '.m-select': 'On a native <select>',
    '[data-size]': 'sm | md (default) | lg',
    '[aria-invalid="true"] / :user-invalid': 'Invalid: danger border',
    '[multiple]': 'List box: no chevron, auto height',
  },
  tokens: {
    fontFamily: t.fontFamily('Text family', ref('components.input.fontFamily')),
    fontSize: t.length('Text size', ref('components.input.fontSize')),
    bg: t.color('Background', ref('components.input.bg')),
    fg: t.color('Text and chevron colour', ref('components.input.fg')),
    border: t.color('Resting border', ref('components.input.border')),
    hoverBorder: t.color('Border on hover', ref('components.input.hoverBorder')),
    focusBorder: t.color('Border while focused', ref('components.input.focusBorder')),
    invalidBorder: t.color('Border when invalid', ref('components.input.invalidBorder')),
    disabledBg: t.color('Background when disabled', ref('components.input.disabledBg')),
    disabledOpacity: t.number('Opacity when disabled', ref('components.input.disabledOpacity')),
    radius: t.length('Corner radius', ref('components.input.radius')),
    borderWidth: t.length('Border width', ref('components.input.borderWidth')),
    shadow: t.shadow('Resting shadow', ref('components.input.shadow')),
    chevronSize: t.length('Size of each half of the chevron', '0.3125rem'),
    height: {
      sm: t.length('Small height', ref('components.input.height.sm')),
      md: t.length('Default height', ref('components.input.height.md')),
      lg: t.length('Large height', ref('components.input.height.lg')),
    },
    paddingX: {
      sm: t.length('Small horizontal padding', ref('components.input.paddingX.sm')),
      md: t.length('Default horizontal padding', ref('components.input.paddingX.md')),
      lg: t.length('Large horizontal padding', ref('components.input.paddingX.lg')),
    },
  },
  contrast: [
    { fg: 'fg', bg: 'bg', min: 4.5 },
    { fg: 'border', bg: 'bg', min: 3 },
  ],
  a11y: [
    'Give the select a <label for>; the first <option> is not a label.',
    'Native <select> keeps keyboard, screen reader and mobile picker behaviour; prefer it over a custom listbox.',
    'For a required choice with no sensible default, start with <option value="" disabled selected>Choose…</option> and the required attribute.',
  ],
});
