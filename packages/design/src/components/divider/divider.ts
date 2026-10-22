import { defineComponent } from '../../contract/component';
import { ref, t } from '../../contract/tokens';

export const divider = defineComponent({
  name: 'divider',
  title: 'Divider',
  category: 'layout',
  description: 'Horizontal or vertical rule, optionally with a centred label.',
  useWhen: 'Separating groups of content or actions. Prefer spacing first; use a divider when groups still blur together.',
  anatomy: {
    '.m-divider': 'On an <hr>, or a <div role="separator"> holding a short label',
    '[data-orientation="vertical"]': 'Vertical rule between inline items (put it in a flex row such as .m-cluster)',
  },
  tokens: {
    color: t.color('Rule colour', ref('color.border.default')),
    width: t.length('Rule thickness', ref('borderWidth.thin')),
    spacing: t.length('Space around the rule', ref('space.4')),
    labelFg: t.color('Label colour', ref('color.fg.muted')),
    labelFontSize: t.length('Label size', ref('font.size.xs')),
    labelTransform: t.keyword('Label text-transform', 'uppercase'),
    labelTracking: t.length('Label letter spacing', ref('font.tracking.wide')),
    labelGap: t.length('Space between the label and the rules', ref('space.3')),
  },
  contrast: [
    { fg: 'labelFg', bg: 'color.bg.canvas', min: 4.5 },
    { fg: 'labelFg', bg: 'color.bg.surface', min: 4.5 },
  ],
  a11y: [
    'An <hr> is announced as a separator; use it between sections that are related but distinct.',
    'role="separator" makes its children presentational, so a label such as "or" is not read; if the label carries meaning, repeat it in aria-label.',
    'Purely decorative rules inside a component can be aria-hidden="true".',
  ],
});
