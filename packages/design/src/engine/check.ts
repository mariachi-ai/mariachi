import { type ContrastPair, contrastPairs } from '../contract';
import { contrastRatio, parseColor } from './color';
import { type Mode, resolveToken, type Theme } from './theme';

export interface ContrastResult extends ContrastPair {
  mode: Mode;
  ratio: number;
  fgValue: string;
  bgValue: string;
}

export interface ThemeCheck {
  ok: boolean;
  /** Pairs below their minimum. */
  failures: ContrastResult[];
  /** Pairs that couldn't be checked because a colour isn't parseable (e.g. color-mix()). */
  unchecked: { pair: ContrastPair; mode: Mode; value: string }[];
  results: ContrastResult[];
}

/**
 * Checks every contrast pair (semantic and component) in both modes. Translucent backgrounds are
 * composited over the theme's canvas.
 */
export function checkTheme(theme: Theme, pairs: ContrastPair[] = contrastPairs): ThemeCheck {
  const results: ContrastResult[] = [];
  const unchecked: ThemeCheck['unchecked'] = [];
  for (const mode of ['light', 'dark'] as const) {
    const canvasValue = resolveToken(theme, 'color.bg.canvas', mode);
    const canvas = canvasValue ? parseColor(canvasValue) : undefined;
    for (const pair of pairs) {
      const fgValue = resolveToken(theme, pair.fg, mode);
      const bgValue = resolveToken(theme, pair.bg, mode);
      const fg = fgValue ? parseColor(fgValue) : undefined;
      const bg = bgValue ? parseColor(bgValue) : undefined;
      if (!fg || !bg) {
        unchecked.push({ pair, mode, value: (!fg ? fgValue : bgValue) ?? '(unset)' });
        continue;
      }
      results.push({ ...pair, mode, ratio: contrastRatio(fg, bg, canvas), fgValue: fgValue!, bgValue: bgValue! });
    }
  }
  const failures = results.filter((r) => r.ratio + 1e-9 < r.min);
  return { ok: failures.length === 0, failures, unchecked, results };
}

export function formatContrastFailure(f: ContrastResult): string {
  return `${f.fg} on ${f.bg} (${f.mode}): ${f.ratio.toFixed(2)}:1, needs ${f.min}:1`;
}
