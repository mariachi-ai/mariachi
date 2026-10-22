import { defineComponent } from '../../contract/component';
import { ref, t } from '../../contract/tokens';

export const tooltip = defineComponent({
  name: 'tooltip',
  title: 'Tooltip',
  category: 'overlays',
  description: 'A CSS-only text label shown above or below an element on hover and keyboard focus.',
  useWhen: 'Naming icon-only buttons or giving a short hint. Never put essential information or interactive content in a tooltip.',
  anatomy: {
    '.m-tooltip': 'Inline wrapper around the trigger',
    '[data-tip]': 'The tooltip text',
    '[data-placement]': 'top (default) | bottom',
    '[data-open]': 'Forces it visible (docs and previews)',
  },
  tokens: {
    bg: t.color('Background', ref('color.bg.inverse')),
    fg: t.color('Text', ref('color.fg.inverse')),
    radius: t.length('Corner radius', ref('radius.sm')),
    shadow: t.shadow('Shadow', ref('shadow.sm')),
    paddingX: t.length('Horizontal padding', ref('space.2')),
    paddingY: t.length('Vertical padding', ref('space.1')),
    fontSize: t.length('Text size', ref('font.size.xs')),
    fontWeight: t.fontWeight('Text weight', ref('font.weight.medium')),
    maxWidth: t.length('Maximum width before wrapping', '20rem'),
    offset: t.length('Gap between trigger and tooltip', ref('space.2')),
    delay: t.duration('Delay before showing on hover', '400ms'),
    zIndex: t.zIndex('Stacking level', ref('z.dropdown')),
  },
  contrast: [{ fg: 'fg', bg: 'bg', min: 4.5 }],
  a11y: [
    'The tooltip is a pseudo-element, so screen readers do not read it: the trigger itself needs an aria-label (icon buttons) or aria-describedby pointing at visible or visually hidden text.',
    'It shows on keyboard focus (:focus-visible) as well as hover; keep the trigger focusable.',
    'Keep it to a short phrase; tooltips are not reachable on touch devices.',
  ],
});
