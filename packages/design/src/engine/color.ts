/**
 * Minimal CSS colour parsing and WCAG 2.x contrast, dependency-free so it also runs in the browser
 * (the explorer's override playground). Supports hex, rgb(), hsl(), oklch(), oklab(), `white`,
 * `black` and `transparent`. Returns undefined for anything else (named colours, color-mix()).
 */

/** Linear-light sRGB channels in [0, 1] plus alpha. */
export interface LinearRgba {
  r: number;
  g: number;
  b: number;
  a: number;
}

const clamp01 = (x: number) => Math.min(1, Math.max(0, x));
const toLinear = (c: number) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
const toGamma = (c: number) => (c <= 0.0031308 ? 12.92 * c : 1.055 * c ** (1 / 2.4) - 0.055);

function parseNumber(token: string, percentScale: number): number {
  const t = token.trim();
  if (t === 'none') return 0;
  if (t.endsWith('%')) return (Number.parseFloat(t) / 100) * percentScale;
  return Number.parseFloat(t);
}

function parseAlpha(token: string | undefined): number {
  if (token === undefined) return 1;
  return clamp01(parseNumber(token, 1));
}

function parseHue(token: string): number {
  const t = token.trim();
  if (t.endsWith('deg')) return Number.parseFloat(t);
  if (t.endsWith('turn')) return Number.parseFloat(t) * 360;
  if (t.endsWith('rad')) return (Number.parseFloat(t) * 180) / Math.PI;
  return Number.parseFloat(t);
}

/** Splits `fn(a b c / d)` or `fn(a, b, c, d)` into [a, b, c, d?]. */
function args(body: string): [string[], string | undefined] {
  const [main, alpha] = body.split('/');
  const parts = main.split(/[\s,]+/).filter(Boolean);
  if (alpha === undefined && parts.length === 4) return [parts.slice(0, 3), parts[3]];
  return [parts, alpha?.trim()];
}

function fromSrgb(r: number, g: number, b: number, a: number): LinearRgba {
  return { r: toLinear(clamp01(r)), g: toLinear(clamp01(g)), b: toLinear(clamp01(b)), a };
}

function oklabToLinear(L: number, a: number, b: number, alpha: number): LinearRgba {
  const l_ = L + 0.3963377774 * a + 0.2158037573 * b;
  const m_ = L - 0.1055613458 * a - 0.0638541728 * b;
  const s_ = L - 0.0894841775 * a - 1.291485548 * b;
  const l = l_ ** 3;
  const m = m_ ** 3;
  const s = s_ ** 3;
  return {
    r: clamp01(4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s),
    g: clamp01(-1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s),
    b: clamp01(-0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s),
    a: alpha,
  };
}

function hslToSrgb(h: number, s: number, l: number): [number, number, number] {
  const k = (n: number) => (n + h / 30) % 12;
  const a = s * Math.min(l, 1 - l);
  const f = (n: number) => l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));
  return [f(0), f(8), f(4)];
}

export function parseColor(input: string): LinearRgba | undefined {
  const value = input.trim().toLowerCase();
  if (value === 'transparent') return { r: 0, g: 0, b: 0, a: 0 };
  if (value === 'white') return { r: 1, g: 1, b: 1, a: 1 };
  if (value === 'black') return { r: 0, g: 0, b: 0, a: 1 };

  const hex = /^#([0-9a-f]{3,8})$/.exec(value);
  if (hex) {
    let h = hex[1];
    if (h.length === 3 || h.length === 4) h = [...h].map((c) => c + c).join('');
    if (h.length !== 6 && h.length !== 8) return undefined;
    const n = (i: number) => Number.parseInt(h.slice(i, i + 2), 16) / 255;
    return fromSrgb(n(0), n(2), n(4), h.length === 8 ? n(6) : 1);
  }

  const fn = /^([a-z]+)\((.*)\)$/.exec(value);
  if (!fn) return undefined;
  // color(srgb r g b / a) and color(srgb-linear …): what browsers report for some computed colours.
  const space = /^(srgb|srgb-linear)\s+(.*)$/.exec(fn[2]);
  if (fn[1] === 'color' && space) {
    const [p, a] = args(space[2]);
    if (p.length !== 3) return undefined;
    const [r, g, b] = p.map((x) => parseNumber(x, 1));
    if (space[1] === 'srgb-linear') return { r: clamp01(r), g: clamp01(g), b: clamp01(b), a: parseAlpha(a) };
    return fromSrgb(r, g, b, parseAlpha(a));
  }
  const [parts, alpha] = args(fn[2]);
  if (parts.length !== 3) return undefined;
  switch (fn[1]) {
    case 'rgb':
    case 'rgba':
      return fromSrgb(parseNumber(parts[0], 255) / 255, parseNumber(parts[1], 255) / 255, parseNumber(parts[2], 255) / 255, parseAlpha(alpha));
    case 'hsl':
    case 'hsla': {
      const [r, g, b] = hslToSrgb(parseHue(parts[0]), parseNumber(parts[1], 100) / 100, parseNumber(parts[2], 100) / 100);
      return fromSrgb(r, g, b, parseAlpha(alpha));
    }
    case 'oklch': {
      const L = parseNumber(parts[0], 1);
      const C = parseNumber(parts[1], 0.4);
      const h = (parseHue(parts[2]) * Math.PI) / 180;
      return oklabToLinear(L, C * Math.cos(h), C * Math.sin(h), parseAlpha(alpha));
    }
    case 'oklab':
      return oklabToLinear(parseNumber(parts[0], 1), parseNumber(parts[1], 0.4), parseNumber(parts[2], 0.4), parseAlpha(alpha));
    default:
      return undefined;
  }
}

/** Composites `top` over an opaque `bottom` (alpha blending is done in gamma space, as browsers do). */
export function composite(top: LinearRgba, bottom: LinearRgba): LinearRgba {
  if (top.a >= 1) return top;
  const mix = (t: number, b: number) => toLinear(toGamma(t) * top.a + toGamma(b) * (1 - top.a));
  return { r: mix(top.r, bottom.r), g: mix(top.g, bottom.g), b: mix(top.b, bottom.b), a: 1 };
}

export function luminance(c: LinearRgba): number {
  return 0.2126 * c.r + 0.7152 * c.g + 0.0722 * c.b;
}

/** WCAG contrast ratio, 1 to 21. A translucent `bg` is composited over `base` first (default white). */
export function contrastRatio(fg: LinearRgba, bg: LinearRgba, base: LinearRgba = { r: 1, g: 1, b: 1, a: 1 }): number {
  const solidBg = composite(bg, base);
  const solidFg = composite(fg, solidBg);
  const l1 = luminance(solidFg);
  const l2 = luminance(solidBg);
  const [hi, lo] = l1 > l2 ? [l1, l2] : [l2, l1];
  return (hi + 0.05) / (lo + 0.05);
}

/** `#rrggbb` for display (swatches); alpha is dropped. */
export function toHex(c: LinearRgba): string {
  const h = (x: number) => Math.round(clamp01(toGamma(x)) * 255).toString(16).padStart(2, '0');
  return `#${h(c.r)}${h(c.g)}${h(c.b)}`;
}
