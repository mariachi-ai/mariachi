import { defineComponent } from '../../contract/component';
import { ref, t } from '../../contract/tokens';

export const breadcrumb = defineComponent({
  name: 'breadcrumb',
  title: 'Breadcrumb',
  category: 'navigation',
  description: 'The path from the site root to the current page.',
  useWhen: 'Hierarchical pages more than two levels deep (docs, settings, file browsers).',
  anatomy: {
    'nav.m-breadcrumb': 'On <nav aria-label="Breadcrumb">',
    'ol > li': 'One item per level; separators are drawn by CSS',
    'a': 'Links to ancestor pages',
    '[aria-current="page"]': 'The current page (last item, not a link)',
  },
  tokens: {
    separator: t.keyword('Separator glyph, as a CSS string (e.g. "/" or "›")', '"/"'),
    separatorFg: t.color('Separator colour', ref('color.fg.subtle')),
    gap: t.length('Space around separators', ref('space.2')),
    fontSize: t.length('Text size', ref('font.size.sm')),
    fg: t.color('Link text', ref('color.fg.muted')),
    hoverFg: t.color('Link text on hover', ref('color.fg.default')),
    currentFg: t.color('Current page text', ref('color.fg.default')),
    currentWeight: t.fontWeight('Current page weight', ref('font.weight.medium')),
  },
  contrast: [
    { fg: 'fg', bg: 'color.bg.canvas', min: 4.5 },
    { fg: 'currentFg', bg: 'color.bg.canvas', min: 4.5 },
  ],
  a11y: [
    'Wrap it in <nav aria-label="Breadcrumb"> with an ordered list, so it is a named landmark with a position for each item.',
    'Mark the last item aria-current="page"; it does not need to be a link.',
    'Separators are CSS generated content with empty alt text, so screen readers skip them.',
  ],
});
