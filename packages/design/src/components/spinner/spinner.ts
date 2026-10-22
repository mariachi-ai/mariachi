import { defineComponent } from '../../contract/component';
import { ref, t } from '../../contract/tokens';

export const spinner = defineComponent({
  name: 'spinner',
  title: 'Spinner',
  category: 'feedback',
  description: 'An indeterminate loading ring for short waits where layout is not yet known.',
  useWhen: 'Waiting on something that usually takes under a few seconds. Prefer a skeleton when you know the shape of the content.',
  anatomy: {
    '.m-spinner': 'On a <span role="status"> holding visually hidden text',
    '[data-size]': 'sm | md (default) | lg',
  },
  tokens: {
    size: {
      sm: t.length('Small diameter', '1rem'),
      md: t.length('Default diameter', '1.5rem'),
      lg: t.length('Large diameter', '2.25rem'),
    },
    thickness: t.length('Ring thickness', ref('borderWidth.thick')),
    radius: t.length('Ring corner radius (full = circle)', ref('radius.full')),
    track: t.color('Unfilled part of the ring', ref('color.border.default')),
    color: t.color('Moving arc', ref('color.accent.default')),
    duration: t.duration('One full turn', 'calc(var(--m-motion-duration-slow) * 2.5)'),
  },
  contrast: [
    { fg: 'color', bg: 'color.bg.canvas', min: 3 },
    { fg: 'color', bg: 'color.bg.surface', min: 3 },
  ],
  a11y: [
    'Put role="status" on the spinner and a .m-sr-only label inside it ("Loading results"), so screen readers announce it once.',
    'Under prefers-reduced-motion the ring stops turning (durations collapse to 0ms); pair long waits with text that says what is happening.',
    'Use aria-busy="true" on the region that is loading, not only the spinner.',
  ],
});
