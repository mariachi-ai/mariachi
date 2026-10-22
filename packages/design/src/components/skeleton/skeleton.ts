import { defineComponent } from '../../contract/component';
import { ref, t } from '../../contract/tokens';

export const skeleton = defineComponent({
  name: 'skeleton',
  title: 'Skeleton',
  category: 'feedback',
  description: 'Placeholder shapes with a shimmer, shown while content of a known shape loads.',
  useWhen: 'Loading lists, cards or messages whose layout you know ahead of time.',
  anatomy: {
    '.m-skeleton': 'On an empty <div> or <span>',
    '[data-shape]': 'text (default, one line) | circle (avatars) | block (images, cards)',
    'style="inline-size: 60%"': 'Set the width inline to vary text lines',
  },
  tokens: {
    bg: t.color('Placeholder colour (a translucent tint of the text colour, so it works on any surface)', 'color-mix(in oklab, var(--m-color-fg-default) 10%, transparent)'),
    highlight: t.color('Shimmer highlight', 'color-mix(in oklab, var(--m-color-fg-default) 4%, transparent)'),
    radius: t.length('Text line radius', ref('radius.sm')),
    blockRadius: t.length('Block radius', ref('radius.container')),
    textHeight: t.length('Height of a text line', '0.875em'),
    circleSize: t.length('Circle diameter', '2.5rem'),
    blockHeight: t.length('Default block height', '8rem'),
    duration: t.duration('One shimmer sweep', 'calc(var(--m-motion-duration-slow) * 5)'),
  },
  a11y: [
    'Skeletons are decorative: add aria-hidden="true" to them and aria-busy="true" to the container being loaded.',
    'Announce completion with the real content or a live region; the skeleton itself says nothing.',
    'The shimmer stops under prefers-reduced-motion.',
  ],
});
