import { defineComponent } from '../../contract/component';
import { ref, t } from '../../contract/tokens';

export const avatar = defineComponent({
  name: 'avatar',
  title: 'Avatar',
  category: 'data',
  description: 'A person or entity as an image or initials, in three sizes, with an overlapping group.',
  useWhen: 'Showing who owns, wrote or is present on something. Pair with the name nearby when it matters.',
  anatomy: {
    '.m-avatar': 'On an <img> (with alt) or a <span> holding initials',
    '[data-size]': 'sm | md (default) | lg',
    '.m-avatar-group': 'Row of overlapping avatars; each gets a ring in the canvas colour',
  },
  tokens: {
    size: {
      sm: t.length('Small size', '1.75rem'),
      md: t.length('Default size', '2.25rem'),
      lg: t.length('Large size', '3rem'),
    },
    radius: t.length('Corner radius', ref('radius.full')),
    bg: t.color('Initials background', ref('color.accent.subtle')),
    fg: t.color('Initials colour', ref('color.accent.text')),
    fontWeight: t.fontWeight('Initials weight', ref('font.weight.semibold')),
    border: t.color('Outline around the avatar', 'transparent'),
    borderWidth: t.length('Outline width', ref('borderWidth.thin')),
    ringColor: t.color('Ring separating avatars in a group', ref('color.bg.canvas')),
    ringWidth: t.length('Ring width in a group', ref('borderWidth.thick')),
    groupOverlap: t.length('How far grouped avatars overlap', '-0.5rem'),
  },
  contrast: [{ fg: 'fg', bg: 'bg', min: 4.5 }],
  a11y: [
    'Image avatars need alt text with the person\'s name; use alt="" when the name is printed right next to it.',
    'Initials avatars are text: add aria-label (or .m-sr-only text) with the full name, and aria-hidden on the initials when the name is visible nearby.',
    'In a group with a "+3" overflow avatar, say what the number means ("3 more members").',
  ],
});
