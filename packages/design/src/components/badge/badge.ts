import { defineComponent } from '../../contract/component';
import { ref, t } from '../../contract/tokens';

export const badge = defineComponent({
  name: 'badge',
  title: 'Badge',
  category: 'feedback',
  description: 'Short status label in six tones and three variants.',
  useWhen: 'Labelling status, counts or categories (Beta, Failed, 3 new). Not for actions: use a button.',
  anatomy: {
    '.m-badge': 'On a <span>',
    '[data-tone]': 'neutral (default) | accent | success | warning | danger | info',
    '[data-variant]': 'subtle (default) | solid | outline',
  },
  tokens: {
    height: t.length('Height', '1.375rem'),
    paddingX: t.length('Horizontal padding', ref('space.2')),
    gap: t.length('Space between an icon and the text', ref('space.1')),
    radius: t.length('Corner radius', ref('radius.sm')),
    borderWidth: t.length('Border width', ref('borderWidth.thin')),
    fontSize: t.length('Text size', ref('font.size.xs')),
    fontWeight: t.fontWeight('Text weight', ref('font.weight.medium')),
    textTransform: t.keyword('Text transform', 'none'),
    tracking: t.length('Letter spacing', ref('font.tracking.normal')),
    neutral: {
      bg: t.color('Neutral subtle background', ref('color.bg.sunken')),
      fg: t.color('Neutral text', ref('color.fg.muted')),
      border: t.color('Neutral border', ref('color.border.default')),
      solidBg: t.color('Neutral solid background', ref('color.bg.inverse')),
      solidFg: t.color('Neutral solid text', ref('color.fg.inverse')),
    },
  },
  contrast: [
    { fg: 'neutral.fg', bg: 'neutral.bg', min: 4.5 },
    { fg: 'neutral.solidFg', bg: 'neutral.solidBg', min: 4.5 },
    // Outline badges put tone text straight on the canvas.
    { fg: 'color.success.fg', bg: 'color.bg.canvas', min: 4.5 },
    { fg: 'color.warning.fg', bg: 'color.bg.canvas', min: 4.5 },
    { fg: 'color.danger.fg', bg: 'color.bg.canvas', min: 4.5 },
    { fg: 'color.info.fg', bg: 'color.bg.canvas', min: 4.5 },
  ],
  a11y: [
    'A badge is plain text: make sure it reads well out of context ("Failed", not just a red dot).',
    'For counts next to an icon ("3"), add context for screen readers: <span class="m-sr-only">unread messages</span>.',
    'If a badge changes live (a status flipping to Failed), announce it from an aria-live region rather than the badge itself.',
  ],
});
