# Recipe: add a design component

Goal: add a `stat` component (a labelled number with a trend) to `@mariachi/design`, readable by every
preset and overridable token by token. Follow [design.md](../design.md) for the markup contract.

## 1. Create the folder

A component is three files in `packages/design/src/components/<name>/`. The registry
(`components/index.ts`, `components/examples.ts`) is generated from the folders, so there's nothing
else to edit.

`stat/stat.ts`: metadata and tokens. Every token needs a default, usually a `ref()` to a semantic
token, so presets only set what should differ:

```ts
import { defineComponent } from '../../contract/component';
import { ref, t } from '../../contract/tokens';

export const stat = defineComponent({
  name: 'stat',
  title: 'Stat',
  category: 'data',
  description: 'A labelled number with an optional trend.',
  useWhen: 'Headline numbers on dashboards.',
  anatomy: {
    '.m-stat': 'Wrapper',
    '.m-stat-label': 'What the number is',
    '.m-stat-value': 'The number',
    '[data-trend]': 'up | down: colours the trend',
  },
  tokens: {
    labelFg: t.color('Label text', ref('color.fg.muted')),
    valueSize: t.length('Value size', ref('font.size.3xl')),
    upFg: t.color('Upward trend text', ref('color.success.fg')),
  },
  contrast: [{ fg: 'labelFg', bg: 'color.bg.surface', min: 4.5 }],
  a11y: ['Say the direction in text ("up 12%"), not only with colour or an arrow.'],
});
```

`stat/stat.css`: always inside the components layer, reading only tokens. Variants set private
`--_*` properties; state rules set real ones:

```css
@layer mariachi.components {
  .m-stat-label {
    color: var(--m-stat-label-fg);
  }

  .m-stat-value {
    font-size: var(--m-stat-value-size);
  }
}
```

The build adds each token's default as the `var()` fallback (`var(--m-stat-label-fg, var(--m-color-fg-muted))`),
so defaults live in one place and scoped overrides reach the component.

`stat/stat.examples.ts`: realistic examples. They become the explorer page, the browser tests and the
catalog:

```ts
import { defineExamples } from '../../contract/component';

export default defineExamples('stat', [
  { name: 'Default', html: '<div class="m-stat"><span class="m-stat-label">Requests</span><span class="m-stat-value">1.28M</span></div>' },
]);
```

## 2. Check it

```bash
cd packages/design
pnpm test:unit     # unknown tokens, unused tokens, undefined classes in examples, contrast in every preset
pnpm lint          # stylelint: no colour literals, no raw radius/shadow/font-size, m- classes only
pnpm build
pnpm explore:dev   # from the repo root: /design/components/stat/ in every preset
```

A preset that needs the component to look different sets its tokens under `components.stat` in
`src/presets/<preset>.ts`; never add preset-specific CSS.

## 3. Ship it

Add a changeset. `pnpm docs:catalog` refreshes [design-catalog.md](../design-catalog.md), and the
explorer picks the component up on its next build.
