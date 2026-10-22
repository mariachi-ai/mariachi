import { defineTheme } from '../engine/theme';

/** Monospace everywhere, outline borders, square corners and a phosphor-green accent. */
export const terminal = defineTheme({
  name: 'terminal',
  label: 'Terminal',
  description: 'Monospace everywhere, outline borders, square corners, no shadows and a phosphor accent. Dark-first.',
  tokens: {
    color: {
      bg: {
        canvas: { light: 'oklch(0.96 0.015 110)', dark: 'oklch(0.16 0.012 150)' },
        surface: { light: 'oklch(0.985 0.01 110)', dark: 'oklch(0.19 0.014 150)' },
        raised: { light: 'oklch(0.99 0.008 110)', dark: 'oklch(0.22 0.016 150)' },
        sunken: { light: 'oklch(0.93 0.02 110)', dark: 'oklch(0.13 0.01 150)' },
        overlay: { light: 'oklch(0.2 0.02 150 / 0.45)', dark: 'oklch(0 0 0 / 0.7)' },
        inverse: { light: 'oklch(0.2 0.015 150)', dark: 'oklch(0.86 0.17 145)' },
      },
      fg: {
        default: { light: 'oklch(0.24 0.03 150)', dark: 'oklch(0.88 0.13 145)' },
        muted: { light: 'oklch(0.4 0.04 150)', dark: 'oklch(0.76 0.1 145)' },
        subtle: { light: 'oklch(0.47 0.04 150)', dark: 'oklch(0.67 0.08 145)' },
        inverse: { light: 'oklch(0.9 0.15 145)', dark: 'oklch(0.16 0.012 150)' },
      },
      border: {
        default: { light: 'oklch(0.5 0.05 150)', dark: 'oklch(0.48 0.09 145)' },
        muted: { light: 'oklch(0.82 0.03 120)', dark: 'oklch(0.32 0.05 145)' },
        strong: { light: 'oklch(0.3 0.04 150)', dark: 'oklch(0.75 0.13 145)' },
        focus: { light: 'oklch(0.5 0.14 145)', dark: 'oklch(0.85 0.17 95)' },
      },
      accent: {
        default: { light: 'oklch(0.48 0.13 145)', dark: 'oklch(0.82 0.19 145)' },
        hover: { light: 'oklch(0.44 0.12 145)', dark: 'oklch(0.87 0.17 145)' },
        active: { light: 'oklch(0.4 0.11 145)', dark: 'oklch(0.78 0.19 145)' },
        subtle: { light: 'oklch(0.92 0.05 140)', dark: 'oklch(0.27 0.06 145)' },
        fg: { light: 'oklch(0.98 0.01 110)', dark: 'oklch(0.14 0.012 150)' },
        text: { light: 'oklch(0.44 0.12 145)', dark: 'oklch(0.84 0.18 145)' },
      },
      success: {
        bg: { light: 'oklch(0.92 0.05 145)', dark: 'oklch(0.26 0.06 145)' },
        fg: { light: 'oklch(0.36 0.09 145)', dark: 'oklch(0.88 0.15 145)' },
        border: { light: 'oklch(0.5 0.1 145)', dark: 'oklch(0.6 0.13 145)' },
        solid: { light: 'oklch(0.46 0.12 145)', dark: 'oklch(0.8 0.18 145)' },
        onSolid: { light: 'oklch(0.98 0.01 110)', dark: 'oklch(0.14 0.012 150)' },
      },
      warning: {
        bg: { light: 'oklch(0.94 0.06 90)', dark: 'oklch(0.28 0.06 85)' },
        fg: { light: 'oklch(0.4 0.09 70)', dark: 'oklch(0.88 0.15 90)' },
        border: { light: 'oklch(0.55 0.1 75)', dark: 'oklch(0.65 0.13 85)' },
        solid: 'oklch(0.83 0.16 85)',
        onSolid: 'oklch(0.18 0.03 70)',
      },
      danger: {
        bg: { light: 'oklch(0.93 0.04 25)', dark: 'oklch(0.27 0.07 25)' },
        fg: { light: 'oklch(0.44 0.15 25)', dark: 'oklch(0.8 0.13 25)' },
        border: { light: 'oklch(0.5 0.15 25)', dark: 'oklch(0.62 0.17 25)' },
        solid: { light: 'oklch(0.5 0.18 27)', dark: 'oklch(0.7 0.18 27)' },
        onSolid: { light: 'oklch(0.98 0.01 110)', dark: 'oklch(0.14 0.012 150)' },
      },
      info: {
        bg: { light: 'oklch(0.93 0.035 220)', dark: 'oklch(0.26 0.05 220)' },
        fg: { light: 'oklch(0.4 0.09 230)', dark: 'oklch(0.85 0.1 210)' },
        border: { light: 'oklch(0.5 0.09 230)', dark: 'oklch(0.62 0.1 210)' },
        solid: { light: 'oklch(0.47 0.1 230)', dark: 'oklch(0.78 0.12 210)' },
        onSolid: { light: 'oklch(0.98 0.01 110)', dark: 'oklch(0.14 0.012 150)' },
      },
      selection: {
        bg: { light: 'oklch(0.48 0.13 145)', dark: 'oklch(0.82 0.19 145)' },
        fg: { light: 'oklch(0.98 0.01 110)', dark: 'oklch(0.14 0.012 150)' },
      },
    },
    font: {
      family: {
        sans: '"JetBrains Mono", "Berkeley Mono", "IBM Plex Mono", ui-monospace, SFMono-Regular, Menlo, Consolas, monospace',
        mono: '"JetBrains Mono", "Berkeley Mono", "IBM Plex Mono", ui-monospace, SFMono-Regular, Menlo, Consolas, monospace',
        serif: 'var(--m-font-family-mono)',
      },
      size: { md: '0.9375rem', '3xl': '1.625rem', '4xl': '2rem' },
      heading: { weight: '700', transform: 'uppercase', tracking: '0.06em' },
      tracking: { tight: '0' },
    },
    radius: { sm: '0', md: '0', lg: '0' },
    borderWidth: { control: '1px', container: '1px' },
    shadow: { sm: 'none', md: 'none', lg: 'none', overlay: 'none' },
    focus: { width: '3px', offset: '2px', style: 'dashed' },
    motion: { duration: { fast: '0ms', normal: '80ms' }, easing: { standard: 'steps(2, end)' } },
  },
  components: {
    button: { textTransform: 'uppercase', tracking: 'var(--m-font-tracking-wide)', fontWeight: 'var(--m-font-weight-bold)' },
    card: { shadow: 'none', hoverShadow: 'none', hoverBorder: 'var(--m-color-accent-default)' },
    badge: { radius: '0', textTransform: 'uppercase', tracking: 'var(--m-font-tracking-wide)' },
    avatar: { radius: '0' },
    switch: { radius: '0' },
    table: { headerTransform: 'uppercase', headerTracking: 'var(--m-font-tracking-wide)' },
    chat: { radius: '0' },
    composer: { radius: '0' },
    tabs: { textTransform: 'uppercase' },
  },
});
