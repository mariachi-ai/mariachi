# Search

`@mariachi/search` indexes your data in Typesense (or in memory for tests) and queries it with
typed fields, filters, facets and query analytics.

## Wire it

```ts
import { DefaultSearch, SearchAnalytics, SearchIndexer, RedisListAnalytics, createSearch, type SearchIndex } from '@mariachi/search';

const client = createSearch({ adapter: 'typesense', url: config.search.url, apiKey: config.search.apiKey });
const search = new DefaultSearch({ client, analytics: new SearchAnalytics({ store: new RedisListAnalytics(redis) }) }, instrumentation);
lifecycle.manage('search', search);   // connect loads every collection and alias from Typesense
```

## Define an index

```ts
const products = {
  name: 'products',
  fields: [
    { name: 'title', type: 'string' },
    { name: 'tags', type: 'string[]', facet: true },
    { name: 'tenantId', type: 'string', facet: true },
    { name: 'price', type: 'float' },
    { name: 'popularity', type: 'int32' },
  ],
  defaultSortingField: 'popularity',   // optional; numeric, and every document must have it
} satisfies SearchIndex;
```

Field types are `string`, `int32`, `int64`, `float`, `bool` (aliases: `int`, `number`, `boolean`)
and array forms such as `string[]`. Any other type is a compile error and a runtime
`search/invalid-field-type`. Fields are optional unless they're the default sorting field.

## Query

```ts
const result = await search.search<Product>(ctx, 'products', {
  query: 'wool hat',
  queryBy: ['title'],                               // default: every string field of the index
  filters: { tenantId: ctx.tenantId!, tags: 'winter' },
  facets: ['tags'],
  sort: 'price:asc',
  page: 1, pageSize: 20,
});
```

- Without `queryBy`, the index's string fields are searched. An index with no string fields
  requires `queryBy` (`search/missing-query-fields`); there's no `'.*'` wildcard default.
- Filters are equality filters joined with `&&`. On an array field, a filter matches when the
  array contains the value. String values are quoted, so a value containing `&&` or `,` stays one
  value; a value containing a backtick is rejected (`search/invalid-input`).
- Search isn't tenant-scoped by itself. Put `tenantId` in your documents and filter on it (or use
  one index per tenant).
- Schemas come from Typesense, so a process that never created an index can still query it or its
  alias.

## Reindex without downtime

```ts
await new SearchIndexer(client).reindexAll('products', products, allProducts);
```

With Typesense, `reindexAll` builds a new collection (`products_<timestamp>`), fills it, points the
`products` alias at it, and then deletes the collection the alias used before. Readers query the
alias throughout. An existing *collection* named `products` blocks this (`search/alias-conflict`):
delete or rename it once, then reindex.

## Analytics

`SearchAnalytics` records query, index, hit count and latency for every search, in memory or in
a capped Redis list (`RedisListAnalytics`, 10,000 entries by default). Recording is best-effort: an
analytics failure is logged and the search still returns.

## Errors

`SearchError`: `search/invalid-field-type`, `search/invalid-input` (400),
`search/missing-query-fields` (400), `search/index-not-found` (404), `search/index-exists` and
`search/alias-conflict` (409), `search/query-failed` and `search/request-failed`.
