# Design library

`@mariachi/design` is tokens and CSS for any web app: React, Vue, Svelte, server-rendered HTML, or
none. Every preset satisfies one token contract, so switching designs is one attribute, and changing
one thing is one line. Status: **alpha**. Browse every component and preset in the explorer
([explorer.md](./explorer.md)), and see [design-catalog.md](./design-catalog.md) for the generated list.

## Use it

```html
<link rel="stylesheet" href="node_modules/@mariachi/design/dist/css/mariachi.css">
<link rel="stylesheet" href="node_modules/@mariachi/design/dist/css/themes/minimal.css">

<html data-theme="minimal" data-mode="auto">
  <button class="m-button" data-variant="primary">Save</button>
</html>
```

With a bundler, import `@mariachi/design/mariachi.css` and `@mariachi/design/themes/<preset>.css`, or
only what you use: `@mariachi/design/base.css` plus `@mariachi/design/components/<name>.css`.

- `data-theme` picks the preset. Nest another `data-theme` to restyle a region.
- `data-mode` is `auto` (follows the OS), `light` or `dark`. Put it on the element that carries
  `data-theme`.
- The element with `data-theme` paints its own canvas, text colour and font.

## Presets

| Preset | Character |
| --- | --- |
| `minimal` | Neutral greys, one blue accent, 6px radius, soft shadows. The default. |
| `brutalist` | No radius, thick borders, hard offset shadows, uppercase headings, a loud accent. |
| `editorial` | Serif headings, warm paper, ink-blue accent, hairline rules, no shadows. |
| `soft` | Pastels, pill controls, large radius, diffuse shadows, rounded type. |
| `enterprise` | Dense (density 0.85), small radius, compact type, strong tables. |
| `terminal` | Monospace everywhere, square corners, no shadows, phosphor-green dark mode. |

## Markup contract

- Components are classes prefixed `m-` (`.m-button`, `.m-card`). Parts are `.m-<component>-<part>`
  (`.m-card-header`, `.m-toast-title`).
- Options are data attributes: `data-variant`, `data-size` (`sm | md | lg`), `data-tone`
  (`neutral | accent | success | warning | danger | info`).
- State comes from HTML and ARIA, not classes: `disabled`, `aria-invalid`, `aria-selected`,
  `aria-current="page"`, `aria-busy`, `[open]`.
- Native elements first: `<dialog>`, `popover`, `<details>`, native form controls.

Never invent classes. If something is missing, compose components with the layout primitives
(`m-stack`, `m-cluster`, `m-grid`, `m-split`, `m-container`) or add a component (see
[recipes/add-design-component.md](./recipes/add-design-component.md)).

## Override anything, at any size

Every visual property in component CSS reads a token, and everything sits in cascade layers:

```css
@layer mariachi.reset, mariachi.theme, mariachi.base, mariachi.components, mariachi.overrides;
```

Your own unlayered CSS beats every layer, so overrides need no specificity tricks. If your app uses
layers too, put overrides in `mariachi.overrides`.

| Level | How | Example |
| --- | --- | --- |
| 1. One token, everywhere | a custom property on `:root` | `:root { --m-color-accent-default: oklch(0.62 0.19 25); }` |
| 2. One component | its component token | `:root { --m-button-radius: 999px; }` |
| 3. One variant or one area | a scoped rule | `.marketing .m-card { --m-card-shadow: none; }` |
| 4. Replace a component | `replace` in `mariachi.design.ts` | `replace: { card: './src/styles/card.css' }` |
| 5. A whole preset | `extendTheme` | `extendTheme(minimal, { name: 'acme', tokens: { … } })` |

Component tokens fall back to semantic tokens on the component's own element, so a scoped semantic
override (`.marketing { --m-color-accent-default: … }`) reaches every component inside `.marketing`.
Semantic tokens that alias other semantic tokens (`--m-radius-control` → `--m-radius-md`) resolve where
the theme is applied; override the token components read (`--m-radius-control`) when you scope.

### `mariachi.design.ts`

Levels 4 and 5, plus choosing components, go in a typed config:

```ts
import { defineDesign } from '@mariachi/design';

export default defineDesign({
  base: 'minimal',                        // a preset name or a theme from extendTheme
  include: ['button', 'input', 'card'],   // dependencies are added automatically
  tokens: { color: { accent: { default: { light: 'oklch(0.55 0.2 260)', dark: 'oklch(0.72 0.16 260)' } } } },
  components: { button: { radius: '999px' } },
  replace: { card: './src/styles/card.css' },
});
```

```bash
mariachi design build -o src/styles/design.css   # base CSS, chosen components, base theme, and only the changed tokens
mariachi design check                           # unknown tokens and contrast; exits 1 on failures
```

`buildDesign()` from `@mariachi/design/build` does the same from code. Unknown tokens, components and
presets throw `DesignError` with a code (`design/invalid-config`, `design/unknown-component`,
`design/unknown-preset`).

### Your own preset

```bash
mariachi design new-theme acme --from soft      # writes src/styles/acme.theme.ts
```

```ts
import { extendTheme, soft } from '@mariachi/design';

export const acme = extendTheme(soft, {
  name: 'acme',
  tokens: { color: { accent: { default: 'oklch(0.55 0.2 30)' } } },
});
```

A partial per-mode value (`{ dark: '…' }`) changes one mode and keeps the other. `defineTheme()` defines
a preset from scratch and must give every required token. See
[recipes/add-design-preset.md](./recipes/add-design-preset.md) for adding a built-in preset.

The [explorer's playground](./explorer.md) edits tokens live, re-checks contrast, and writes the
override CSS or the config for you.

## Tokens

- **Semantic tokens** (`--m-color-bg-surface`, `--m-radius-control`, `--m-space-4`): what every preset
  defines. Colours, the sans font stack, the radius scale and shadows are required; spacing, type scale, motion
  and z-index have defaults.
- **Component tokens** (`--m-button-radius`, `--m-card-shadow`): each defaults to a semantic token. A
  preset sets one only when that component should differ.
- The CSS name is the token path in kebab case under `--m-` (`color.bg.surface` →
  `--m-color-bg-surface`; `components.button.paddingX.md` → `--m-button-padding-x-md`).
- Colour values can be one value or `{ light, dark }`.
- `@mariachi/design/tokens/<preset>.json` is the preset in W3C Design Tokens (DTCG) format, for
  Figma (Tokens Studio) and other tools.
- `@mariachi/design/tailwind.css` maps Tailwind v4's theme onto the tokens: `@import "tailwindcss";`,
  then this file and a preset theme. `bg-surface`, `text-fg-muted`, `rounded-control` and spacing
  utilities follow the active preset.

## Accessibility

- Every preset passes the contrast pairs in the contract in both modes: 4.5:1 for text, 3:1 for
  borders and focus rings. Components add their own pairs. `checkTheme()` and `mariachi design check`
  run the same pairs on your overrides.
- `--m-control-min-target` (24px) keeps pointer targets and their spacing at WCAG 2.5.8 size even in
  dense presets.
- Under `prefers-reduced-motion: reduce`, every duration token is 0ms.
- Each component documents its accessibility contract (labels, roles, ARIA) in the explorer and the
  catalog.

## Behaviours (optional)

Most components need no JavaScript. `@mariachi/design/behaviors` adds what CSS can't, delegated from
one root so later markup works too:

```ts
import { enhance, toast } from '@mariachi/design/behaviors';

enhance(); // tabs and menus (keyboard), dialog openers, copy buttons, auto-growing composer
toast({ title: 'Saved', tone: 'success' });
```
