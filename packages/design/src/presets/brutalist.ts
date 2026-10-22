import { defineTheme } from '../engine/theme';

const hard = (offset: number) => `${offset}px ${offset}px 0 var(--m-color-border-strong)`;

/** No radius, thick black borders, hard offset shadows, uppercase grotesk headings, hot-pink accent. */
export const brutalist = defineTheme({
  name: 'brutalist',
  label: 'Brutalist',
  description: 'No radius, thick borders, hard offset shadows, uppercase headings and a loud accent.',
  tokens: {
    color: {
      bg: {
        canvas: { light: 'oklch(0.97 0.025 95)', dark: 'oklch(0.14 0 0)' },
        surface: { light: 'oklch(1 0 0)', dark: 'oklch(0.19 0 0)' },
        raised: { light: 'oklch(1 0 0)', dark: 'oklch(0.23 0 0)' },
        sunken: { light: 'oklch(0.93 0.035 95)', dark: 'oklch(0.1 0 0)' },
        overlay: { light: 'oklch(0.12 0 0 / 0.5)', dark: 'oklch(0 0 0 / 0.7)' },
        inverse: { light: 'oklch(0.12 0 0)', dark: 'oklch(0.97 0.025 95)' },
      },
      fg: {
        default: { light: 'oklch(0.12 0 0)', dark: 'oklch(0.97 0.01 95)' },
        muted: { light: 'oklch(0.3 0 0)', dark: 'oklch(0.82 0.01 95)' },
        subtle: { light: 'oklch(0.42 0 0)', dark: 'oklch(0.72 0.01 95)' },
        inverse: { light: 'oklch(0.97 0.025 95)', dark: 'oklch(0.12 0 0)' },
      },
      border: {
        default: { light: 'oklch(0.12 0 0)', dark: 'oklch(0.92 0.01 95)' },
        muted: { light: 'oklch(0.7 0.01 95)', dark: 'oklch(0.4 0 0)' },
        strong: { light: 'oklch(0.12 0 0)', dark: 'oklch(0.97 0.01 95)' },
        focus: { light: 'oklch(0.45 0.25 300)', dark: 'oklch(0.78 0.17 300)' },
      },
      accent: {
        default: 'oklch(0.66 0.25 350)',
        hover: 'oklch(0.72 0.22 350)',
        active: 'oklch(0.63 0.24 350)',
        subtle: { light: 'oklch(0.92 0.06 350)', dark: 'oklch(0.32 0.1 350)' },
        fg: 'oklch(0.12 0 0)',
        text: { light: 'oklch(0.48 0.22 350)', dark: 'oklch(0.8 0.15 350)' },
      },
      success: {
        bg: { light: 'oklch(0.93 0.08 145)', dark: 'oklch(0.3 0.07 145)' },
        fg: { light: 'oklch(0.3 0.09 145)', dark: 'oklch(0.9 0.12 145)' },
        border: { light: 'oklch(0.12 0 0)', dark: 'oklch(0.92 0.01 95)' },
        solid: 'oklch(0.78 0.2 145)',
        onSolid: 'oklch(0.12 0 0)',
      },
      warning: {
        bg: { light: 'oklch(0.95 0.1 95)', dark: 'oklch(0.32 0.07 90)' },
        fg: { light: 'oklch(0.32 0.07 80)', dark: 'oklch(0.92 0.12 95)' },
        border: { light: 'oklch(0.12 0 0)', dark: 'oklch(0.92 0.01 95)' },
        solid: 'oklch(0.88 0.18 95)',
        onSolid: 'oklch(0.12 0 0)',
      },
      danger: {
        bg: { light: 'oklch(0.93 0.05 25)', dark: 'oklch(0.3 0.09 25)' },
        fg: { light: 'oklch(0.4 0.18 25)', dark: 'oklch(0.86 0.09 25)' },
        border: { light: 'oklch(0.12 0 0)', dark: 'oklch(0.92 0.01 95)' },
        solid: 'oklch(0.64 0.24 27)',
        onSolid: 'oklch(0.12 0 0)',
      },
      info: {
        bg: { light: 'oklch(0.93 0.05 230)', dark: 'oklch(0.3 0.07 230)' },
        fg: { light: 'oklch(0.35 0.12 240)', dark: 'oklch(0.88 0.07 230)' },
        border: { light: 'oklch(0.12 0 0)', dark: 'oklch(0.92 0.01 95)' },
        solid: 'oklch(0.75 0.14 230)',
        onSolid: 'oklch(0.12 0 0)',
      },
      selection: {
        bg: 'oklch(0.88 0.18 95)',
        fg: 'oklch(0.12 0 0)',
      },
    },
    font: {
      family: {
        sans: '"Space Grotesk", "Archivo", ui-sans-serif, system-ui, "Helvetica Neue", Arial, sans-serif',
        display: '"Archivo Black", "Arial Black", "Helvetica Neue", Impact, ui-sans-serif, sans-serif',
      },
      heading: { weight: '800', transform: 'uppercase', tracking: '0.01em' },
    },
    radius: { sm: '0', md: '0', lg: '0' },
    borderWidth: { thin: '2px', thick: '3px', control: '2px', container: '3px' },
    shadow: { sm: hard(2), md: hard(4), lg: hard(6), overlay: hard(8) },
    focus: { width: '3px', offset: '3px' },
    motion: { duration: { fast: '80ms', normal: '120ms' } },
  },
  components: {
    button: {
      shadow: hard(3),
      hoverShadow: hard(5),
      activeShadow: 'none',
      hoverTransform: 'translate(-2px, -2px)',
      activeTransform: 'translate(3px, 3px)',
      fontWeight: 'var(--m-font-weight-bold)',
      textTransform: 'uppercase',
      tracking: 'var(--m-font-tracking-wide)',
      secondary: { hoverBg: 'var(--m-color-accent-subtle)' },
    },
    switch: { radius: '0', border: 'var(--m-color-border-strong)' },
    avatar: { radius: '0' },
    input: { shadow: 'var(--m-shadow-sm)' },
  },
});
