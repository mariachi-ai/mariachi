import { defineComponent } from '../../contract/component';
import { ref, t } from '../../contract/tokens';

export const layout = defineComponent({
  name: 'layout',
  title: 'Layout',
  category: 'layout',
  description: 'Stack, cluster, grid, split and container primitives that space children with tokens.',
  useWhen: 'Arranging any group of elements. Prefer these over ad-hoc margins.',
  anatomy: {
    '.m-stack': 'Vertical flow with a gap',
    '.m-cluster': 'Horizontal, wrapping row (buttons, tags, toolbars)',
    '.m-grid': 'Responsive auto-fit grid; set --m-layout-grid-min inline to change the column width',
    '.m-split': 'Two columns (sidebar + main) that stack on narrow screens',
    '.m-container': 'Centred, max-width page container with side padding',
    '[data-gap]': '0 | 1 | 2 | 3 | 4 | 5 | 6 | 8 | 10 | 12 | 16 (space scale steps)',
    '[data-align]': 'start | center | end | stretch | baseline (cross axis)',
    '[data-justify]': 'start | center | end | between (cluster main axis)',
    '[data-size] on .m-container': 'sm | md | lg (default) | full',
  },
  tokens: {
    stackGap: t.length('Default stack gap', ref('space.4')),
    clusterGap: t.length('Default cluster gap', ref('space.3')),
    gridGap: t.length('Default grid gap', ref('space.4')),
    gridMin: t.length('Minimum grid column width', '16rem'),
    splitSide: t.length('Width of the side column in a split', '16rem'),
    splitGap: t.length('Gap between split columns', ref('space.8')),
    containerMax: {
      sm: t.length('Narrow container (forms, articles)', '40rem'),
      md: t.length('Medium container', '56rem'),
      lg: t.length('Default container', '76rem'),
    },
    containerPadding: t.length('Container side padding', 'clamp(1rem, 4vw, 2rem)'),
  },
  a11y: ['Layout classes only change spacing and flow; keep DOM order the same as reading order.'],
});
