import { defineTheme } from '../engine/theme';

const slate = (l: number) => `oklch(${l} 0.015 245)`;

/** Dense, compact and crisp: small radii, 1px borders, strong tables. For data-heavy admin tools. */
export const enterprise = defineTheme({
  name: 'enterprise',
  label: 'Enterprise',
  description: 'Dense layout, compact type, small radii, crisp borders and strong table styling for data-heavy tools.',
  tokens: {
    color: {
      bg: {
        canvas: { light: 'oklch(0.972 0.005 245)', dark: 'oklch(0.18 0.015 245)' },
        surface: { light: 'oklch(1 0 0)', dark: 'oklch(0.215 0.016 245)' },
        raised: { light: 'oklch(1 0 0)', dark: 'oklch(0.25 0.017 245)' },
        sunken: { light: 'oklch(0.95 0.007 245)', dark: 'oklch(0.155 0.014 245)' },
        overlay: { light: 'oklch(0.2 0.02 245 / 0.5)', dark: 'oklch(0 0 0 / 0.6)' },
        inverse: { light: slate(0.26), dark: slate(0.93) },
      },
      fg: {
        default: { light: slate(0.22), dark: slate(0.94) },
        muted: { light: slate(0.44), dark: slate(0.77) },
        subtle: { light: slate(0.51), dark: slate(0.69) },
        inverse: { light: slate(0.97), dark: slate(0.2) },
      },
      border: {
        default: { light: slate(0.87), dark: slate(0.33) },
        muted: { light: slate(0.92), dark: slate(0.28) },
        strong: { light: slate(0.6), dark: slate(0.57) },
        focus: { light: 'oklch(0.52 0.13 230)', dark: 'oklch(0.74 0.11 220)' },
      },
      accent: {
        default: { light: 'oklch(0.5 0.12 230)', dark: 'oklch(0.53 0.12 230)' },
        hover: { light: 'oklch(0.45 0.12 230)', dark: 'oklch(0.48 0.12 230)' },
        active: { light: 'oklch(0.41 0.11 230)', dark: 'oklch(0.44 0.11 230)' },
        subtle: { light: 'oklch(0.95 0.025 230)', dark: 'oklch(0.3 0.05 230)' },
        fg: 'oklch(0.99 0 0)',
        text: { light: 'oklch(0.47 0.12 230)', dark: 'oklch(0.79 0.1 220)' },
      },
      success: {
        bg: { light: 'oklch(0.95 0.035 155)', dark: 'oklch(0.27 0.045 155)' },
        fg: { light: 'oklch(0.38 0.09 155)', dark: 'oklch(0.85 0.09 155)' },
        border: { light: 'oklch(0.84 0.07 155)', dark: 'oklch(0.42 0.06 155)' },
        solid: 'oklch(0.49 0.12 155)',
        onSolid: 'oklch(0.99 0 0)',
      },
      warning: {
        bg: { light: 'oklch(0.96 0.045 85)', dark: 'oklch(0.29 0.05 75)' },
        fg: { light: 'oklch(0.42 0.09 65)', dark: 'oklch(0.88 0.1 85)' },
        border: { light: 'oklch(0.84 0.09 85)', dark: 'oklch(0.45 0.07 75)' },
        solid: 'oklch(0.8 0.14 78)',
        onSolid: 'oklch(0.24 0.04 65)',
      },
      danger: {
        bg: { light: 'oklch(0.95 0.03 25)', dark: 'oklch(0.27 0.06 25)' },
        fg: { light: 'oklch(0.45 0.16 25)', dark: 'oklch(0.84 0.09 25)' },
        border: { light: 'oklch(0.84 0.08 25)', dark: 'oklch(0.44 0.1 25)' },
        solid: 'oklch(0.51 0.19 27)',
        onSolid: 'oklch(0.99 0 0)',
      },
      info: {
        bg: { light: 'oklch(0.95 0.025 250)', dark: 'oklch(0.27 0.045 250)' },
        fg: { light: 'oklch(0.42 0.11 255)', dark: 'oklch(0.85 0.07 250)' },
        border: { light: 'oklch(0.84 0.06 250)', dark: 'oklch(0.44 0.07 250)' },
        solid: 'oklch(0.49 0.13 255)',
        onSolid: 'oklch(0.99 0 0)',
      },
      selection: {
        bg: { light: 'oklch(0.88 0.06 230)', dark: 'oklch(0.42 0.09 230)' },
        fg: { light: slate(0.2), dark: 'oklch(0.98 0 0)' },
      },
    },
    font: {
      family: {
        sans: '"IBM Plex Sans", "Inter", ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif',
        mono: '"IBM Plex Mono", ui-monospace, SFMono-Regular, Menlo, Consolas, monospace',
      },
      size: {
        xs: '0.6875rem',
        sm: '0.8125rem',
        md: '0.875rem',
        lg: '1rem',
        xl: '1.125rem',
        '2xl': '1.3125rem',
        '3xl': '1.625rem',
        '4xl': '2rem',
      },
      leading: { normal: '1.45' },
      heading: { weight: '600', tracking: '-0.005em' },
    },
    space: { unit: '0.22rem' },
    density: '0.85',
    control: { fontSize: 'var(--m-font-size-sm)' },
    radius: { sm: '2px', md: '3px', lg: '4px' },
    shadow: {
      sm: { light: 'none', dark: 'none' },
      md: { light: '0 1px 2px oklch(0.2 0.02 245 / 0.08)', dark: '0 1px 2px oklch(0 0 0 / 0.45)' },
      lg: { light: '0 2px 6px oklch(0.2 0.02 245 / 0.1), 0 8px 20px oklch(0.2 0.02 245 / 0.08)', dark: '0 2px 6px oklch(0 0 0 / 0.5), 0 8px 20px oklch(0 0 0 / 0.4)' },
      overlay: { light: '0 4px 12px oklch(0.2 0.02 245 / 0.12), 0 16px 40px oklch(0.2 0.02 245 / 0.14)', dark: '0 4px 12px oklch(0 0 0 / 0.55), 0 16px 40px oklch(0 0 0 / 0.5)' },
    },
    focus: { offset: '1px' },
    motion: { duration: { fast: '80ms', normal: '140ms', slow: '220ms' } },
  },
  components: {
    card: { shadow: 'none', hoverShadow: 'var(--m-shadow-md)' },
    table: {
      headerBg: 'var(--m-color-bg-sunken)',
      headerFontWeight: 'var(--m-font-weight-semibold)',
      headerTransform: 'uppercase',
      headerTracking: 'var(--m-font-tracking-wide)',
      headerFontSize: 'var(--m-font-size-xs)',
      cellPaddingY: 'var(--m-space-2)',
      cellPaddingX: 'var(--m-space-3)',
      stripeBg: 'var(--m-color-bg-sunken)',
    },
    sidebar: { link: { radius: 'var(--m-radius-sm)' } },
    badge: { radius: 'var(--m-radius-sm)', textTransform: 'uppercase', tracking: 'var(--m-font-tracking-wide)' },
  },
});
