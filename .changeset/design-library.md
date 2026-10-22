---
'@mariachi/design': minor
'@mariachi/core': minor
---

Add `@mariachi/design` (alpha): framework-agnostic tokens and CSS for any web app.

- One token contract (semantic and component tiers) and six presets: minimal, brutalist, editorial,
  soft, enterprise, terminal. Switch with `data-theme`; `data-mode` is `auto`, `light` or `dark`.
- 36 components as plain HTML + CSS (`m-` classes, data attributes, ARIA state), including AI patterns:
  chat, thinking, tool calls, citations, composer and usage meters.
- Override at any granularity: one token, one component, one area, a replaced component
  (`replace` in `mariachi.design.ts`), or a whole preset (`extendTheme`). `buildDesign` emits only the
  tokens you changed.
- Every preset passes WCAG contrast pairs in both modes; `checkTheme` runs them on your overrides.
- DTCG token export, a Tailwind v4 theme mapping, and an optional behaviours script.

`@mariachi/core` gains a dependency-free `@mariachi/core/errors` subpath (the error classes only), for
browser-safe packages.
