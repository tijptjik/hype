# Feature spatial index

Feature points store H3 membership at resolutions 0 through 12. Every cell is computed directly from the point: an H3 parent cell is not an exact geometric container of its child cells. A feature's `spatialIndex` is internal derived data and is excluded from public response and form schemas.

`createFeature` and `updateFeatureByIdWithConcurrency` persist geometry and its derived index in the same statement. Migration `0078_feature_spatial_index.sql` adds SQL triggers that materialize `featureSpatial` rows atomically, copy layer changes and cascade deletions. Task review/finalization writes only change feature state, so they preserve spatial membership and their existing transaction guards.

The map covers its complete viewport plus a 10% buffer, including cell boundaries and antimeridian crossings. The requested resolution follows zoom but falls back to coarser cells if the cover exceeds 256 cells. At resolution zero, all 122 base cells are available and the query's coordinate bounds supply the geographic restriction. Feature page size remains independent of the number of cells. Markers are never clustered.

## Query and cache contract

`getFeaturePage` accepts text, selected hierarchy, property values/ranges/flags, neighbourhood inclusion/exclusion, user-list membership and optional H3 scope in one request. Map requests combine the current filters with the visible cells and return at most 100 individual features. They do not automatically drain subsequent pages. Panning or zooming requests a fresh viewport page; search and list views can explicitly paginate through every match. Search and saved lists use their own scope, independent of the camera. A wishlist or visited view is a regular feature query with `filters.list`, and visited lists retain server-side date ordering.

Responses contain `data`, `totalCount`, `nextCursor`, neighbourhood `facets`, and optional current-user membership metadata for returned IDs. Counts and facets describe the complete authorized query before its cursor is applied. The map sidebar uses a separate non-spatial facet query so its neighbourhood totals do not shrink with the camera. Totals remain unknown until a server response exists; cached row lengths are not used as substitutes.

CacheCtx owns independent feature controllers backed by native remote query pages. New queries immediately display matching fresh cached entities, then merge server rows uniquely by feature ID. They follow the existing 60-second freshness window. Shared optimistic retention is capped at 2,000 entities, with bounded retained query histories; explicit pagination can retain the active list's loaded pages. Authorization, hub and locale scope are part of query identity. Successful edits invalidate/revalidate active feature queries through the normal cache and remote refresh paths.

Migration `0079_feature_query_indexes.sql` adds covering feature indexes and trigger-maintained neighbourhood/search membership. Unicode substring postings cover lengths one through three, allowing short CJK searches to use an index before exact candidate validation. Counts use covering feature indexes and indexed membership lookups, without reading the entire feature payload table. Exact counts still enumerate matching index entries; a broad unfiltered count is not constant-time. Property filters share one JSON binding and probe the `(featureId, propertyId)` primary key for each candidate.

The indexes trade storage and write work for cheaper reads: each valid point creates 13 spatial memberships, while search postings scale with distinct one-, two- and three-character substrings in each feature's searchable text. Text, geometry and property edits maintain their corresponding data transactionally. For scale reference, the verified local snapshot of 1,814 features produced 23,582 spatial memberships and 684,299 substring postings. Those figures are a local snapshot, not a production capacity estimate.

## Populate existing features

Apply migrations 0078 and 0079, then run a bounded local backfill:

```sh
bunx wrangler d1 migrations apply hype-db-local --local
bun run feature:spatial:backfill --batch-size 100 --max-batches 20
```

The script defaults to local D1, 25 source features per page and 20 pages. Use `--dry-run` to inspect the pending workload without writes. It reports the last processed ID and stops at the configured budget. Re-running from the beginning is safe and uses the partial pending index; already indexed rows are not revisited. `--after-id <id>` resumes after a reported cursor, but omit it when checking for repairs that may have appeared before that cursor.

Remote operations require both an explicit remote flag and environment. Run them only as part of the intended deployment:

```sh
bunx wrangler d1 migrations apply hype-db-preview --remote --env preview
bun run feature:spatial:backfill --remote --stage preview --batch-size 100 --max-batches 20
```

Use `hype-db-prod`/`--env production` and `--stage production` for production. Remote indexing is never triggered by application startup. Complete the H3 backfill before directing map traffic to spatial queries; features without indexed memberships are not spatial query candidates.

Deploy in this order: apply the additive migrations, complete and verify the H3 backfill, then enable the application revision that issues spatial queries. Migration 0079 populates its search/neighbourhood indexes while applying the migration. The backfill reports remaining pending rows; require zero valid pending point geometries before rollout. The implementation was verified against local D1 only; remote migrations, backfill and application deployment are separate rollout actions.

Each update checks the raw geometry snapshot and that its index is still missing, preserving concurrent edits and `modifiedAt`. Valid legacy numeric coordinate strings are normalized only in derived data; source geometry is retained. Invalid/non-point geometry cannot produce a point marker and is reported as skipped when encountered in the pending point index.

## Repair after manual geometry changes

Application writes keep membership current. A raw SQL geometry edit that omits a matching `spatialIndex` removes its old membership and sets its index to NULL, so a feature cannot continue appearing at its old location. Run the same backfill command to repair these rows. A failed batch can be retried safely because writes are conditional and trigger work is atomic.
