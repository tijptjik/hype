# Feature spatial index

Feature points store H3 membership at resolutions 0 through 12. Every cell is computed
directly from the point: an H3 parent cell is not an exact geometric container of its
child cells. A feature's `spatialIndex` is internal derived data and is excluded from
public response and form schemas.

`createFeature` and `updateFeatureByIdWithConcurrency` persist geometry and its derived
index in the same statement. Migration `0078_feature_spatial_index.sql` adds SQL
triggers that materialize `featureSpatial` rows atomically, copy layer changes and
cascade deletions. Task review/finalization writes only change feature state, so they
preserve spatial membership and their existing transaction guards.

H3 coverage includes the complete viewport plus a 10% buffer for cell boundaries and
antimeridian crossings. Returned coordinate bounds remain the exact viewport, so
buffer-only points are neither fetched nor displayed. The requested resolution follows
zoom but falls back to coarser cells if the cover exceeds 256 cells. At resolution zero,
all 122 base cells are available and the query's coordinate bounds supply the geographic
restriction. Feature page size remains independent of the number of cells. Markers are
never clustered.

## Query and cache contract

`getFeaturePage` accepts text, selected hierarchy, property values/ranges/flags,
neighbourhood inclusion/exclusion, user-list membership and optional H3 scope in one
request. Map requests combine the current filters with the visible cells and request up
to 100 additional individual features. Already visible matching markers retain their
order and are sent as `excludeIds`, so the next page discovers new IDs. The active query
stops at 500 features. Previously rendered markers can remain on the map within the
separate device-sized retention budget described below. Map loads have no loading banner
and do not automatically drain subsequent pages. Short pans, zooms, inertia and scripted
flights publish the final viewport when movement ends. Sustained direct dragging can
publish additional viewport pages once per 600 ms while no map query is loading. The 120
ms request debounce rechecks gesture state so a newly started flight or pinch does not
launch a queued request. These are viewport scheduling rules: an already-running request
can still complete during movement, and a queued request can start during a direct drag.
Search and list views can explicitly paginate through every match. Search and saved
lists use their own scope, independent of the camera. A wishlist or visited view is a
regular feature query with `filters.list`, and visited lists retain server-side date
ordering.

Responses contain `data`, `totalCount`, `nextCursor`, neighbourhood `facets`, and
optional current-user membership metadata for returned IDs. When requested, counts and
facets describe the complete authorized query before its cursor or `excludeIds` are
applied. Map requests set `includeCounts: false`: `totalCount` and `facets` are null,
and the server performs no aggregate, revision or count-cache reads for them. The map
sidebar uses a separate non-spatial facet query so its neighbourhood totals do not
shrink with the camera. Totals remain unknown until a server response exists; cached row
lengths are not used as substitutes.

Feature pages use SvelteKit's native batched query transport, which sends selectors in a
POST body while preserving native query caching and refreshes. Viewport cells and
retained marker IDs can exceed URL limits when encoded together. Cursor signatures are
fixed-size SHA-256 digests of the complete query identity instead of repeating its
selectors.

CacheCtx owns independent feature controllers backed by native remote query pages. New
queries immediately display matching fresh cached entities, then merge server rows
uniquely by feature ID. They follow the existing 60-second freshness window. Shared
optimistic retention is capped at 2,000 entities, with bounded retained query histories;
explicit pagination can retain the active list's loaded pages. Authorization, hub and
locale scope are part of query identity. Successful edits invalidate/revalidate active
feature queries through the normal cache and remote refresh paths.

Migration `0079_feature_query_indexes.sql` adds covering feature indexes and
neighbourhood storage. Migration `0081_feature_search_fts.sql` replaces the earlier
relational gram index with FTS5 and installs independent search/neighbourhood triggers.
Search intersects encoded substring tokens in FTS before exact candidate validation;
one- and two-character Chinese queries and literal punctuation retain their existing
behavior. Detailed count calculations use covering feature indexes and indexed
membership lookups, without reading the entire feature payload table. Migration
`0080_feature_count_cache.sql` removes repeated calculations: canonical changes maintain
count bins and revisioned cached query aggregates as described below. Property filters
share one JSON binding and probe the `(featureId, propertyId)` primary key for each
candidate.

Each valid point creates 13 spatial memberships. Search stores one stable
`featureSearchDocument` identity and one contentless `featureSearchFts` document per
translation. Its distinct one-, two- and three-codepoint substrings are UTF-8 hex tokens
inside the FTS index, rather than individual relational rows with secondary indexes. Hex
encoding preserves literal punctuation and the existing ASCII-only case folding; source
`instr` checks reject candidates whose grams occur in a different order or across
separate fields/locales. Text length still affects tokenization work and index storage.
No-op text assignments and address-metadata-only changes do not rewrite the search
index. Text, geometry and property edits maintain their corresponding data
transactionally.

## Marker and image retention

The public map keeps a separate, bounded renderer cache so leaving the active viewport
does not destroy a marker's image element. Returning features reuse the same marker and
image DOM nodes unless their image/style signature changes. Entity querying and
freshness still follow CacheCtx rules; previously rendered presentation stays available
across camera changes within the current filter and authorization scope. Changing
filter, authorization or marker style scope clears cached markers.

The total active-plus-cached budget is 750 when reported device memory is at most 4 GB
or logical processor count is at most four; 1,500 when both memory is at least 8 GB and
processor count is at least eight; otherwise 1,000. Missing hints use the fallback
unless an available hint identifies a constrained device. These are conservative
starting values based on coarse browser hints, not measured GPU speed or memory-pressure
detection. The active query ceiling remains 500 and viewport pages remain 100. The warm
cache is separate from live positioning. Public maps use individual GPU points for
photo/dot rows, with at most 150 native photo overlays on narrow maps or coarse-pointer
devices, and 500 on wider fine-pointer devices. Up to 64 recently parked records may
join active rows. Selected scoped records receive a native slot before other detail.
Country flags and Breadline status markers keep their native presentation; active
operational markers take priority over cached decoration. All native styles together
retain the existing 500 attached-marker ceiling. Cached images remain available even
when they have no live positioning slot.

Live positioning uses one quarter of the map width as overscan, clamped to 96–192 CSS
pixels per edge. Both active and cached offscreen markers detach from MapLibre movement
handling while retaining their DOM/image instances. Camera visibility scans run at most
once per 80 ms during movement and always run at movement end and reconciliation. Chosen
warm photo nodes reattach near the viewport without waiting for another query. At the
endpoint the coordinator chooses detail from active rows and the bounded return cache;
GPU anchors remain visible during that change. Only exceeding the resident budget evicts
cached instances, oldest detached first, then oldest attached; active rows are
protected. This perimeter does not expand fetching. Retaining image nodes avoids
rebuilding them but cannot prevent the browser from reclaiming decoded image memory.
Disposing the map releases all retained instances.

Entry animations release their transforms when finished. During pan/zoom gestures,
markers keep their thumbnails and selection rings. Solid strokes and unblurred
separators keep decoration stable throughout movement. Unchanged coordinates do not
trigger native marker repositioning during selection updates.

Run `dev-check bun scripts/dev/benchmark-map-markers.ts --repeat` for three dense
desktop/phone-width trials, and add `--spread` for wider spacing. Set
`PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH` if using an existing Chromium installation. Add
`--baseline-ref=1f2383640` to compare with the renderer before this optimisation without
changing the working tree (`--baseline` alone uses HEAD). The harness uses the
production renderer and marker CSS, 500 active rows plus 1,000 cached rows, generated
shared images, an empty MapLibre basemap and 4× CPU slowdown. It measures frame
intervals during a 2.5-second camera movement and checks DOM reuse and selection state.
It excludes feature transport, real image decoding, basemap complexity and physical
mobile GPU behavior; these remain separate device checks. In three trials on 2026-10-17,
the median of phone-width dense-run median frame times fell from 150 ms to 49.9 ms, and
the median 95th-percentile frame time fell from 366.5 ms to 66.7 ms. The wider-spaced
phone workload measured 16.7 ms median and 50 ms at the 95th percentile. These synthetic
results show improvement but do not establish smooth physical-phone performance at
maximum density.

### Mobile loading review, 2026-11-08

At the start of this review, the strategy had two independent costs. Every attached
native MapLibre marker projects its coordinates and writes its transform on each
movement frame. In addition, each new page synchronously creates marker DOM and eagerly
starts image requests before checking the attachment perimeter. Smaller network pages
alone cannot bound this work: fresh cache restoration can supply 500 rows at once. The
image request is already a 128-by-128 crop; native image lazy loading is unsuitable for
these positioned markers.

The viewport scheduler now keeps intermediate flights and zooms out of the discovery
pipeline while continuing the renderer's existing warm-cache visibility updates. This
also covers the 2-second feature-card recenter and 2.5-second feature/geolocation
flights. Previously, the 300 ms sampling plus 120 ms debounce could start about seven
intermediate requests during an uninterrupted 2.5-second flight, plus the endpoint
request. That count is derived from timing, not captured production traffic. Real
MapLibre camera checks now publish exactly one endpoint per scripted pan, zoom or
flight. The 600 ms held-drag interval is a conservative starting policy, not a
device-calibrated optimum. The final camera always wins, including after interruption or
resize; intermediate updates skip busy map queries.

The trade-off is deliberate: new, uncached geography can wait until the gesture ends,
then the normal 120 ms debounce and request latency. Existing cached markers continue to
appear immediately near the viewport. Initial stationary views still request one page of
up to 100; the scheduler does not automatically fill the 500-row ceiling. At review
time, already-started responses and explicit refreshes could still create cold native
markers during movement; the applied renderer below now defers that work. A future
destination prefetch should fetch once into the data cache using the actual target
camera, including pitch and panel offset, without rendering the flight's intermediate
views.

Controlled dense renderer trials at 390 by 844 CSS pixels, device pixel ratio 1,
Chromium and 4-times CPU slowdown gave the following medians across three runs. The flat
pan control has no retained rows and starts with the stated attached count; the camera
moves far enough to detach approximately 30% by the endpoint.

| Starting photo markers | Median frame | 95th-percentile frame | Synchronous initial creation |
| ---------------------- | ------------ | --------------------- | ---------------------------- |
| 100                    | 16.7 ms      | 16.8 ms               | 27.4 ms                      |
| 200                    | 16.7 ms      | 16.7 ms               | 52.8 ms                      |
| 300                    | 16.7 ms      | 33.4 ms               | 67.4 ms                      |
| 500                    | 33.3 ms      | 33.4 ms               | 108.1 ms                     |

With the application's 45-degree pitch, 17.6-degree bearing and 1,000 retained rows, 200
active photos plus up to 64 nearby cached photos measured 16.7 ms median / 33.4 ms at
the 95th percentile during zoom and fly tests. At 500 active rows those tests were about
33.3 ms / 50 ms. Injecting 100 new rows during a pitched pan took 27.4-30.7 ms
synchronously, independent of download time. Selection and DOM reuse checks passed in
all these trials. Raw per-trial results are in
[`../benchmarks/map-markers-2026-11-08.json`](../benchmarks/map-markers-2026-11-08.json).

The 500-marker DOM-dot control also measured 33.3 ms median / 33.4 ms at the 95th
percentile. Removing photos alone did not remove the native per-marker movement cost.
These controls establish a density trend, not a before/after frame-rate improvement from
the scheduler: they deliberately hold marker content constant during movement.

Native Chromium input checks separately observed a short drag with 11 inertia frames and
a two-finger pinch with 31 zoom frames; each produced no intermediate viewport and one
settled endpoint. A sustained drag produced three intermediate publications at the
bounded cadence and one final endpoint. Reproduce these event-contract checks with
`dev-check bun scripts/visual-checks/map-viewport-scheduling-check.ts --touch`.

These results supported evaluating **100-200 live rich photos on a phone**, with room
reserved for the selected feature, rather than treating 500 as a smooth mobile target.
The initial proposal kept the separate 750-1,500 warm retention budget and 100-row
network page size, with the following implementation and validation work. The applied
renderer policy is documented below.

- Construct cold markers in short, interruptible frame batches (initial trial budget: 4
  ms), with selected and visible markers first. Invalidate queued work immediately on
  filter, authorization or style changes; cancel it on disposal. Keep existing marker
  state changes and removals immediate.
- Start new images when their marker is admitted near the viewport; retain previously
  loaded image nodes for return pans. Do not start cold images merely to fill the cache.
- For denser views, evaluate individual GPU-rendered symbols with a bounded rich-photo
  overlay. Preserve discoverability, selection and all individual point identities;
  clustering is a separate product choice. Merely lowering the current cap can hide a
  selected feature because selection has no reserved query or attachment slot today.
- Validate the budget on physical iPhones with real tiles and distinct images, high
  device pixel ratio, repeated touch pans/pinches, direction reversals and card/list
  scrolling. The benchmark uses an empty map and shared generated images; its numbers
  exclude network/decode pressure, app panels and mobile GPU behavior. Desktop WebKit
  would also be a compatibility check, not an iPhone performance result; the installed
  Playwright version's WebKit executable was unavailable for this run.

Reproduce a density control with
`dev-check bun scripts/dev/benchmark-map-markers.ts --width=390 --active=200 --cached=0 --repeat`.
For a camera/arrival case, use
`dev-check bun scripts/dev/benchmark-map-markers.ts --width=390 --active=200 --cached=1000 --pitch=45 --bearing=17.6 --motion=fly --repeat`;
choose `--motion=zoom`, or `--motion=pan --arrival=100` for a page arriving during
movement. `--style=dot` compares the existing DOM dot style; it is not a GPU symbol
implementation. `--engine=webkit` requires its matching Playwright binary and reports
unthrottled CPU explicitly. Baseline revision flags select renderer/CSS source only; the
viewport scheduler instrumentation always uses the current working tree.

### Adaptive public renderer implementation

`MapCanvas` uses `createAdaptiveMarkerRenderer` for public maps. It publishes one
unclustered GeoJSON point per active photo/dot record, plus at most 64 recent same-scope
parked records. Small canvas points remain under native photos, so photo admission does
not rebuild the GPU source. Data, selection and style changes update the source;
ordinary camera frames do not. Points can initialize as soon as the stylesheet exists,
without waiting for tiles. Style replacement restores the latest snapshot, and an empty
scope immediately removes the owned source/layers and invalidates stale hit-test
identities.

Phone-width maps (under 768 CSS pixels) and coarse-pointer devices reserve at most 150
photo overlays. Wider fine-pointer maps retain 500. Selection comes first, followed by
highlighted rows, existing active overlays and nearby new active rows; recent cached
rows fill remaining room. Existing overlays keep stable membership during movement, and
new data can appear as canvas points immediately. The settled camera chooses new photo
detail, favoring the viewport center. A tapped canvas point promotes its selected photo
without raising the allowance. Selection only uses supplied or same-scope retained
records; it never appends arbitrary generic-cache records outside the query scope.

Country flags and Breadline markers continue to show their full country/brand/status
semantics. They use progressive native creation but are exempt from the photo-only
allowance. The overall native ceiling remains 500, with selected and active operational
rows protected before cached overlays. This preserves meaning but means a dense map made
entirely of these custom styles can still carry substantial native positioning cost.
Headless/export maps and admin maps keep synchronous native rendering.

Native cold creation is opt-in and targets 4 ms of work per animation frame, with a
second guard of 16 nodes. The timed work includes construction and `Marker.addTo`. One
bounded camera reconciliation and cache eviction pass follows the batch, so 4 ms is a
work-slice target rather than a hard total-frame limit. Cold work pauses during
gestures/flights, does not start images for distant rows or to fill the cache, and
resumes after settling. A selected near-view marker can promote immediately. Existing
state updates, invalid scope removals and presentation replacements remain immediate;
queued closures are replaced by the latest row/options snapshot. Disposal cancels
frames, listeners, point layers and pending creation.

Browser checks exercise real point taps, promotion at the 150-photo cap, selected DOM
reuse through basemap replacement, scope replacement during movement, deferred images,
and disposal. A 390-by-844, DPR-2 fixture retains 500 GPU identities with 150 photos;
switching scope while moving removes all old points/photos and keeps new photos at zero
until the camera settles. The layer's hit test expands small points for touch without
clustering them. Native marker clicks remain authoritative; GPU clicks open the normal
feature card without inventing a DOM transition origin.

The final comparison uses 500 active rows and 1,000 cached rows, a 390-by-844 viewport,
45-degree pitch, 17.6-degree bearing, Chromium with 4-times CPU slowdown and a
1.5-second warmup. Values below are medians of three trial percentiles; lower is better.
In the ordinary cases the committed native renderer starts with 500 attached photos,
while the adaptive renderer starts with 150. The page-arrival case starts with 400
active rows and adds 100 during the pan. All adaptive trials retain every active point
identity.

| Camera case                   | Native median / p95 frame | Adaptive median / p95 frame |
| ----------------------------- | ------------------------- | --------------------------- |
| Pan, DPR 1                    | 33.4 / 50.0 ms            | 16.7 / 16.8 ms              |
| Zoom, DPR 1                   | 33.3 / 50.0 ms            | 16.7 / 33.3 ms              |
| Fly, DPR 1                    | 16.7 / 50.0 ms            | 16.7 / 16.8 ms              |
| Pan with arriving page, DPR 1 | 33.3 / 50.0 ms            | 16.7 / 16.7 ms              |
| Pan, DPR 3                    | 66.6 / 83.2 ms            | 49.9 / 50.1 ms              |

The arriving page's synchronous reconciliation falls from 31.9 to 7.7 ms; photo
construction waits for the settled camera. This measures synchronous work rather than
time to downloaded, decoded and fully painted images. The fly median is unchanged
because that path moves many native markers offscreen; its slow-frame tail improves.
Both benchmark variants use the current viewport scheduler and publish one endpoint, so
the table isolates rendering rather than attributing the scheduler's request savings to
frame rate.

The high-DPI diagnostic reports a SwiftShader software GPU. At DPR 3, even a points-only
control with no native photos measures 33.4 / 50.1 ms. Keeping 150 photos but lowering
the map canvas to DPR 2 measures 33.3 / 33.4 ms on the same DPR-3 viewport. This shows
fill-cost sensitivity in the test environment, not the hardware/sharpness trade-off on
iOS. The product therefore retains native canvas resolution and the 150-photo mobile
allowance. Canvas downsampling needs physical-device evidence before adoption.

The focused validation passes 119 tests across eight suites. A full Svelte check has
three unrelated image-component errors and no errors in the changed map files. Raw
trials, source fingerprints, interaction results and limitations are recorded in
[`../benchmarks/map-markers-adaptive-2026-11-08.json`](../benchmarks/map-markers-adaptive-2026-11-08.json).
The fixture uses an empty basemap, a shared generated image and MapLibre's default
antialias setting (false); the application's default antialias setting is true. Real
tiles, distinct photo decoding, panel scrolling and physical iPhone GPU/thermal behavior
still need device validation; these measurements do not establish 60 fps on iOS.

Run the implementation comparison with
`dev-check bun scripts/dev/benchmark-map-markers.ts --renderer=adaptive --width=390 --active=500 --cached=1000 --pitch=45 --bearing=17.6 --warmup=1500 --repeat`.
Use `--renderer=native --baseline-ref=f8930395f69fc16cb2a6c0f4170920019bd8de24` for the
measured pre-change baseline, `--motion=zoom` or `--motion=fly` for camera paths,
`--arrival=100` for a page arriving during a pan, and `--dpr=3` for higher pixel
density. The diagnostic `--map-dpr=2` overrides canvas resolution independently of
device DPR; it does not change the application policy. `--screenshot=/tmp/markers.png`
saves the settled view. The 1.5-second warmup allows the progressive overlay to fill
before comparing steady movement. Run the interaction check with
`dev-check bun scripts/visual-checks/adaptive-marker-check.ts`.

## Maintained and cached counts

Common hierarchy, neighbourhood and boolean-flag counts sum `featureCountRollup` bins.
Triggers maintain one contribution per feature in `featureCountEntry`, including its
scope, visibility, flags and English neighbourhood. Entry deltas preserve the old
contribution during moves and deletion cascades. Query predicates use the same
authorized layer/hub boundaries as feature reads. No feature aggregate runs on this
path. The verified local public snapshot has 1,065 visible features represented by 69
bins.

Arbitrary text, property, list and spatial filter combinations use `featureCountCache`.
Its SHA-256 key covers the actual authorized aggregate SQL and bound values, excluding
cursor, page size, sorting and retained marker IDs. Repeated pages and queries reuse the
stored exact total and facets while source revisions match. Canonical feature,
translation, property and hierarchy changes invalidate relevant results; membership
changes use a separate per-user revision so saving one feature does not invalidate
everyone else's counts. Cache publication checks that revisions have not changed during
the calculation. At most 512 aggregate entries are retained.

The first unseen detailed query, or the first query after a relevant change, still
calculates its indexed matches. Maintaining every possible free-text/property/list
intersection would require an impractical number of combinations. Common rollups and map
requests avoid that work entirely; repeated detailed queries reuse it. Maintained bins
add bounded write work per source change instead of repeated feature-count reads.

## Populate existing features

Spatial backfill is a one-off rollout or recovery operation, not a deployment step.
Production mirrors now include populated H3 cells. `bun run db:mirror:post:local`
validates that no point indexes are missing, prepares divisions and initializes agent
users without rebuilding spatial indexes. If validation fails, inspect the affected
geometry and run the manual repair command below before repeating mirror preparation.

For a manual bounded backfill, apply pending migrations (0078 through 0081), then run:

```sh
bunx wrangler d1 migrations apply hype-db-local --local
bun run feature:spatial:backfill --batch-size 100 --max-batches 20
```

The script defaults to local D1, 25 source features per page and 20 pages. Use
`--dry-run` to inspect the pending workload without writes. It reports the last
processed ID and stops at the configured budget. Re-running from the beginning is safe
and uses the partial pending index; already indexed rows are not revisited.
`--after-id <id>` resumes after a reported cursor, but omit it when checking for repairs
that may have appeared before that cursor.

Remote operations require both an explicit remote flag and environment. Run them only as
part of the intended deployment:

```sh
bunx wrangler d1 migrations apply hype-db-preview --remote --env preview
bun run feature:spatial:backfill --remote --stage preview --batch-size 100 --max-batches 20
```

Use `hype-db-prod`/`--env production` and `--stage production` for production. Remote
indexing is never triggered by application startup. Complete the H3 backfill before
directing map traffic to spatial queries; features without indexed memberships are not
spatial query candidates.

Deploy in this order: apply the migrations, complete and verify the H3 backfill, then
enable the application revision that issues spatial queries. Migration 0081 drops the
legacy gram table and populates its FTS/neighbourhood indexes without updating source
translations. It upgrades databases that already applied the earlier version of 0079;
fresh databases no longer create the gram table. The old search application revision
requires the removed gram table, so coordinate this migration with the new application
revision instead of serving old search code after it runs. The backfill reports
remaining pending rows; require zero valid pending point geometries before rollout. For
one-off repairs, add `--require-complete` to verify all pending point geometries,
including rows before a resume cursor, and fail on skipped points or an exhausted batch
budget. Neither CI deployments nor local mirror preparation automatically invoke the
backfill.

## Search index maintenance

The search mapping uses an explicit integer primary key, so its FTS document identities
survive `VACUUM` and do not depend on translation rowids. Translation/feature identity
changes cascade through the mapping; deletion removes the corresponding FTS document.
`featureSearchContent` computes encoded tokens from authoritative translations when
populating or refreshing the index and does not persist another copy of the text.

The FTS table is migration-managed and deliberately absent from Drizzle's ordinary table
metadata. Do not replace it with generated `CREATE TABLE` DDL. It uses
`contentless_delete=1` and `detail=none`; `columnsize=0` is incompatible with
contentless deletion.

Cloudflare currently
[documents an export limitation for databases containing virtual tables](https://developers.cloudflare.com/d1/best-practices/import-export-data/#known-limitations).
Existing `wrangler d1 export` dump commands must not be assumed to work once FTS is
installed. Do not drop a live search index just to export it. Use D1 Time Travel for
database recovery; a portable source-data exporter and the existing SQL reorder/restore
scripts require separate FTS-aware handling before use. Search documents are derived
data and should be rebuilt from `featureI18n` on a portable restore; copying FTS shadow
tables through the existing SQL reorder script is unsupported. The reset routine removes
the new search objects before their source tables.

Each update checks the raw geometry snapshot and that its index is still missing,
preserving concurrent edits and `modifiedAt`. Valid legacy numeric coordinate strings
are normalized only in derived data; source geometry is retained. Invalid/non-point
geometry cannot produce a point marker and is reported as skipped when encountered in
the pending point index.

## Repair after manual geometry changes

Application writes keep membership current. A raw SQL geometry edit that omits a
matching `spatialIndex` removes its old membership and sets its index to NULL, so a
feature cannot continue appearing at its old location. Run the same backfill command to
repair these rows. A failed batch can be retried safely because writes are conditional
and trigger work is atomic.

## Production map recovery (2026-10-19)

Production had 1,830 point features with missing H3 indexes after migrations were
applied without the local preparation step. The guarded remote backfill populated all
1,830 features and 23,790 spatial memberships (13 per feature), with no skipped points
or remaining pending indexes. The subsequent
`--remote --stage production --require-complete` check completed without writes.

The division facet query also failed with `D1_ERROR: out of memory: SQLITE_NOMEM`.
Joining division definitions before grouping carried large polygon attributes through
the membership sorter. Facet counts now group only feature/division identities in a
subquery before joining definitions and localized labels. This preserves authorized
filters and exact counts while keeping polygon payloads out of the grouping operation. A
SQLite regression check verifies the separate grouped query plan and facet metadata with
a large polygon fixture.

Deployed application version `a97f7c8f-c12c-4b13-9b72-28145be5f86a`. A fresh production
browser at `https://hype.hk/?panel=filters` returned 602 matching public features, 98
division facets, and viewport pages of 100 features; the screenshot confirmed rendered
markers and populated filters. Worker tail showed no errors for the observed new-version
requests. Focused spatial, count, query and readiness suites passed 121 tests; the
production build passed.

Preview was checked separately before retiring the automatic steps: all 1,811 features
lacked spatial indexes. Its explicit one-off repair populated 23,543 memberships with no
skipped points and passed the global completeness check.

## Ongoing feature lifecycle

Application creation and optimistic geometry updates calculate H3 membership in the same
write as geometry; database triggers materialize 13 resolution rows. Feature creation
queues division resolution. Geometry changes immediately remove old division memberships
and queue a new generation. The scheduled division worker processes up to ten jobs every
five minutes, with retries and monthly discovery of SaanSeoi releases; backlog and
release scanning can delay completion. It resolves against the pinned applied or target
release. These paths do not depend on backfills or application deployments.

The service-level regression test exercises actual creation, spatial materialization,
scheduled division resolution, movement and stale-write rejection against SQLite with
the production migrations. Manual repair commands remain available for raw SQL imports
and restores that bypass the application write helpers.
