import { defineComponent } from '../../contract/component';
import { ref, t } from '../../contract/tokens';

export const checkbox = defineComponent({
  name: 'checkbox',
  title: 'Checkbox',
  category: 'forms',
  description: 'Native checkbox drawn with tokens: checked, indeterminate, invalid and disabled states.',
  useWhen: 'Independent on/off choices, or picking several items from a list. Use a switch for settings that apply immediately.',
  anatomy: {
    '.m-checkbox': 'On <input type="checkbox">',
    ':checked': 'Filled with the accent and a check mark',
    ':indeterminate': 'Dash; set input.indeterminate = true from script',
    '[aria-invalid="true"]': 'Danger border',
    ':disabled': 'Disabled',
  },
  tokens: {
    size: t.length('Box size', '1.125rem'),
    radius: t.length('Corner radius', ref('radius.sm')),
    borderWidth: t.length('Border width', ref('borderWidth.control')),
    border: t.color('Resting border', ref('color.border.strong')),
    hoverBorder: t.color('Border on hover', ref('color.accent.default')),
    invalidBorder: t.color('Border when invalid', ref('color.danger.solid')),
    bg: t.color('Unchecked background', ref('color.bg.surface')),
    checkedBg: t.color('Checked background', ref('color.accent.default')),
    checkedBorder: t.color('Checked border', ref('color.accent.default')),
    mark: t.color('Check mark colour', ref('color.accent.fg')),
    disabledOpacity: t.number('Opacity when disabled', '0.5'),
  },
  contrast: [
    { fg: 'border', bg: 'bg', min: 3 },
    { fg: 'border', bg: 'color.bg.canvas', min: 3 },
    { fg: 'checkedBg', bg: 'color.bg.canvas', min: 3 },
    { fg: 'mark', bg: 'checkedBg', min: 3 },
  ],
  a11y: [
    'Always pair with a <label> (wrap the input or use for/id); clicking the label toggles the box.',
    'Group related checkboxes in a <fieldset> with a <legend> that names the group.',
    'The indeterminate state is only settable from script and is announced as "mixed"; use it for a parent "select all" box.',
  ],
});
