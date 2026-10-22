import { defineTheme } from '../engine/theme';

const ink = (l: number, a = 1) => (a === 1 ? `oklch(${l} 0.012 250)` : `oklch(${l} 0.012 250 / ${a})`);

/** Neutral greys, one blue accent, small radii, soft shadows. The default preset. */
export const minimal = defineTheme({
  name: 'minimal',
  label: 'Minimal',
  description: 'Neutral greys, one blue accent, 6px radius and soft shadows. A safe default for product UI.',
  tokens: {
    color: {
      bg: {
        canvas: { light: 'oklch(0.985 0.002 250)', dark: 'oklch(0.17 0.008 250)' },
        surface: { light: 'oklch(1 0 0)', dark: 'oklch(0.21 0.009 250)' },
        raised: { light: 'oklch(1 0 0)', dark: 'oklch(0.25 0.01 250)' },
        sunken: { light: 'oklch(0.965 0.004 250)', dark: 'oklch(0.145 0.007 250)' },
        overlay: { light: ink(0.2, 0.45), dark: 'oklch(0 0 0 / 0.6)' },
        inverse: { light: ink(0.24), dark: 'oklch(0.93 0.004 250)' },
      },
      fg: {
        default: { light: ink(0.22), dark: 'oklch(0.94 0.004 250)' },
        muted: { light: ink(0.45), dark: 'oklch(0.76 0.01 250)' },
        subtle: { light: ink(0.52), dark: 'oklch(0.68 0.012 250)' },
        inverse: { light: 'oklch(0.97 0.003 250)', dark: ink(0.2) },
      },
      border: {
        default: { light: 'oklch(0.9 0.005 250)', dark: 'oklch(0.33 0.01 250)' },
        muted: { light: 'oklch(0.94 0.004 250)', dark: 'oklch(0.27 0.01 250)' },
        strong: { light: ink(0.6), dark: 'oklch(0.56 0.012 250)' },
        focus: { light: 'oklch(0.55 0.2 262)', dark: 'oklch(0.72 0.15 262)' },
      },
      accent: {
        default: { light: 'oklch(0.53 0.2 262)', dark: 'oklch(0.55 0.19 262)' },
        hover: { light: 'oklch(0.48 0.2 262)', dark: 'oklch(0.5 0.19 262)' },
        active: { light: 'oklch(0.43 0.19 262)', dark: 'oklch(0.46 0.18 262)' },
        subtle: { light: 'oklch(0.95 0.03 262)', dark: 'oklch(0.3 0.06 262)' },
        fg: 'oklch(0.99 0 0)',
        text: { light: 'oklch(0.5 0.2 262)', dark: 'oklch(0.78 0.12 262)' },
      },
      success: {
        bg: { light: 'oklch(0.96 0.04 155)', dark: 'oklch(0.27 0.05 155)' },
        fg: { light: 'oklch(0.38 0.1 155)', dark: 'oklch(0.86 0.1 155)' },
        border: { light: 'oklch(0.85 0.08 155)', dark: 'oklch(0.42 0.07 155)' },
        solid: { light: 'oklch(0.5 0.13 155)', dark: 'oklch(0.5 0.13 155)' },
        onSolid: 'oklch(0.99 0 0)',
      },
      warning: {
        bg: { light: 'oklch(0.97 0.05 85)', dark: 'oklch(0.29 0.05 75)' },
        fg: { light: 'oklch(0.42 0.1 70)', dark: 'oklch(0.88 0.1 85)' },
        border: { light: 'oklch(0.85 0.1 85)', dark: 'oklch(0.44 0.07 75)' },
        solid: 'oklch(0.8 0.15 78)',
        onSolid: 'oklch(0.24 0.05 70)',
      },
      danger: {
        bg: { light: 'oklch(0.96 0.03 25)', dark: 'oklch(0.27 0.06 25)' },
        fg: { light: 'oklch(0.45 0.17 25)', dark: 'oklch(0.84 0.09 25)' },
        border: { light: 'oklch(0.85 0.08 25)', dark: 'oklch(0.44 0.1 25)' },
        solid: { light: 'oklch(0.52 0.2 27)', dark: 'oklch(0.54 0.2 27)' },
        onSolid: 'oklch(0.99 0 0)',
      },
      info: {
        bg: { light: 'oklch(0.96 0.03 240)', dark: 'oklch(0.27 0.05 240)' },
        fg: { light: 'oklch(0.42 0.12 240)', dark: 'oklch(0.85 0.08 240)' },
        border: { light: 'oklch(0.85 0.06 240)', dark: 'oklch(0.44 0.07 240)' },
        solid: 'oklch(0.5 0.13 240)',
        onSolid: 'oklch(0.99 0 0)',
      },
      selection: {
        bg: { light: 'oklch(0.88 0.06 262)', dark: 'oklch(0.42 0.1 262)' },
        fg: { light: 'oklch(0.2 0.02 262)', dark: 'oklch(0.98 0 0)' },
      },
    },
    font: {
      family: {
        sans: 'Inter, ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif',
      },
    },
    radius: { sm: '4px', md: '6px', lg: '10px' },
    shadow: {
      sm: { light: `0 1px 2px ${ink(0.2, 0.06)}`, dark: '0 1px 2px oklch(0 0 0 / 0.4)' },
      md: { light: `0 1px 3px ${ink(0.2, 0.08)}, 0 4px 12px ${ink(0.2, 0.06)}`, dark: '0 1px 3px oklch(0 0 0 / 0.5), 0 4px 12px oklch(0 0 0 / 0.35)' },
      lg: { light: `0 4px 8px ${ink(0.2, 0.06)}, 0 12px 32px ${ink(0.2, 0.1)}`, dark: '0 4px 8px oklch(0 0 0 / 0.5), 0 12px 32px oklch(0 0 0 / 0.45)' },
      overlay: { light: `0 8px 16px ${ink(0.2, 0.08)}, 0 24px 64px ${ink(0.2, 0.16)}`, dark: '0 8px 16px oklch(0 0 0 / 0.55), 0 24px 64px oklch(0 0 0 / 0.55)' },
    },
  },
  components: {
    button: { shadow: 'var(--m-shadow-sm)' },
  },
});
