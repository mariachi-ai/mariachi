import { defineComponent } from '../../contract/component';
import { ref, t } from '../../contract/tokens';

export const switchComponent = defineComponent({
  name: 'switch',
  title: 'Switch',
  category: 'forms',
  description: 'On/off toggle built on a native checkbox with role="switch".',
  useWhen: 'A setting that takes effect immediately (enable notifications, dark mode). Use a checkbox for choices submitted with a form.',
  anatomy: {
    '.m-switch': 'On <input type="checkbox" role="switch">',
    ':checked': 'Accent track, thumb moved to the end',
    '[data-size]': 'sm | md (default)',
    ':disabled': 'Disabled',
  },
  tokens: {
    width: t.length('Track width', '2.5rem'),
    height: t.length('Track height', '1.5rem'),
    smWidth: t.length('Small track width', '2rem'),
    smHeight: t.length('Small track height', '1.25rem'),
    radius: t.length('Track and thumb radius', ref('radius.full')),
    borderWidth: t.length('Track border width', ref('borderWidth.control')),
    border: t.color('Track border colour', 'transparent'),
    trackBg: t.color('Track colour when off', ref('color.border.strong')),
    trackCheckedBg: t.color('Track colour when on', ref('color.accent.default')),
    thumbBg: t.color('Thumb colour when off', ref('color.bg.surface')),
    thumbCheckedBg: t.color('Thumb colour when on', ref('color.accent.fg')),
    thumbInset: t.length('Gap between thumb and track edge', '2px'),
    thumbShadow: t.shadow('Thumb shadow', ref('shadow.sm')),
    disabledOpacity: t.number('Opacity when disabled', '0.5'),
  },
  contrast: [
    { fg: 'trackBg', bg: 'color.bg.canvas', min: 3 },
    { fg: 'trackCheckedBg', bg: 'color.bg.canvas', min: 3 },
    { fg: 'thumbBg', bg: 'trackBg', min: 3 },
    { fg: 'thumbCheckedBg', bg: 'trackCheckedBg', min: 3 },
  ],
  a11y: [
    'Use <input type="checkbox" role="switch"> so screen readers announce "switch, on/off" and Space toggles it.',
    'Pair with a <label> that names the setting, not the state ("Email alerts", not "On").',
    'Apply the change immediately and don\'t require a separate save; if the change can fail, revert the switch and explain why.',
  ],
});
