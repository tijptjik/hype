# Feature spatial index

Feature points store H3 membership at resolutions 0 through 12. Every cell is computed directly from the point: an H3 parent cell is not an exact geometric container of its child cells. A feature's `spatialIndex` is internal derived data and is excluded from public response and form schemas.

`createFeature` and `updateFeatureByIdWithConcurrency` persist geometry and its derived index in the same statement. Migration `0078_feature_spatial_index.sql` adds SQL triggers that materialize `featureSpatial` rows atomically, copy layer changes and cascade deletions. Task review/finalization writes only change feature state, so they preserve spatial membership and their existing transaction guards.

H3 coverage includes the complete viewport plus a 10% buffer for cell boundaries and antimeridian crossings. Returned coordinate bounds remain the exact viewport, so buffer-only points are neither fetched nor displayed. The requested resolution follows zoom but falls back to coarser cells if the cover exceeds 256 cells. At resolution zero, all 122 base cells are available and the query's coordinate bounds supply the geographic restriction. Feature page size remains independent of the number of cells. Markers are never clustered.

## Query and cache contract

`getFeaturePage` accepts text, selected hierarchy, property values/ranges/flags, neighbourhood inclusion/exclusion, user-list membership and optional H3 scope in one request. Map requests combine the current filters with the visible cells and request up to 100 additional individual features. Already visible matching markers retain their order and are sent as `excludeIds`, so the next page discovers new IDs. The active query stops at 500 features. Previously rendered markers can remain on the map within the separate device-sized retention budget described below. Map loads have no loading banner and do not automatically drain subsequent pages. Panning or zooming requests additional viewport pages at a maximum cadence of one per 300 ms during movement, with a final viewport update when movement ends; search and list views can explicitly paginate through every match. Search and saved lists use their own scope, independent of the camera. A wishlist or visited view is a regular feature query with `filters.list`, and visited lists retain server-side date ordering.

Responses contain `data`, `totalCount`, `nextCursor`, neighbourhood `facets`, and optional current-user membership metadata for returned IDs. When requested, counts and facets describe the complete authorized query before its cursor or `excludeIds` are applied. Map requests set `includeCounts: false`: `totalCount` and `facets` are null, and the server performs no aggregate, revision or count-cache reads for them. The map sidebar uses a separate non-spatial facet query so its neighbourhood totals do not shrink with the camera. Totals remain unknown until a server response exists; cached row lengths are not used as substitutes.

Feature pages use SvelteKit's native batched query transport, which sends selectors in a POST body while preserving native query caching and refreshes. Viewport cells and retained marker IDs can exceed URL limits when encoded together. Cursor signatures are fixed-size SHA-256 digests of the complete query identity instead of repeating its selectors.

CacheCtx owns independent feature controllers backed by native remote query pages. New queries immediately display matching fresh cached entities, then merge server rows uniquely by feature ID. They follow the existing 60-second freshness window. Shared optimistic retention is capped at 2,000 entities, with bounded retained query histories; explicit pagination can retain the active list's loaded pages. Authorization, hub and locale scope are part of query identity. Successful edits invalidate/revalidate active feature queries through the normal cache and remote refresh paths.

Migration `0079_feature_query_indexes.sql` adds covering feature indexes and neighbourhood storage. Migration `0081_feature_search_fts.sql` replaces the earlier relational gram index with FTS5 and installs independent search/neighbourhood triggers. Search intersects encoded substring tokens in FTS before exact candidate validation; one- and two-character Chinese queries and literal punctuation retain their existing behavior. Detailed count calculations use covering feature indexes and indexed membership lookups, without reading the entire feature payload table. Migration `0080_feature_count_cache.sql` removes repeated calculations: canonical changes maintain count bins and revisioned cached query aggregates as described below. Property filters share one JSON binding and probe the `(featureId, propertyId)` primary key for each candidate.

Each valid point creates 13 spatial memberships. Search stores one stable `featureSearchDocument` identity and one contentless `featureSearchFts` document per translation. Its distinct one-, two- and three-codepoint substrings are UTF-8 hex tokens inside the FTS index, rather than individual relational rows with secondary indexes. Hex encoding preserves literal punctuation and the existing ASCII-only case folding; source `instr` checks reject candidates whose grams occur in a different order or across separate fields/locales. Text length still affects tokenization work and index storage. No-op text assignments and address-metadata-only changes do not rewrite the search index. Text, geometry and property edits maintain their corresponding data transactionally.

## Marker and image retention

The public map keeps a separate, bounded renderer cache so leaving the active viewport does not destroy a marker's image element. Returning features reuse the same marker and image DOM nodes unless their image/style signature changes. Entity querying and freshness still follow CacheCtx rules; previously rendered presentation stays available across camera changes within the current filter and authorization scope. Changing filter, authorization or marker style scope clears cached markers.

The total active-plus-cached budget is 750 when reported device memory is at most 4 GB or logical processor count is at most four; 1,500 when both memory is at least 8 GB and processor count is at least eight; otherwise 1,000. Missing hints use the fallback unless an available hint identifies a constrained device. These are conservative starting values based on coarse browser hints, not measured GPU speed or memory-pressure detection. The active query ceiling remains 500 and viewport pages remain 100. The warm cache is separate from live positioning: at most 500 markers attach to MapLibre, including at most 64 cached markers. Active query rows take priority; cached images remain available even when they have no live positioning slot.

Live positioning uses one quarter of the map width as overscan, clamped to 96–192 CSS pixels per edge. Both active and cached offscreen markers detach from MapLibre movement handling while retaining their DOM/image instances. Camera visibility scans run at most once per 80 ms during movement and always run at movement end and reconciliation. Cached markers reattach near the viewport without waiting for another query, subject to the live budget. Only exceeding the resident budget evicts cached instances, oldest detached first, then oldest attached; active rows are protected. This perimeter does not expand fetching. Retaining image nodes avoids rebuilding them but cannot prevent the browser from reclaiming decoded image memory. Disposing the map releases all retained instances.

Entry animations release their transforms when finished. During pan/zoom gestures, markers keep their thumbnails and selection rings while decorative shadows and masks simplify; full styling returns at movement end. Unchanged coordinates do not trigger native marker repositioning during selection updates.

Run `bun scripts/dev/benchmark-map-markers.ts --repeat` for three dense desktop/phone-width trials, and add `--spread` for wider spacing. Set `PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH` if using an existing Chromium installation. Add `--baseline-ref=1f2383640` to compare with the renderer before this optimisation without changing the working tree (`--baseline` alone uses HEAD). The harness uses the production renderer and marker CSS, 500 active rows plus 1,000 cached rows, generated shared images, an empty MapLibre basemap and 4× CPU slowdown. It measures frame intervals during a 2.5-second camera movement and checks DOM reuse and selection state. It excludes feature transport, real image decoding, basemap complexity and physical mobile GPU behavior; these remain separate device checks. In three trials on 2026-10-17, the median of phone-width dense-run median frame times fell from 150 ms to 49.9 ms, and the median 95th-percentile frame time fell from 366.5 ms to 66.7 ms. The wider-spaced phone workload measured 16.7 ms median and 50 ms at the 95th percentile. These synthetic results show improvement but do not establish smooth physical-phone performance at maximum density.

## Maintained and cached counts

Common hierarchy, neighbourhood and boolean-flag counts sum `featureCountRollup` bins. Triggers maintain one contribution per feature in `featureCountEntry`, including its scope, visibility, flags and English neighbourhood. Entry deltas preserve the old contribution during moves and deletion cascades. Query predicates use the same authorized layer/hub boundaries as feature reads. No feature aggregate runs on this path. The verified local public snapshot has 1,065 visible features represented by 69 bins.

Arbitrary text, property, list and spatial filter combinations use `featureCountCache`. Its SHA-256 key covers the actual authorized aggregate SQL and bound values, excluding cursor, page size, sorting and retained marker IDs. Repeated pages and queries reuse the stored exact total and facets while source revisions match. Canonical feature, translation, property and hierarchy changes invalidate relevant results; membership changes use a separate per-user revision so saving one feature does not invalidate everyone else's counts. Cache publication checks that revisions have not changed during the calculation. At most 512 aggregate entries are retained.

The first unseen detailed query, or the first query after a relevant change, still calculates its indexed matches. Maintaining every possible free-text/property/list intersection would require an impractical number of combinations. Common rollups and map requests avoid that work entirely; repeated detailed queries reuse it. Maintained bins add bounded write work per source change instead of repeated feature-count reads.

## Populate existing features

Spatial backfill is a one-off rollout or recovery operation, not a deployment step. Production mirrors now include populated H3 cells. `bun run db:mirror:post:local` validates that no point indexes are missing, prepares divisions and initializes agent users without rebuilding spatial indexes. If validation fails, inspect the affected geometry and run the manual repair command below before repeating mirror preparation.

For a manual bounded backfill, apply pending migrations (0078 through 0081), then run:

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

Deploy in this order: apply the migrations, complete and verify the H3 backfill, then enable the application revision that issues spatial queries. Migration 0081 drops the legacy gram table and populates its FTS/neighbourhood indexes without updating source translations. It upgrades databases that already applied the earlier version of 0079; fresh databases no longer create the gram table. The old search application revision requires the removed gram table, so coordinate this migration with the new application revision instead of serving old search code after it runs. The backfill reports remaining pending rows; require zero valid pending point geometries before rollout. For one-off repairs, add `--require-complete` to verify all pending point geometries, including rows before a resume cursor, and fail on skipped points or an exhausted batch budget. Neither CI deployments nor local mirror preparation automatically invoke the backfill.

## Search index maintenance

The search mapping uses an explicit integer primary key, so its FTS document identities survive `VACUUM` and do not depend on translation rowids. Translation/feature identity changes cascade through the mapping; deletion removes the corresponding FTS document. `featureSearchContent` computes encoded tokens from authoritative translations when populating or refreshing the index and does not persist another copy of the text.

The FTS table is migration-managed and deliberately absent from Drizzle's ordinary table metadata. Do not replace it with generated `CREATE TABLE` DDL. It uses `contentless_delete=1` and `detail=none`; `columnsize=0` is incompatible with contentless deletion.

Cloudflare currently [documents an export limitation for databases containing virtual tables](https://developers.cloudflare.com/d1/best-practices/import-export-data/#known-limitations). Existing `wrangler d1 export` dump commands must not be assumed to work once FTS is installed. Do not drop a live search index just to export it. Use D1 Time Travel for database recovery; a portable source-data exporter and the existing SQL reorder/restore scripts require separate FTS-aware handling before use. Search documents are derived data and should be rebuilt from `featureI18n` on a portable restore; copying FTS shadow tables through the existing SQL reorder script is unsupported. The reset routine removes the new search objects before their source tables.

Each update checks the raw geometry snapshot and that its index is still missing, preserving concurrent edits and `modifiedAt`. Valid legacy numeric coordinate strings are normalized only in derived data; source geometry is retained. Invalid/non-point geometry cannot produce a point marker and is reported as skipped when encountered in the pending point index.

## Repair after manual geometry changes

Application writes keep membership current. A raw SQL geometry edit that omits a matching `spatialIndex` removes its old membership and sets its index to NULL, so a feature cannot continue appearing at its old location. Run the same backfill command to repair these rows. A failed batch can be retried safely because writes are conditional and trigger work is atomic.


## Production map recovery (2026-10-19)

Production had 1,830 point features with missing H3 indexes after migrations were applied without the local preparation step. The guarded remote backfill populated all 1,830 features and 23,790 spatial memberships (13 per feature), with no skipped points or remaining pending indexes. The subsequent `--remote --stage production --require-complete` check completed without writes.

The division facet query also failed with `D1_ERROR: out of memory: SQLITE_NOMEM`. Joining division definitions before grouping carried large polygon attributes through the membership sorter. Facet counts now group only feature/division identities in a subquery before joining definitions and localized labels. This preserves authorized filters and exact counts while keeping polygon payloads out of the grouping operation. A SQLite regression check verifies the separate grouped query plan and facet metadata with a large polygon fixture.

Deployed application version `a97f7c8f-c12c-4b13-9b72-28145be5f86a`. A fresh production browser at `https://hype.hk/?panel=filters` returned 602 matching public features, 98 division facets, and viewport pages of 100 features; the screenshot confirmed rendered markers and populated filters. Worker tail showed no errors for the observed new-version requests. Focused spatial, count, query and readiness suites passed 121 tests; the production build passed.


Preview was checked separately before retiring the automatic steps: all 1,811 features lacked spatial indexes. Its explicit one-off repair populated 23,543 memberships with no skipped points and passed the global completeness check.

## Ongoing feature lifecycle

Application creation and optimistic geometry updates calculate H3 membership in the same write as geometry; database triggers materialize 13 resolution rows. Feature creation queues division resolution. Geometry changes immediately remove old division memberships and queue a new generation. The scheduled division worker processes up to ten jobs every five minutes, with retries and monthly discovery of SaanSeoi releases; backlog and release scanning can delay completion. It resolves against the pinned applied or target release. These paths do not depend on backfills or application deployments.

The service-level regression test exercises actual creation, spatial materialization, scheduled division resolution, movement and stale-write rejection against SQLite with the production migrations. Manual repair commands remain available for raw SQL imports and restores that bypass the application write helpers.
