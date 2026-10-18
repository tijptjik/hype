# Deferred migrations

## Resource payload profile selectors (2026-09-12)

Organisation, project, layer and feature APIs accept `compact`, `default`, `map`,
`full` and `admin`. Existing `list`, `card` and `detail` selectors remain supported
while consumers migrate. This changes API projection contracts only; no physical
D1 schema migration is needed. Remove compatibility selectors after their remaining
callers and external contracts have migrated. Persistence/IndexedDB is postponed.
