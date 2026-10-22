# @mariachi/design

Framework-agnostic design library: one token contract, six interchangeable presets, 36 components as
plain HTML + CSS, and overrides at any granularity: one token, one component, one area, a replaced
component, or a whole preset.

**Status: alpha.** Covered by unit tests (contract, engine, contrast in every preset) and the explorer's
browser tests (axe, visual regression, override isolation). Expect breaking changes before 1.0.

Guide: [design.md](../core/docs/design.md) · Catalog: [design-catalog.md](../core/docs/design-catalog.md) ·
Browse it: [explorer.md](../core/docs/explorer.md)

## Imports

| Import | Contents |
| --- | --- |
| `@mariachi/design` | Browser-safe API: `defineTheme`, `extendTheme`, `defineDesign`, presets, the contract, `checkTheme`, colour and contrast helpers |
| `@mariachi/design/build` | Node API: `buildDesign`, `packageAssets`, `buildCatalog` (used by `mariachi design`) |
| `@mariachi/design/behaviors` | Optional browser script: `enhance()`, `toast()` |
| `@mariachi/design/mariachi.css` | Foundation and every component, no theme (`mariachi.min.css` minified) |
| `@mariachi/design/base.css`, `components.css`, `components/<name>.css` | Pieces, for importing only what you use |
| `@mariachi/design/themes/<preset>.css` | One preset, scoped to `[data-theme="<preset>"]` |
| `@mariachi/design/tokens/<preset>.json` | The preset as W3C Design Tokens (DTCG) |
| `@mariachi/design/tailwind.css` | Tailwind v4 theme mapped onto the tokens |
| `@mariachi/design/catalog.json` | Components (anatomy, tokens, examples, a11y), presets and tokens |

## Public API

| Export | Purpose |
| --- | --- |
| `presets`, `minimal`, `brutalist`, `editorial`, `soft`, `enterprise`, `terminal` | Built-in themes |
| `defineTheme(def)` | A complete theme; every required token must be given |
| `extendTheme(base, ext)` | A theme that changes only what `ext` sets (per-mode partials allowed) |
| `defineDesign(config)` | Validates a `mariachi.design.ts` config and resolves its theme and components |
| `buildDesign(config, opts)` | One CSS file: foundation, chosen components, base theme, changed tokens only |
| `checkTheme(theme)` | Every contrast pair in both modes; failures name the pair and ratio |
| `emitThemeCss`, `emitOverridesCss`, `emitDtcg`, `emitTailwindCss` | Emitters |
| `contract`, `tokenList`, `componentList` | The token contract and component metadata |
| `DesignError` | Codes: `design/invalid-theme`, `design/invalid-config`, `design/unknown-preset`, `design/unknown-component`, `design/unknown-token`, `design/missing-asset` |

## Config

None at runtime. Apps configure overrides in `mariachi.design.ts` and build with
`mariachi design build`; see [design.md](../core/docs/design.md#mariachidesignts). `lightningcss` is an
optional peer, needed only for `buildDesign({ minify: true })`.

## Development

```bash
pnpm --filter @mariachi/design build      # registry, JS, then dist/css, dist/tokens, dist/catalog.json
pnpm --filter @mariachi/design test:unit
pnpm explore:dev                           # see every component and preset
```

Adding a component or preset: [add-design-component.md](../core/docs/recipes/add-design-component.md),
[add-design-preset.md](../core/docs/recipes/add-design-preset.md).
