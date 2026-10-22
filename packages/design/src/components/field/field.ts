import { defineComponent } from '../../contract/component';
import { ref, t } from '../../contract/tokens';

export const field = defineComponent({
  name: 'field',
  title: 'Field',
  category: 'forms',
  description: 'Wraps a control with its label, hint, error and required marker; an inline layout serves checkbox, radio and switch rows.',
  useWhen: 'Every form control. It keeps label, hint and error spacing consistent and lines up inline controls with their text.',
  anatomy: {
    '.m-field': 'Wrapper (a <div>, or a <label> for inline rows)',
    '.m-field-label': 'The <label>; gets a required marker when the field contains a required control or has [data-required]',
    '.m-field-hint': 'Help text under the control; reference it from aria-describedby',
    '.m-field-error': 'Error message; reference it from aria-describedby and set aria-invalid on the control',
    '[data-layout="inline"]': 'Control and text in a row (checkbox, radio, switch)',
  },
  tokens: {
    gap: t.length('Space between label, control, hint and error', ref('space.2')),
    inlineGap: t.length('Space between an inline control and its text', ref('space.2')),
    labelFg: t.color('Label colour', ref('color.fg.default')),
    labelFontSize: t.length('Label size', ref('font.size.sm')),
    labelFontWeight: t.fontWeight('Label weight', ref('font.weight.medium')),
    labelTransform: t.keyword('Label text-transform', 'none'),
    labelTracking: t.length('Label letter spacing', ref('font.tracking.normal')),
    hintFg: t.color('Hint colour', ref('color.fg.muted')),
    hintFontSize: t.length('Hint and error size', ref('font.size.sm')),
    errorFg: t.color('Error colour', ref('color.danger.fg')),
    errorFontWeight: t.fontWeight('Error weight', ref('font.weight.medium')),
    requiredFg: t.color('Required marker colour', ref('color.danger.fg')),
    requiredMarker: t.keyword('Required marker content (a CSS string)', '" *"'),
  },
  contrast: [
    { fg: 'labelFg', bg: 'color.bg.canvas', min: 4.5 },
    { fg: 'labelFg', bg: 'color.bg.surface', min: 4.5 },
    { fg: 'hintFg', bg: 'color.bg.canvas', min: 4.5 },
    { fg: 'hintFg', bg: 'color.bg.surface', min: 4.5 },
    { fg: 'errorFg', bg: 'color.bg.canvas', min: 4.5 },
    { fg: 'errorFg', bg: 'color.bg.surface', min: 4.5 },
  ],
  a11y: [
    'Connect the label with for/id (or wrap the control in the label) so clicking it focuses the control.',
    'Point the control\'s aria-describedby at the hint and error ids so both are read after the label.',
    'The required marker is visual only; also set the required attribute on the control so it is announced.',
    'Don\'t rely on colour alone for errors: the .m-field-error text says what is wrong and how to fix it.',
  ],
});
