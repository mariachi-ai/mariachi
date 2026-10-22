---
'@mariachi/explorer': minor
'@mariachi/cli': minor
---

Add `@mariachi/explorer` (alpha): one searchable site for every package, doc, exported symbol, error
code, CLI command, framework table and design component, generated from the repo at build time and
styled with `@mariachi/design`.

`@mariachi/cli` adds:

- `mariachi explore`: serves the explorer for the installed version (needs `@mariachi/explorer`).
- `mariachi design build|check|new-theme|list`: build one CSS file from `mariachi.design.ts`, check
  contrast, scaffold a theme that extends a preset.
- `@mariachi/cli/program`: the command tree without parsing argv.
