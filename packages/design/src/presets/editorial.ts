import { defineTheme } from '../engine/theme';

/** Serif headings, warm paper, ink text and an ink-blue accent, hairline rules and no shadows: a reading-first look. */
export const editorial = defineTheme({
  name: 'editorial',
  label: 'Editorial',
  description: 'Serif headings, warm paper canvas, ink text with an ink-blue accent, hairline rules, no shadows and generous spacing.',
  tokens: {
    color: {
      bg: {
        canvas: { light: 'oklch(0.975 0.012 85)', dark: 'oklch(0.2 0.012 70)' },
        surface: { light: 'oklch(0.99 0.008 85)', dark: 'oklch(0.23 0.012 70)' },
        raised: { light: 'oklch(0.995 0.005 85)', dark: 'oklch(0.26 0.012 70)' },
        sunken: { light: 'oklch(0.945 0.016 85)', dark: 'oklch(0.17 0.01 70)' },
        overlay: { light: 'oklch(0.25 0.02 60 / 0.4)', dark: 'oklch(0 0 0 / 0.6)' },
        inverse: { light: 'oklch(0.24 0.015 60)', dark: 'oklch(0.94 0.012 85)' },
      },
      fg: {
        default: { light: 'oklch(0.22 0.015 60)', dark: 'oklch(0.93 0.012 85)' },
        muted: { light: 'oklch(0.42 0.015 60)', dark: 'oklch(0.78 0.012 85)' },
        subtle: { light: 'oklch(0.5 0.015 60)', dark: 'oklch(0.7 0.012 85)' },
        inverse: { light: 'oklch(0.96 0.012 85)', dark: 'oklch(0.22 0.015 60)' },
      },
      border: {
        default: { light: 'oklch(0.86 0.015 80)', dark: 'oklch(0.36 0.012 70)' },
        muted: { light: 'oklch(0.91 0.012 80)', dark: 'oklch(0.3 0.012 70)' },
        strong: { light: 'oklch(0.55 0.015 60)', dark: 'oklch(0.6 0.012 80)' },
        focus: { light: 'oklch(0.45 0.12 258)', dark: 'oklch(0.75 0.1 258)' },
      },
      accent: {
        default: { light: 'oklch(0.45 0.12 258)', dark: 'oklch(0.54 0.12 258)' },
        hover: { light: 'oklch(0.4 0.12 258)', dark: 'oklch(0.5 0.12 258)' },
        active: { light: 'oklch(0.36 0.11 258)', dark: 'oklch(0.46 0.11 258)' },
        subtle: { light: 'oklch(0.94 0.03 258)', dark: 'oklch(0.3 0.06 258)' },
        fg: 'oklch(0.98 0.008 85)',
        text: { light: 'oklch(0.45 0.12 258)', dark: 'oklch(0.8 0.09 258)' },
      },
      success: {
        bg: { light: 'oklch(0.94 0.035 145)', dark: 'oklch(0.28 0.04 145)' },
        fg: { light: 'oklch(0.38 0.08 145)', dark: 'oklch(0.86 0.08 145)' },
        border: { light: 'oklch(0.8 0.06 145)', dark: 'oklch(0.42 0.06 145)' },
        solid: 'oklch(0.48 0.1 145)',
        onSolid: 'oklch(0.98 0.008 85)',
      },
      warning: {
        bg: { light: 'oklch(0.95 0.05 85)', dark: 'oklch(0.3 0.05 75)' },
        fg: { light: 'oklch(0.42 0.09 65)', dark: 'oklch(0.88 0.09 85)' },
        border: { light: 'oklch(0.82 0.09 80)', dark: 'oklch(0.45 0.07 75)' },
        solid: 'oklch(0.8 0.13 80)',
        onSolid: 'oklch(0.24 0.04 60)',
      },
      danger: {
        bg: { light: 'oklch(0.94 0.035 25)', dark: 'oklch(0.28 0.06 25)' },
        fg: { light: 'oklch(0.43 0.15 25)', dark: 'oklch(0.85 0.08 25)' },
        border: { light: 'oklch(0.8 0.08 25)', dark: 'oklch(0.45 0.1 25)' },
        solid: 'oklch(0.5 0.18 27)',
        onSolid: 'oklch(0.98 0.008 85)',
      },
      info: {
        bg: { light: 'oklch(0.94 0.025 240)', dark: 'oklch(0.28 0.04 240)' },
        fg: { light: 'oklch(0.4 0.09 245)', dark: 'oklch(0.85 0.06 240)' },
        border: { light: 'oklch(0.8 0.05 240)', dark: 'oklch(0.44 0.06 240)' },
        solid: 'oklch(0.47 0.1 245)',
        onSolid: 'oklch(0.98 0.008 85)',
      },
      selection: {
        bg: { light: 'oklch(0.88 0.06 25)', dark: 'oklch(0.42 0.1 25)' },
        fg: { light: 'oklch(0.2 0.02 25)', dark: 'oklch(0.97 0.01 85)' },
      },
    },
    font: {
      family: {
        sans: '"Source Sans 3", "Inter", ui-sans-serif, system-ui, -apple-system, "Segoe UI", sans-serif',
        serif: '"Fraunces", "Source Serif 4", "Iowan Old Style", "Palatino Linotype", Palatino, Georgia, ui-serif, serif',
        display: 'var(--m-font-family-serif)',
      },
      size: { md: '1.0625rem', '3xl': '2rem', '4xl': '2.625rem' },
      leading: { normal: '1.6', relaxed: '1.75' },
      heading: { weight: '600', tracking: '-0.005em' },
    },
    space: { unit: '0.28rem' },
    radius: { sm: '2px', md: '3px', lg: '4px' },
    shadow: { sm: 'none', md: 'none', lg: 'none', overlay: '0 24px 48px oklch(0.2 0.02 60 / 0.18)' },
    focus: { width: '2px', offset: '3px' },
  },
  components: {
    button: { fontWeight: 'var(--m-font-weight-semibold)', radius: 'var(--m-radius-sm)' },
    card: {
      shadow: 'none',
      hoverShadow: 'none',
      titleFamily: 'var(--m-font-family-serif)',
      titleSize: 'var(--m-font-size-xl)',
      hoverBorder: 'var(--m-color-border-strong)',
    },
    table: {
      headerBg: 'transparent',
      headerTransform: 'uppercase',
      headerTracking: 'var(--m-font-tracking-wide)',
      headerFontSize: 'var(--m-font-size-xs)',
      wrapBorderWidth: '0',
      stripeBg: 'transparent',
    },
    dialog: { titleFamily: 'var(--m-font-family-serif)' },
    navbar: { brandFamily: 'var(--m-font-family-serif)', shadow: 'none' },
    prose: { lineHeight: 'var(--m-font-leading-relaxed)', headingFg: 'var(--m-color-fg-default)' },
    badge: { radius: 'var(--m-radius-sm)' },
    tabs: { textTransform: 'none' },
  },
});
