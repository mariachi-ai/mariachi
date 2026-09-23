# Feature flags

Feature flags come from `@mariachi/config`. Use static flags for kill switches that ship with the
code, and the `feature_flags` table for anything you want to change at runtime or per tenant.

## Wire it

```ts
import { createFeatureFlags } from '@mariachi/config';
import { DrizzleFeatureFlagStore } from '@mariachi/config/postgres';

const flagStore = new DrizzleFeatureFlagStore(db);
const flags = createFeatureFlags({ adapter: 'store', store: flagStore, cacheTtlMs: 30_000 });

// Static, for tests or config-driven switches:
const staticFlags = createFeatureFlags({ adapter: 'static', flags: { 'new-editor': true } });
```

Add `featureFlagsTable` from `@mariachi/config/schema`.

## Check

```ts
if (await flags.isEnabled('new-editor', { tenantId: ctx.tenantId, userId: ctx.userId })) { ... }
const variant = await flags.getVariant('checkout-copy', { tenantId: ctx.tenantId });   // undefined when off
```

A flag is evaluated in this order:

1. The tenant's override, if the flag has one for `tenantId`.
2. The user allowlist (`metadata.users`).
3. The percentage rollout (`metadata.rolloutPercent`), bucketed by a hash of the flag and the user
   (or tenant) id. The same subject always gets the same answer, and raising the percentage only
   adds subjects.
4. The flag's default `enabled`.

An unknown flag is off.

## Change

```ts
await flagStore.set({ key: 'new-editor', enabled: false, metadata: { rolloutPercent: 10 }, description: 'Block editor' });
await flagStore.setTenantOverride('new-editor', 'acme', true);                        // on for one tenant
await flagStore.setTenantOverride('checkout-copy', 'acme', { enabled: true, variant: 'b' });
await flagStore.setTenantOverride('new-editor', 'acme', null);                        // remove the override
flags.invalidate?.('new-editor');
```

`set` keeps existing tenant overrides. `setTenantOverride` changes one tenant in a single statement,
so concurrent edits for different tenants don't overwrite each other.

## Caching

The `store` adapter caches each flag for `cacheTtlMs` (default 30s; `0` disables it). After a write,
`flags.invalidate(key)` refreshes this process right away; other processes pick up the change when
their cache expires. Keep the TTL short enough that this delay is acceptable for your kill
switches.
