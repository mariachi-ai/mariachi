# @mariachi/search

Full-text search on Typesense (or in memory for tests), with typed fields including arrays,
safe equality filters, facets, alias-based zero-downtime reindexing and query analytics.

**Status: beta.** Covered by unit tests, a Typesense integration test and the search contract
suite. The API can change before 1.0.

Guide: [search.md](../core/docs/search.md)

## Public API

| Export | Purpose |
| --- | --- |
| `createSearch(config)` | `TypesenseSearchAdapter` or `MemorySearchAdapter` |
| `DefaultSearch` | `search(ctx, index, query)`, `indexDocument`, `removeDocument`, `connect`, `disconnect`, `isHealthy` |
| `SearchIndexer` | `syncDocument`, `removeDocument`, `reindexAll` (through an alias on Typesense) |
| `SearchAnalytics`, `MemorySearchAnalytics`, `RedisListAnalytics` | Best-effort query analytics |
| `SearchIndex`, `SearchField`, `SearchFieldType`, `SearchQuery`, `SearchResult` | Types |

## Config

| Option | Env | Notes |
| --- | --- | --- |
| `adapter` | `SEARCH_ADAPTER` | `'typesense'` or `'memory'` |
| `url` | `TYPESENSE_URL` | Default `http://localhost:8108` |
| `apiKey` | `TYPESENSE_API_KEY` | Admin key for indexing, a search-only key for read-only processes |

Index options: `fields` (typed; `string`, `int32`, `int64`, `float`, `bool` and their `[]` arrays)
and `defaultSortingField` (numeric). Errors are `SearchError`.
