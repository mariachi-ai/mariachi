import { defineTheme } from '../engine/theme';

const glow = (alpha: number) => `oklch(0.45 0.08 285 / ${alpha})`;

/** Pastels, pill controls, big rounded containers and diffuse shadows. */
export const soft = defineTheme({
  name: 'soft',
  label: 'Soft',
  description: 'Pastel palette, pill-shaped controls, large rounded containers and diffuse shadows.',
  tokens: {
    color: {
      bg: {
        canvas: { light: 'oklch(0.975 0.012 290)', dark: 'oklch(0.2 0.025 285)' },
        surface: { light: 'oklch(0.995 0.005 290)', dark: 'oklch(0.245 0.03 285)' },
        raised: { light: 'oklch(1 0 0)', dark: 'oklch(0.28 0.032 285)' },
        sunken: { light: 'oklch(0.95 0.02 290)', dark: 'oklch(0.18 0.022 285)' },
        overlay: { light: 'oklch(0.35 0.06 285 / 0.3)', dark: 'oklch(0.05 0.02 285 / 0.6)' },
        inverse: { light: 'oklch(0.3 0.04 285)', dark: 'oklch(0.94 0.015 290)' },
      },
      fg: {
        default: { light: 'oklch(0.28 0.04 285)', dark: 'oklch(0.95 0.012 290)' },
        muted: { light: 'oklch(0.46 0.04 285)', dark: 'oklch(0.8 0.025 290)' },
        subtle: { light: 'oklch(0.52 0.035 285)', dark: 'oklch(0.72 0.03 290)' },
        inverse: { light: 'oklch(0.97 0.01 290)', dark: 'oklch(0.28 0.04 285)' },
      },
      border: {
        default: { light: 'oklch(0.9 0.02 290)', dark: 'oklch(0.36 0.035 285)' },
        muted: { light: 'oklch(0.94 0.015 290)', dark: 'oklch(0.3 0.03 285)' },
        strong: { light: 'oklch(0.62 0.05 285)', dark: 'oklch(0.6 0.04 290)' },
        focus: { light: 'oklch(0.58 0.15 280)', dark: 'oklch(0.78 0.1 280)' },
      },
      accent: {
        default: { light: 'oklch(0.55 0.15 280)', dark: 'oklch(0.56 0.14 280)' },
        hover: { light: 'oklch(0.5 0.15 280)', dark: 'oklch(0.52 0.14 280)' },
        active: { light: 'oklch(0.46 0.14 280)', dark: 'oklch(0.48 0.13 280)' },
        subtle: { light: 'oklch(0.94 0.035 285)', dark: 'oklch(0.33 0.06 285)' },
        fg: 'oklch(0.99 0.004 290)',
        text: { light: 'oklch(0.5 0.15 280)', dark: 'oklch(0.82 0.09 285)' },
      },
      success: {
        bg: { light: 'oklch(0.95 0.04 165)', dark: 'oklch(0.3 0.045 165)' },
        fg: { light: 'oklch(0.4 0.08 165)', dark: 'oklch(0.88 0.07 165)' },
        border: { light: 'oklch(0.86 0.06 165)', dark: 'oklch(0.44 0.06 165)' },
        solid: 'oklch(0.52 0.1 165)',
        onSolid: 'oklch(0.99 0.004 290)',
      },
      warning: {
        bg: { light: 'oklch(0.96 0.045 80)', dark: 'oklch(0.32 0.045 75)' },
        fg: { light: 'oklch(0.44 0.08 65)', dark: 'oklch(0.9 0.08 85)' },
        border: { light: 'oklch(0.87 0.08 80)', dark: 'oklch(0.47 0.06 75)' },
        solid: 'oklch(0.84 0.11 80)',
        onSolid: 'oklch(0.3 0.05 60)',
      },
      danger: {
        bg: { light: 'oklch(0.95 0.035 10)', dark: 'oklch(0.3 0.06 10)' },
        fg: { light: 'oklch(0.46 0.14 15)', dark: 'oklch(0.87 0.07 10)' },
        border: { light: 'oklch(0.86 0.07 10)', dark: 'oklch(0.46 0.09 10)' },
        solid: 'oklch(0.55 0.16 15)',
        onSolid: 'oklch(0.99 0.004 290)',
      },
      info: {
        bg: { light: 'oklch(0.95 0.03 230)', dark: 'oklch(0.3 0.045 230)' },
        fg: { light: 'oklch(0.43 0.09 235)', dark: 'oklch(0.87 0.06 230)' },
        border: { light: 'oklch(0.86 0.05 230)', dark: 'oklch(0.45 0.06 230)' },
        solid: 'oklch(0.52 0.1 235)',
        onSolid: 'oklch(0.99 0.004 290)',
      },
      selection: {
        bg: { light: 'oklch(0.88 0.06 285)', dark: 'oklch(0.45 0.1 285)' },
        fg: { light: 'oklch(0.25 0.05 285)', dark: 'oklch(0.98 0.005 290)' },
      },
    },
    font: {
      family: {
        sans: '"Nunito", ui-rounded, "SF Pro Rounded", "Hiragino Maru Gothic ProN", system-ui, -apple-system, "Segoe UI", sans-serif',
      },
      heading: { weight: '700', tracking: '0' },
    },
    radius: { sm: '10px', md: '14px', lg: '20px', control: 'var(--m-radius-full)' },
    shadow: {
      sm: { light: `0 1px 2px ${glow(0.06)}, 0 2px 6px ${glow(0.06)}`, dark: '0 1px 2px oklch(0 0 0 / 0.35), 0 2px 6px oklch(0 0 0 / 0.25)' },
      md: { light: `0 2px 4px ${glow(0.05)}, 0 8px 24px ${glow(0.09)}`, dark: '0 2px 4px oklch(0 0 0 / 0.35), 0 8px 24px oklch(0 0 0 / 0.35)' },
      lg: { light: `0 4px 10px ${glow(0.06)}, 0 20px 48px ${glow(0.13)}`, dark: '0 4px 10px oklch(0 0 0 / 0.4), 0 20px 48px oklch(0 0 0 / 0.45)' },
      overlay: { light: `0 8px 20px ${glow(0.08)}, 0 32px 80px ${glow(0.18)}`, dark: '0 8px 20px oklch(0 0 0 / 0.45), 0 32px 80px oklch(0 0 0 / 0.55)' },
    },
    focus: { width: '3px', offset: '2px', color: { light: 'oklch(0.58 0.15 280)', dark: 'oklch(0.78 0.1 280)' } },
    motion: { duration: { fast: '160ms', normal: '260ms' } },
  },
  components: {
    button: { shadow: 'var(--m-shadow-sm)', hoverTransform: 'translateY(-1px)', fontWeight: 'var(--m-font-weight-semibold)' },
    badge: { radius: 'var(--m-radius-full)' },
    avatar: { radius: 'var(--m-radius-full)' },
    card: { shadow: 'var(--m-shadow-md)', hoverShadow: 'var(--m-shadow-lg)', hoverTransform: 'translateY(-2px)', border: 'transparent' },
    input: { radius: 'var(--m-radius-md)' },
    select: { radius: 'var(--m-radius-md)' },
    composer: { radius: 'var(--m-radius-lg)', shadow: 'var(--m-shadow-md)' },
    chat: { radius: 'var(--m-radius-lg)' },
    tabs: { pill: { radius: 'var(--m-radius-full)', listRadius: 'var(--m-radius-full)' } },
    table: { wrapRadius: 'var(--m-radius-lg)', wrapShadow: 'var(--m-shadow-sm)' },
  },
});
