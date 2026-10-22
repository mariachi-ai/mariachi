import { defineComponent } from '../../contract/component';
import { ref, t } from '../../contract/tokens';

export const progress = defineComponent({
  name: 'progress',
  title: 'Progress and meter',
  category: 'feedback',
  description: 'Native <progress> for task completion (with an indeterminate state) and <meter> for a measurement within a range.',
  useWhen: 'Progress: uploads, indexing, multi-step jobs. Meter: quota or capacity used, where high values can be good or bad.',
  anatomy: {
    'progress.m-progress': 'Completion; omit value for the indeterminate state',
    'meter.m-meter': 'A measurement; low/high/optimum pick the success, warning or danger colour',
    '[data-size]': 'sm | md (default) | lg (bar height)',
  },
  tokens: {
    height: {
      sm: t.length('Small bar height', '0.25rem'),
      md: t.length('Default bar height', '0.5rem'),
      lg: t.length('Large bar height', '0.75rem'),
    },
    radius: t.length('Bar radius', ref('radius.full')),
    borderWidth: t.length('Track border width', '0px'),
    border: t.color('Track border colour', ref('color.border.strong')),
    track: t.color('Unfilled track', ref('color.bg.sunken')),
    fill: t.color('Progress fill', ref('color.accent.text')),
    optimum: t.color('Meter value in the optimum range', ref('color.success.solid')),
    suboptimum: t.color('Meter value in the suboptimal range', ref('color.warning.solid')),
    bad: t.color('Meter value in the worst range', ref('color.danger.solid')),
    duration: t.duration('Indeterminate sweep and value transitions', 'calc(var(--m-motion-duration-slow) * 5)'),
  },
  contrast: [
    { fg: 'fill', bg: 'track', min: 3 },
    { fg: 'fill', bg: 'color.bg.surface', min: 3 },
  ],
  a11y: [
    'Native <progress> and <meter> carry their own roles and values; give each a visible <label for> or aria-label.',
    'Omit value on <progress> while the total is unknown; screen readers announce it as busy.',
    'Meter colours change with the range, so also show the number as text ("82% of quota").',
  ],
});
