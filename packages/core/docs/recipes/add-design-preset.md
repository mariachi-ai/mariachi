# Recipe: add a design preset

Goal: add a built-in `nordic` preset (cool greys, a teal accent, generous radius) to
`@mariachi/design`. To restyle only your app, you don't need a built-in preset: use
`mariachi design new-theme` and `mariachi.design.ts` instead (see [design.md](../design.md)).

## 1. Define it

`packages/design/src/presets/nordic.ts`. `defineTheme` must give every required semantic token
(colours, the sans stack, the radius scale, shadows); everything else has a default:

```ts
import { defineTheme } from '../engine/theme';

export const nordic = defineTheme({
  name: 'nordic',
  label: 'Nordic',
  description: 'Cool greys, a teal accent and generous radius.',
  tokens: {
    color: {
      bg: { canvas: { light: 'oklch(0.98 0.005 230)', dark: 'oklch(0.18 0.01 230)' } /* , … */ },
      // fg, border, accent, success, warning, danger, info, selection
    },
    font: { family: { sans: '"Inter", ui-sans-serif, system-ui, sans-serif' } },
    radius: { sm: '6px', md: '10px', lg: '16px' },
    shadow: { sm: '…', md: '…', lg: '…', overlay: '…' },
  },
  // Only components that should differ from their semantic defaults:
  components: { card: { shadow: 'none' } },
});
```

Use `oklch()`, `rgb()`, `hsl()` or hex for every colour in a contrast pair; the checker can't evaluate
`color-mix()`.

Register it in `src/presets/index.ts` (display order) and export it from `src/index.ts`.

## 2. Check it

```bash
cd packages/design
pnpm test:unit     # every contrast pair, both modes, nothing unchecked
pnpm build
pnpm explore:dev   # /design/presets/nordic/, then compare it with the others at /design/compare/
```

If the preset needs something tokens can't express, add a component token (with a semantic default)
instead of preset-specific CSS. That keeps every other preset and every app override working.

## 3. Ship it

Add the preset to the table in [design.md](../design.md), generate the Linux visual baselines (see
[explorer.md](../explorer.md#tests)) and add a changeset.
