# Changesets

Every PR that changes a published `@mariachi/*` package needs a changeset:

```bash
pnpm changeset
```

All `@mariachi/*` packages are in one `fixed` group, so they always share a single version. Merging to `main` opens a "Version Packages" PR, and merging that PR publishes to npm.
