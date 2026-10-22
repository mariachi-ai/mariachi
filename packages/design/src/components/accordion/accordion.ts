import { defineComponent } from '../../contract/component';
import { ref, t } from '../../contract/tokens';

export const accordion = defineComponent({
  name: 'accordion',
  title: 'Accordion',
  category: 'content',
  description: 'Stacked disclosure sections on native <details>, joined in one box or separated, with an animated open where supported.',
  useWhen: 'FAQs and long pages where readers scan headings and open only what they need.',
  anatomy: {
    '.m-accordion': 'Wrapper',
    '.m-accordion-item': 'On <details>; add name="…" to several items to make only one open at a time',
    'summary': 'The clickable heading (chevron drawn by CSS)',
    '.m-accordion-content': 'The body',
    '[data-variant]': 'joined (default) | separated',
  },
  tokens: {
    bg: t.color('Background', ref('color.bg.surface')),
    border: t.color('Border colour', ref('color.border.default')),
    borderWidth: t.length('Border width', ref('borderWidth.container')),
    radius: t.length('Corner radius', ref('radius.container')),
    separatedGap: t.length('Separated variant: space between items', ref('space.2')),
    paddingX: t.length('Horizontal padding', ref('space.4')),
    paddingY: t.length('Summary vertical padding', ref('space.3')),
    summaryFg: t.color('Summary text', ref('color.fg.default')),
    summarySize: t.length('Summary text size', ref('font.size.md')),
    summaryWeight: t.fontWeight('Summary weight', ref('font.weight.medium')),
    hoverBg: t.color('Summary background on hover', ref('color.bg.sunken')),
    contentFg: t.color('Content text', ref('color.fg.muted')),
    chevronSize: t.length('Chevron size', '0.45em'),
  },
  contrast: [
    { fg: 'summaryFg', bg: 'bg', min: 4.5 },
    { fg: 'summaryFg', bg: 'hoverBg', min: 4.5 },
    { fg: 'contentFg', bg: 'bg', min: 4.5 },
  ],
  a11y: [
    '<details>/<summary> are keyboard-operable and announce expanded/collapsed without ARIA or script.',
    'Don\'t put headings inside <summary> unless you need them in the page outline; if you do, keep the whole summary as the click target.',
    'Content in closed items is found by in-page search (hidden="until-found" behaviour) in supporting browsers.',
  ],
});
