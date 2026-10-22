import { defineComponent } from '../../contract/component';
import { ref, t } from '../../contract/tokens';

export const radio = defineComponent({
  name: 'radio',
  title: 'Radio',
  category: 'forms',
  description: 'Native radio button drawn with tokens: checked, invalid and disabled states.',
  useWhen: 'Choosing exactly one of two to five options that should all stay visible. Use a select for longer lists.',
  anatomy: {
    '.m-radio': 'On <input type="radio">; give every radio in a group the same name',
    ':checked': 'Accent fill with a centre dot',
    '[aria-invalid="true"]': 'Danger border',
    ':disabled': 'Disabled',
  },
  tokens: {
    size: t.length('Circle size', ref('components.checkbox.size')),
    borderWidth: t.length('Border width', ref('components.checkbox.borderWidth')),
    border: t.color('Resting border', ref('components.checkbox.border')),
    hoverBorder: t.color('Border on hover', ref('components.checkbox.hoverBorder')),
    invalidBorder: t.color('Border when invalid', ref('components.checkbox.invalidBorder')),
    bg: t.color('Unchecked background', ref('components.checkbox.bg')),
    checkedBg: t.color('Checked background', ref('components.checkbox.checkedBg')),
    checkedBorder: t.color('Checked border', ref('components.checkbox.checkedBorder')),
    dot: t.color('Centre dot colour', ref('components.checkbox.mark')),
    disabledOpacity: t.number('Opacity when disabled', ref('components.checkbox.disabledOpacity')),
  },
  contrast: [
    { fg: 'border', bg: 'bg', min: 3 },
    { fg: 'checkedBg', bg: 'color.bg.canvas', min: 3 },
    { fg: 'dot', bg: 'checkedBg', min: 3 },
  ],
  a11y: [
    'Wrap a radio group in a <fieldset> with a <legend>; screen readers announce the legend with each option.',
    'Give every radio in the group the same name so arrow keys move between them and only one tab stop is used.',
    'Pair each radio with a <label>.',
  ],
});
