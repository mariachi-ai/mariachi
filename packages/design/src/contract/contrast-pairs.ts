/** A foreground/background pair that must meet `min` contrast in both modes. Paths are token paths. */
export interface ContrastPair {
  fg: string;
  bg: string;
  /** 4.5 for text (WCAG 1.4.3), 3 for non-text UI such as borders and focus rings (WCAG 1.4.11). */
  min: number;
}

const text = (fg: string, bgs: string[]): ContrastPair[] => bgs.map((bg) => ({ fg, bg, min: 4.5 }));
const ui = (fg: string, bgs: string[]): ContrastPair[] => bgs.map((bg) => ({ fg, bg, min: 3 }));

const surfaces = ['color.bg.canvas', 'color.bg.surface', 'color.bg.raised', 'color.bg.sunken'];
const statuses = ['success', 'warning', 'danger', 'info'];

/** Pairs every preset must pass. Components add their own (see each component's `contrast`). */
export const semanticContrastPairs: ContrastPair[] = [
  ...text('color.fg.default', surfaces),
  ...text('color.fg.muted', surfaces),
  ...text('color.fg.subtle', ['color.bg.canvas', 'color.bg.surface']),
  ...text('color.fg.inverse', ['color.bg.inverse']),
  ...text('color.accent.fg', ['color.accent.default', 'color.accent.hover', 'color.accent.active']),
  ...text('color.accent.text', ['color.bg.canvas', 'color.bg.surface', 'color.accent.subtle']),
  ...text('color.fg.default', ['color.accent.subtle']),
  ...statuses.flatMap((s) => [
    ...text(`color.${s}.fg`, [`color.${s}.bg`]),
    ...text(`color.${s}.onSolid`, [`color.${s}.solid`]),
  ]),
  ...text('color.selection.fg', ['color.selection.bg']),
  ...ui('color.border.strong', ['color.bg.canvas', 'color.bg.surface']),
  ...ui('focus.color', ['color.bg.canvas', 'color.bg.surface']),
  ...ui('color.accent.default', ['color.bg.canvas', 'color.bg.surface']),
];
