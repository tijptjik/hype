# Feature spatial index

Feature points store H3 membership at resolutions 0 through 12. Every cell is computed directly from the point: an H3 parent cell is not an exact geometric container of its child cells. A feature's `spatialIndex` is internal derived data and is excluded from public response and form schemas.

`createFeature` and `updateFeatureByIdWithConcurrency` persist geometry and its derived index in the same statement. Migration `0078_feature_spatial_index.sql` adds SQL triggers that materialize `featureSpatial` rows atomically, copy layer changes and cascade deletions. Task review/finalization writes only change feature state, so they preserve spatial membership and their existing transaction guards.

H3 coverage includes the complete viewport plus a 10% buffer for cell boundaries and antimeridian crossings. Returned coordinate bounds remain the exact viewport, so buffer-only points are neither fetched nor displayed. The requested resolution follows zoom but falls back to coarser cells if the cover exceeds 256 cells. At resolution zero, all 122 base cells are available and the query's coordinate bounds supply the geographic restriction. Feature page size remains independent of the number of cells. Markers are never clustered.

## Query and cache contract

`getFeaturePage` accepts text, selected hierarchy, property values/ranges/flags, neighbourhood inclusion/exclusion, user-list membership and optional H3 scope in one request. Map requests combine the current filters with the visible cells and request up to 100 additional individual features. Already visible matching markers retain their order and are sent as `excludeIds`, so the next page discovers new IDs. The active display stops at 500 markers. Leaving the viewport removes a marker from the display while normal fresh entity retention allows it to return from cache. Map loads have no loading banner and do not automatically drain subsequent pages. Panning or zooming requests one additional viewport page; search and list views can explicitly paginate through every match. Search and saved lists use their own scope, independent of the camera. A wishlist or visited view is a regular feature query with `filters.list`, and visited lists retain server-side date ordering.

Responses contain `data`, `totalCount`, `nextCursor`, neighbourhood `facets`, and optional current-user membership metadata for returned IDs. When requested, counts and facets describe the complete authorized query before its cursor or `excludeIds` are applied. Map requests set `includeCounts: false`: `totalCount` and `facets` are null, and the server performs no aggregate, revision or count-cache reads for them. The map sidebar uses a separate non-spatial facet query so its neighbourhood totals do not shrink with the camera. Totals remain unknown until a server response exists; cached row lengths are not used as substitutes.

Feature pages use SvelteKit's native batched query transport, which sends selectors in a POST body while preserving native query caching and refreshes. Viewport cells and retained marker IDs can exceed URL limits when encoded together. Cursor signatures are fixed-size SHA-256 digests of the complete query identity instead of repeating its selectors.

CacheCtx owns independent feature controllers backed by native remote query pages. New queries immediately display matching fresh cached entities, then merge server rows uniquely by feature ID. They follow the existing 60-second freshness window. Shared optimistic retention is capped at 2,000 entities, with bounded retained query histories; explicit pagination can retain the active list's loaded pages. Authorization, hub and locale scope are part of query identity. Successful edits invalidate/revalidate active feature queries through the normal cache and remote refresh paths.

Migration `0079_feature_query_indexes.sql` adds covering feature indexes and neighbourhood storage. Migration `0081_feature_search_fts.sql` replaces the earlier relational gram index with FTS5 and installs independent search/neighbourhood triggers. Search intersects encoded substring tokens in FTS before exact candidate validation; one- and two-character Chinese queries and literal punctuation retain their existing behavior. Detailed count calculations use covering feature indexes and indexed membership lookups, without reading the entire feature payload table. Migration `0080_feature_count_cache.sql` removes repeated calculations: canonical changes maintain count bins and revisioned cached query aggregates as described below. Property filters share one JSON binding and probe the `(featureId, propertyId)` primary key for each candidate.

Each valid point creates 13 spatial memberships. Search stores one stable `featureSearchDocument` identity and one contentless `featureSearchFts` document per translation. Its distinct one-, two- and three-codepoint substrings are UTF-8 hex tokens inside the FTS index, rather than individual relational rows with secondary indexes. Hex encoding preserves literal punctuation and the existing ASCII-only case folding; source `instr` checks reject candidates whose grams occur in a different order or across separate fields/locales. Text length still affects tokenization work and index storage. No-op text assignments and address-metadata-only changes do not rewrite the search index. Text, geometry and property edits maintain their corresponding data transactionally.

## Maintained and cached counts

Common hierarchy, neighbourhood and boolean-flag counts sum `featureCountRollup` bins. Triggers maintain one contribution per feature in `featureCountEntry`, including its scope, visibility, flags and English neighbourhood. Entry deltas preserve the old contribution during moves and deletion cascades. Query predicates use the same authorized layer/hub boundaries as feature reads. No feature aggregate runs on this path. The verified local public snapshot has 1,065 visible features represented by 69 bins.

Arbitrary text, property, list and spatial filter combinations use `featureCountCache`. Its SHA-256 key covers the actual authorized aggregate SQL and bound values, excluding cursor, page size, sorting and retained marker IDs. Repeated pages and queries reuse the stored exact total and facets while source revisions match. Canonical feature, translation, property and hierarchy changes invalidate relevant results; membership changes use a separate per-user revision so saving one feature does not invalidate everyone else's counts. Cache publication checks that revisions have not changed during the calculation. At most 512 aggregate entries are retained.

The first unseen detailed query, or the first query after a relevant change, still calculates its indexed matches. Maintaining every possible free-text/property/list intersection would require an impractical number of combinations. Common rollups and map requests avoid that work entirely; repeated detailed queries reuse it. Maintained bins add bounded write work per source change instead of repeated feature-count reads.

## Populate existing features

Apply pending migrations (0078 through 0081), then run a bounded local backfill:

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

Deploy in this order: apply the migrations, complete and verify the H3 backfill, then enable the application revision that issues spatial queries. Migration 0081 drops the legacy gram table and populates its FTS/neighbourhood indexes without updating source translations. It upgrades databases that already applied the earlier version of 0079; fresh databases no longer create the gram table. The old search application revision requires the removed gram table, so coordinate this migration with the new application revision instead of serving old search code after it runs. The backfill reports remaining pending rows; require zero valid pending point geometries before rollout. The implementation was verified against local D1 only; remote migrations, backfill and application deployment are separate rollout actions.

## Search index maintenance

The search mapping uses an explicit integer primary key, so its FTS document identities survive `VACUUM` and do not depend on translation rowids. Translation/feature identity changes cascade through the mapping; deletion removes the corresponding FTS document. `featureSearchContent` computes encoded tokens from authoritative translations when populating or refreshing the index and does not persist another copy of the text.

The FTS table is migration-managed and deliberately absent from Drizzle's ordinary table metadata. Do not replace it with generated `CREATE TABLE` DDL. It uses `contentless_delete=1` and `detail=none`; `columnsize=0` is incompatible with contentless deletion.

Cloudflare currently [documents an export limitation for databases containing virtual tables](https://developers.cloudflare.com/d1/best-practices/import-export-data/#known-limitations). Existing `wrangler d1 export` dump commands must not be assumed to work once FTS is installed. Do not drop a live search index just to export it. Use D1 Time Travel for database recovery; a portable source-data exporter and the existing SQL reorder/restore scripts require separate FTS-aware handling before use. Search documents are derived data and should be rebuilt from `featureI18n` on a portable restore; copying FTS shadow tables through the existing SQL reorder script is unsupported. The reset routine removes the new search objects before their source tables.

Each update checks the raw geometry snapshot and that its index is still missing, preserving concurrent edits and `modifiedAt`. Valid legacy numeric coordinate strings are normalized only in derived data; source geometry is retained. Invalid/non-point geometry cannot produce a point marker and is reported as skipped when encountered in the pending point index.

## Repair after manual geometry changes

Application writes keep membership current. A raw SQL geometry edit that omits a matching `spatialIndex` removes its old membership and sets its index to NULL, so a feature cannot continue appearing at its old location. Run the same backfill command to repair these rows. A failed batch can be retried safely because writes are conditional and trigger work is atomic.
