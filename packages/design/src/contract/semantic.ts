import { ref, t } from './tokens';

const status = (name: string) => ({
  bg: t.color(`Subtle ${name} background (alerts, badges)`),
  fg: t.color(`Text on the subtle ${name} background`),
  border: t.color(`Border for ${name} surfaces`),
  solid: t.color(`Solid ${name} fill (strong badges, toasts)`),
  onSolid: t.color(`Text on the solid ${name} fill`),
});

/**
 * Semantic tokens: what every preset defines. Tokens without a default are required; the rest
 * have structural defaults a preset can change. Components read these through their own
 * component tokens (see `components.ts`).
 */
export const semantic = {
  color: {
    bg: {
      canvas: t.color('Page background'),
      surface: t.color('Cards, inputs, panels'),
      raised: t.color('Menus, popovers, dialogs: anything above a surface'),
      sunken: t.color('Wells, code blocks, table headers'),
      overlay: t.color('Scrim behind dialogs (usually translucent)'),
      inverse: t.color('Inverted surface (tooltips, toasts)'),
    },
    fg: {
      default: t.color('Body text'),
      muted: t.color('Secondary text'),
      subtle: t.color('Tertiary text, placeholders'),
      inverse: t.color('Text on the inverse surface'),
    },
    border: {
      default: t.color('Default borders and dividers'),
      muted: t.color('Low-emphasis borders'),
      strong: t.color('Control borders, high-emphasis borders'),
      focus: t.color('Focus ring'),
    },
    accent: {
      default: t.color('Primary action fill'),
      hover: t.color('Primary action fill on hover'),
      active: t.color('Primary action fill when pressed'),
      subtle: t.color('Tinted accent background (selected rows, subtle buttons)'),
      fg: t.color('Text on the accent fill'),
      text: t.color('Accent-coloured text on the canvas (links)'),
    },
    success: status('success'),
    warning: status('warning'),
    danger: status('danger'),
    info: status('info'),
    selection: {
      bg: t.color('Text selection background'),
      fg: t.color('Text selection foreground'),
    },
  },
  font: {
    family: {
      sans: t.fontFamily('Sans-serif stack'),
      serif: t.fontFamily('Serif stack', 'ui-serif, Georgia, Cambria, "Times New Roman", serif'),
      mono: t.fontFamily(
        'Monospace stack',
        'ui-monospace, SFMono-Regular, "SF Mono", Menlo, Consolas, "Liberation Mono", monospace',
      ),
      display: t.fontFamily('Display stack for large headings', ref('font.family.sans')),
    },
    size: {
      xs: t.length('Extra small text', '0.75rem'),
      sm: t.length('Small text', '0.875rem'),
      md: t.length('Body text', '1rem'),
      lg: t.length('Large text', '1.125rem'),
      xl: t.length('Heading 4', '1.25rem'),
      '2xl': t.length('Heading 3', '1.5rem'),
      '3xl': t.length('Heading 2', '1.875rem'),
      '4xl': t.length('Heading 1', '2.25rem'),
    },
    weight: {
      regular: t.fontWeight('Regular weight', '400'),
      medium: t.fontWeight('Medium weight', '500'),
      semibold: t.fontWeight('Semibold weight', '600'),
      bold: t.fontWeight('Bold weight', '700'),
    },
    leading: {
      tight: t.number('Tight line height (headings)', '1.2'),
      normal: t.number('Body line height', '1.5'),
      relaxed: t.number('Relaxed line height (long-form text)', '1.7'),
    },
    tracking: {
      tight: t.length('Tight letter spacing', '-0.01em'),
      normal: t.length('Normal letter spacing', '0'),
      wide: t.length('Wide letter spacing (labels, all-caps)', '0.04em'),
    },
    body: {
      family: t.fontFamily('Body text family', ref('font.family.sans')),
      weight: t.fontWeight('Body text weight', ref('font.weight.regular')),
    },
    heading: {
      family: t.fontFamily('Heading family', ref('font.family.display')),
      weight: t.fontWeight('Heading weight', ref('font.weight.semibold')),
      transform: t.keyword('Heading text-transform (none, uppercase)', 'none'),
      tracking: t.length('Heading letter spacing', ref('font.tracking.tight')),
    },
  },
  space: {
    unit: t.length('Base spacing unit; the scale is multiples of it', '0.25rem'),
    0: t.length('No space', '0'),
    1: t.length('1 unit', 'calc(var(--m-space-unit) * 1)'),
    2: t.length('2 units', 'calc(var(--m-space-unit) * 2)'),
    3: t.length('3 units', 'calc(var(--m-space-unit) * 3)'),
    4: t.length('4 units', 'calc(var(--m-space-unit) * 4)'),
    5: t.length('5 units', 'calc(var(--m-space-unit) * 5)'),
    6: t.length('6 units', 'calc(var(--m-space-unit) * 6)'),
    8: t.length('8 units', 'calc(var(--m-space-unit) * 8)'),
    10: t.length('10 units', 'calc(var(--m-space-unit) * 10)'),
    12: t.length('12 units', 'calc(var(--m-space-unit) * 12)'),
    16: t.length('16 units', 'calc(var(--m-space-unit) * 16)'),
  },
  density: t.number('Multiplier for control heights and padding (0.85 compact, 1 default)', '1'),
  control: {
    height: {
      sm: t.length('Small control height', 'calc(2rem * var(--m-density))'),
      md: t.length('Default control height', 'calc(2.5rem * var(--m-density))'),
      lg: t.length('Large control height', 'calc(3rem * var(--m-density))'),
    },
    paddingX: {
      sm: t.length('Small control horizontal padding', 'calc(0.625rem * var(--m-density))'),
      md: t.length('Default control horizontal padding', 'calc(0.875rem * var(--m-density))'),
      lg: t.length('Large control horizontal padding', 'calc(1.125rem * var(--m-density))'),
    },
    fontSize: t.length('Text size inside controls', ref('font.size.sm')),
    minTarget: t.length('Minimum pointer target size and pitch (WCAG 2.5.8); dense presets must not go below 24px', '24px'),
  },
  radius: {
    none: t.length('No rounding', '0'),
    sm: t.length('Small radius'),
    md: t.length('Medium radius'),
    lg: t.length('Large radius'),
    full: t.length('Pill / circle', '9999px'),
    control: t.length('Buttons, inputs, selects', ref('radius.md')),
    container: t.length('Cards, dialogs, panels', ref('radius.lg')),
  },
  borderWidth: {
    thin: t.length('Hairline border', '1px'),
    thick: t.length('Emphasis border', '2px'),
    control: t.length('Control border width', ref('borderWidth.thin')),
    container: t.length('Container border width', ref('borderWidth.thin')),
  },
  shadow: {
    sm: t.shadow('Small elevation (buttons, inputs)'),
    md: t.shadow('Medium elevation (cards)'),
    lg: t.shadow('Large elevation (popovers, menus)'),
    overlay: t.shadow('Dialogs and toasts'),
  },
  focus: {
    width: t.length('Focus ring width', '2px'),
    offset: t.length('Focus ring offset', '2px'),
    style: t.keyword('Focus ring outline-style', 'solid'),
    color: t.color('Focus ring colour', ref('color.border.focus')),
  },
  motion: {
    duration: {
      fast: t.duration('Hover and press feedback', '120ms'),
      normal: t.duration('Opening and closing', '200ms'),
      slow: t.duration('Large movements', '320ms'),
    },
    easing: {
      standard: t.easing('Default easing', 'cubic-bezier(0.2, 0, 0, 1)'),
      emphasized: t.easing('Entrances', 'cubic-bezier(0.3, 0, 0, 1.1)'),
    },
  },
  z: {
    dropdown: t.zIndex('Dropdowns and popovers', '1000'),
    sticky: t.zIndex('Sticky headers', '1100'),
    overlay: t.zIndex('Overlays', '1200'),
    modal: t.zIndex('Dialogs', '1300'),
    toast: t.zIndex('Toasts', '1400'),
  },
};

export type SemanticContract = typeof semantic;
