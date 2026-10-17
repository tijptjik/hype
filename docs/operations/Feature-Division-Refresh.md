# SaanSeoi feature divisions

HYPE resolves division membership through `GET /divisions/v0.2/geocode` and compares
releases through `GET /divisions/v0.2/changes`. Both authenticate with the server-side
`SAANSEOI_API_KEY` using `x-api-key`. The geocoder returns JSON:API 1.1; the Worker
validates and normalizes that response at its API boundary.

## Storage and lookup design

| Storage | Purpose |
| --- | --- |
| `divisionDefinition` | Stable SaanSeoi identity, imported release and source classification/names |
| `divisionI18n` | Locale, display name and complete supplied named values, including variants and aliases |
| Feature named role IDs | Unique selected `countryId`, `areaId`, `districtId`, `townId`, `ruralAreaId`, `macrohoodId`, `neighbourhoodId`, `villageId`, `microhoodId`, `hamletId` and `islandId` |
| `feature.divisionResolution` | Per-query status and every upstream branch path; null for pre-migration queries whose paths were not retained |
| `featureDivisionMembership` | Canonical and non-canonical IDs, indexed by division for targeted changes and hierarchy filters |
| `divisionRefresh`, `divisionRefreshChange`, `featureDivisionJob` | Checkpoint/lease, resumable change scans and retryable feature work |

The mirror contains referenced divisions, including ancestors and ambiguous
candidates. Metadata changes update existing mirror entries; they do not import
the entire upstream catalogue. Unreferenced definitions are pruned after refresh
work completes. Authoritative upstream membership polygons are retained in definition attributes
for geometry eligibility and subsequent on-demand map highlighting. Facets carry
only polygon availability, never the polygon payload.

SaanSeoi supplies nullable display levels and separate administrative, locality,
landform and full hierarchy paths. Migration 0088 replaces the fixed-level columns
with named roles. Each role is populated only when its selected ID is unique;
ambiguous responses retain candidates and paths without selecting them. `countryId`
maps the upstream `country` class, not `sar`. SAR membership remains in the index,
but SAR is excluded from the shared filter/Omnibar options.

`islandId` accepts `major_island`, `minor_island` and `islet`, excluding island groups.
An ancestor island is removed only when every full path of another selected island
contains it, matching SaanSeoi's membership projection. Never choose a branch by order.
The migration backfills roles from selected memberships and mirrored hierarchies,
rebuilds the count tables, and invalidates count caches without re-geocoding features.
Coordinate changes clear all roles and the query resolution atomically.

The membership index is authoritative for arbitrary division queries. Use
`filters.divisionIds` on the feature query API: it matches any supplied selected
ID, including ancestors or landforms, and counts each feature once. Responses
include named role IDs, `divisionResolution` and `divisionMemberships` with
selected/candidate flags. Localized labels belong to division facets/definitions;
there is no arbitrary single-leaf `division` relation. Client create/update schemas
exclude worker-owned division columns.

## One count system

Migration 0083 removes `featureDivisionCountRollup`, membership JSON scope bins,
and their count triggers. `featureCountEntry` and `featureCountRollup` instead
store the ordinary scope/status fields plus the eleven named role projections
introduced by migration 0088. Empty
strings represent null dimensions inside compound count keys; feature columns
remain nullable. One feature contributes exactly once to the canonical count
rollup, even when it has several selected ancestors.

Count by a specific role with `GROUP BY districtId` (for example), applying the
same authorization predicates as feature reads. For unions of memberships or
roles with multiple selections, use the membership index and distinct feature
selection. The server's division-ID filter takes this latter path and uses the
revision-checked detailed count cache.

`featureCountUserRevision` remains independent: `userFeature` insert/delete and
changes to user, feature, wishlist or visited flags increment the affected user's
revision. Saved-list count caches must match both this revision and the global
`featureCountRevision`. Editing one user's list does not invalidate public counts
or another user's list counts. Its missing user FK is deliberate: cascade deletion
can still increment the final revision.

## On-demand map highlighting

`getDivisionGeometry` returns only one mirrored definition's validated membership
polygons and imported release. `divisionGeometryDetail` uses the existing scoped
`ResourceClient` and native query retention. Facets never contain polygon payloads.

`DivisionCtx` keeps preview state surface-local. Filter and Omnibar pointer/focus
callbacks preview an ID; selected filters and the active division collection retain
the highlight. `DivisionHighlightLayer` owns active detail handles and releases them
when IDs, access scope or surface lifetime change. `MapCanvas` owns the renderer;
fill/outline layers are restored after style changes and removed on teardown.
Admin and dashboard resource views do not construct a public map.

## Monthly refresh and geometry changes

A five-minute Cron Trigger drains bounded work. Once per UTC calendar month, it
requests changes from the last fully applied release to the latest release. The
comparison ID, target release ID/code and page cursor are pinned while processing.
Every geocode request uses the pinned target; checkpoints advance only when all
changes and jobs finish. The completed comparison establishes which features need
another lookup without retaining geocoding response logs.

- Names and other non-membership metadata update the local mirror without geocoding.
- Membership-affecting changes queue existing members and transitive dependent
  descendants from both releases.
- Additions and expanded/moved polygons also scan features in the new geometry.
  Restricting this to previously used IDs would miss newly covered features.
- A missing polygon does not justify inventing geometry; dependency matches still
  identify affected existing members.

`canAffectGeocodingMembership` is authoritative. Hierarchy/classification changes
can require a new resolution even when polygon coordinates are unchanged.
Candidate selection uses bounding boxes, then exact polygon coverage including
boundaries and excluding hole interiors, in batches of 100 features.

A four-minute fenced lease prevents overlapping owners from publishing results.
Each job has a generation. Membership replacement, feature projections, count
invalidation and acknowledgement share an atomic D1 batch, which rechecks
generation, coordinates and ownership. Geometry edits immediately clear old
memberships/projections and enqueue the new location. Failed jobs retain errors and
back off; they are never silently discarded. API calls have a deadline and
response-size bound.

## Local migration and backfill

Use `http://api.atlas.localhost` for development. The September evidence below used
port 8787 and does not establish current publication or local database readiness.

The local command calls the same refresh implementation as the scheduled Worker.
It validates authentication and the API contract before changing the database.
Supply an explicit database path; it never guesses among old local SQLite files.

```sh
bun --env-file=/path/to/server-credential.env run scripts/backfill-feature-divisions.ts \
  --database .wrangler/state/v3/d1/miniflare-D1DatabaseObject/LOCAL_DATABASE.sqlite \
  --base-url http://api.atlas.localhost
```

The default is an API/database inspection. Add `--apply` to back up the database,
apply migrations 0082/0083 and drain the queue. Use `--key-env VARIABLE_NAME` if the
credential file uses a name other than `SAANSEOI_API_KEY`. Backups and verification
outputs live under ignored `.local/division-refresh/`. Do not run against a copied
SQLite file while expecting the app's database to change. Avoid another local
migration runner during the operation; an active refresh lease is respected.

The command stops on failed jobs, retaining progress and retry times.

To move an idle database from the v0.1 Overture edition to the current v0.2
curated edition, add `--apply --rebuild`. The command validates the latest v0.2
geocode and same-release changes contracts, backs up the database, and requeues
every feature against that concrete release. It retains the applied checkpoint
until every replacement succeeds. Resume without `--rebuild`; active refreshes
cannot be reset. This avoids an invalid incremental comparison across API editions.

For a bounded rehearsal, add `--apply --max-steps 3`. Each refresh step processes
at most ten jobs; initial release discovery takes one step. The command reports
`bounded: true` when the requested steps finish and preserves its checkpoint.
Resume with the same explicit database and origin. Existing failed jobs may reach
their retry turn; a new failure stops the run. If only future retries remain, the
command reports `waitingForRetry: true` rather than spinning. Neither bounded nor
waiting output means the backfill is complete; require `complete: true`.

Inspect:

```sql
SELECT * FROM divisionRefresh;
SELECT count(*) AS pending, min(retryAt) AS nextRetry FROM featureDivisionJob;
SELECT attempts, lastError, count(*) AS jobs
FROM featureDivisionJob GROUP BY attempts, lastError;
SELECT locale, count(*) FROM divisionI18n GROUP BY locale;
SELECT count(*) FROM feature;
SELECT sum(totalCount) FROM featureCountRollup;
PRAGMA foreign_key_check;
```

For a remote environment, apply the migrations and configure the appropriate
SaanSeoi origin/key before deploying both the application and division-refresh
Worker. The new application queries require migrations 0083 and 0084. The old Worker must
not run against 0083, because its membership-bin columns have been removed.
Pause the old schedule during that coordinated transition. Local execution does
not deploy or activate a remote cron.

## Division filtering, counts and localization

Migration 0084 removes the old `featureNeighbourhood` compatibility view. Apply it
when upgrading an existing 0083 database; no division refresh is needed.

Filters use `divisionIds` and `excludeDivisionIds`. Every selected membership is
eligible, including macro-neighbourhoods, neighbourhoods and micro-neighbourhoods.
Each `facets.divisions` entry is keyed by division ID and contains its level,
category, class, localized registry names and distinct contained-feature count.
The overall total is counted independently; parent and child counts must never
be added together. Candidate memberships contribute neither filters nor counts.

Selectors and navigation use these registry facets and the user's language
preferences. Changing language preserves selected IDs. Missing translations use
the shared name fallback. Selector counts ignore the current geographic selection
and camera, while retaining authorization and other active filters.

Authored/imported `featureI18n.addressProperties` remain source address data.
They do not establish geographic identity. Static neighbourhood name inference,
parent expansion and the static navigation catalogue have been removed. Address
providers retain their own source text; coordinate resolution supplies canonical
division membership and localized division labels.

## Verification

```sh
bun run check:division-refresh
bunx vitest run src/tests/division-refresh.test.ts src/tests/feature-query.services.test.ts \
  src/tests/feature-query.test.ts src/tests/feature-query-integration.test.ts --config vitest.config.ts
```

Tests execute the actual migrations and worker SQL with atomic rollback, including
new/expanded polygons, metadata-only changes, pagination, deletion dependencies,
retry/fencing, stale coordinates, ambiguity, level collisions, island groups,
localized names, source-address independence and authorized query counts.

### Local execution evidence — 16 September 2026 (Hong Kong)

The local HYPE database was backed up, migrated and processed against Atlas on
`localhost:8787`, pinned to `data-hk-divisions-2026-09-01.0`:

- 1,814 features processed: 1,473 resolved, 337 ambiguous and 4 unsupported geometries.
- No pending jobs; refresh phase `idle` with the release checkpoint applied.
- 105 referenced divisions, with 105 English and 105 Traditional Chinese name rows.
- No foreign-key violations, count-bin differences, selected ambiguous memberships,
  island-group leaves or unreferenced mirror entries.
- Source coordinates and `featureI18n` contents match the pre-migration backup.
- 122 focused tests and the Worker typecheck passed; the application build passed.
- The full Svelte check was not clean (1,020 errors across 185 files at that check);
  it is not evidence of a clean repository-wide type baseline.
- Live current/current and August/September changes-feed requests passed the adapter.

Local verification and unresolved-feature details are retained in
`.local/division-refresh/verification.json` and
`.local/division-refresh/unresolved.json`. The unresolved features retain upstream
candidate evidence instead of an invented selected division. These artifacts and
backups are ignored by Git. Remote migrations and Worker deployment were not run.

### Local investigation — 17 October 2026 (Hong Kong)

The running app's open database handle identified
`.wrangler/state/v3/d1/miniflare-D1DatabaseObject/d3080fe932e72db09a66987b4bc33e3301f57365daef263894a0551146999c8f.sqlite`.
Before this run it contained no division definitions or memberships, 1,828 jobs
with zero attempts/errors, and an idle checkpoint without an applied release or
lease. Vite runs the app, not the dedicated scheduled refresh worker. The local
app credential file did not contain `SAANSEOI_API_KEY`; the rehearsal used an
existing local Atlas credential through `--key-env`, without copying it into code.

The first consistent backup is
`.local/division-refresh/backups/2026-10-17T12-12-15.928Z.sqlite`.
The three-step rehearsal pinned `data-hk-divisions-2026-09-23.0`, processed 20 jobs,
and persisted 41 selected memberships and 12 definitions. All 12 had codes,
identifiers, hierarchy paths, polygons and English/Traditional Chinese names.
Their metadata matched pinned definition responses, and decoded CURRENT area
blobs matched the polygons. Feature coordinates and authored translations matched
the backup; feature and count-rollup totals were both 1,828, with no foreign-key
violations.

The September publication is the current v0.1 Overture composition. Its manifest
contains primary division snapshot `875f86ba-a5b9-5cb9-98f7-13e90d1278e8` and area
snapshot `ec76330e-1dbc-50e1-b93d-770fa697b055`, each with a current, prepared,
nonempty-token receipt. CURRENT has 142 Overture area rows; the resolver covers
140 of 1,818 divisions. `areas:saanseoi` is absent from this composition, so its
409 is correct and is not a worker dependency. The worker requests only hierarchy
metadata alongside geocoder polygons. `geometry=saanseoi` enables polygon output;
release composition selects membership geometry, including the explicit Overture
fallback. `coverage.geometry=overture` is accurate persisted provenance.

October is a separate v0.2 publication, with prepared curated division and area
snapshots and 590 SaanSeoi area rows. Its own pinned definition request succeeds.
September pinned to v0.2 has no compatible binding; that 503 does not establish
that October is unready. The worker remained on September throughout this run.
At initial inspection, the v0.2 geocode URL was shadowed by division-detail
routing and returned a 404 for ID `geocode`. The curated-edition migration below
repairs route ordering and verifies all three v0.2 worker endpoints together.

A full membership check exposed a separate geocoder response defect: containment
uses every area row but the response returned only the first. Five selected Sai
Kung memberships fell outside that first polygon. The Atlas resolver now returns
all published polygon parts as a MultiPolygon. The two multi-area mirror entries
(Hong Kong and Sai Kung) were backed up and refreshed from the same release;
no membership was inferred from display levels or label points.

During draining, Atlas intermittently returned `503 service_unavailable`, the
response from its transient-D1 error handler. Concurrent local
`divisions:crosswalk`/`init:divisions` work held the same CURRENT/META files.
Authenticated retries succeeded. Durable jobs retained their errors and backoff;
a bounded local retry harness respected `retryAt` and the worker's fenced writes.
No failed readiness check was overridden and no publication metadata was changed.

Completion verification:

- All 1,828 jobs drained; checkpoint `idle`, applied release
  `data-hk-divisions-2026-09-23.0`, no target, lease, pending change or error.
- 24 referenced definitions, all with codes, identifiers, hierarchy paths and
  polygons; 24 English and 24 Traditional Chinese names. All metadata and complete
  polygon parts match the pinned API definitions and decoded CURRENT storage.
- 3,725 selected memberships across 1,824 features. Every selected membership's
  stored polygon covers its feature point; zero label-point areas or uncovered
  memberships. The other four features have unsupported coordinates and retain
  no invented membership.
- Feature count, count-entry count and rollup total each equal 1,828. No foreign-key
  violations or unreferenced definitions. Coordinate and authored-translation
  hashes match the initial backup.
- The production count service, tested with published/non-archived/non-draft
  status predicates, returns 1,067 features and 22
  geometry-backed options. This checks the shared facet pipeline, not additional
  hub/authorization predicates. All 66 name/code searches across those options return
  identical IDs through the panel's shared filter and Omnibar search pipeline.
- Playwright on `http://hype.localhost` confirms that both rendered controls find
  Central and Western District by `CW` and `Central`. The temporary prescribed
  port-4173 server was stopped; it had guest-bootstrap/HMR issues, so successful
  browser acceptance uses the running app's canonical local origin.
- 94 focused Hype tests and the refresh Worker typecheck passed. Atlas's 29 focused
  geocoding tests, detached-area regression and application typecheck passed.

Sanitised aggregate evidence and verification helpers are under ignored
`.local/division-refresh/`; no feature IDs, coordinates, personal records or
credentials are included in this document. The local scheduled worker remains
inactive: run the explicit local command again for subsequent queued changes, or
configure a deliberate local scheduler against this same database and development
origin. No deployment, remote schedule, production backfill or cleanup was run.

### Curated edition migration — 17 October 2026

The intended edition is v0.2 and its latest publication,
`data-hk-divisions-2026-10-01.0`. Hype now uses `/divisions/v0.2/geocode`,
`/divisions/v0.2/changes` and `/divisions/v0.2/{id}` consistently. Atlas registers
literal geocoding routes before division ID routes; its router regression checks
that v0.2 geocoding query validation is reached instead of a detail lookup.
The payload schema remains `sv-division-v1`; the API edition and payload schema
version are different selectors.

Live v0.2 geocoding and current/current changes select October, with SaanSeoi
geometry covering 562 of 2,000 divisions. The definition endpoint returns the same
October release and curated hierarchy. The public metadata/changes fixtures retain
that live contract, including the supplied nullable codes and identifiers.

The pre-migration backup is
`.local/division-refresh/backups/2026-10-17T12-34-14.188Z.sqlite`.
`--rebuild` requeued every feature without fabricating a cross-version changes
comparison. The bounded rehearsal validated 43 October definitions against the
pinned metadata endpoint and the curated area publication
`ca423039-9e01-5bc2-9c33-63c405266fd4`. Every selected membership processed in the
rehearsal was covered by its stored polygon. Ambiguous responses retain candidates
without selected memberships. Existing memberships are replaced atomically per
feature; the applied release advances only after the entire queue finishes.

The interrupted run was inspected again at 13:16 UTC. It retained 510 jobs and
the October target, with September still the applied checkpoint. Concurrent
named-role work had changed the worker to write `countryId` and related columns,
but the running database had not received migration 0088. The resumed runner was
stopped after observing `no such column: countryId`; failed atomic batches did
not acknowledge jobs. The CLI now rejects this schema mismatch before job writes.

Migration 0088 was rehearsed on a disposable consistent database copy: feature
coordinates, authored translations, memberships, queued jobs and checkpoint were
unchanged; feature, count-entry and rollup totals remained 1,828, with no foreign-key
violations. The user subsequently applied that separately owned migration to the app database,
and its migration receipt and named-role columns were verified before resuming. The 169 imported October definitions match pinned API codes,
identifiers and hierarchy paths, and all complete polygons match CURRENT storage.
The current worker's 21 refresh/role tests and typecheck pass. This is partial
migration evidence, not a completed October backfill or October browser acceptance.

### Named roles and map overlay verification — 17 October 2026

Migration 0088 was applied to a disposable SQLite copy of the explicitly identified
local Hype database. Integrity checking passed, and feature rows, count entries and
rollup totals each remained 1,828. Regression coverage verifies unique-role
backfill parity with the refresh writer, conflicting districts, alternative island
paths, coordinate invalidation, count updates/deletes and retained ambiguous paths.

The populated copy ran on `127.0.0.1:4173` in Chromium. Browser checks verified:

- The division filter is populated, includes neighbourhoods, and excludes SAR.
- Both filter and Omnibar match `CW` and `Central`; the initial Omnibar division
  preview matches the three highest eligible counts while skipping area, district
  and major-island classes.
- No geometry request occurs before preview/selection. The tested hover, focus,
  filter selection and Omnibar collection reuse one geometry request. Polygon
  fill/outline survives pointer leave for selected divisions and style replacement.
- Light/dark screenshots show the selected division and polygon overlay. The external
  basemap returned HTTP 401 at this review origin, so background-tile rendering was
  not accepted as part of this check.
- A temporary administrator was provisioned only in the disposable copy using a core
  hub role. Client navigation to admin created a distinct division context with empty
  selection/preview and no map canvas. No browser page errors occurred.

Worker compilation, 135 focused tests across eleven files and the production build
passed. Independent commit-checkout checks passed 74 role/refresh/query tests and
seven highlight/shared-option tests. Repository-wide checking still reports 966
errors and 21 warnings; no diagnostics refer to the new geometry/role modules.

The earlier copy-based review preceded the user-applied migration 0088 on the
shared local database. That migration and the completed October refresh are now
verified below. Old/new writers cannot be mixed across this schema boundary.
No production migration, backfill, deployment or schedule changed.

October completion verification after migration 0088:

- A fresh consistent backup was created at
  `.local/division-refresh/backups/2026-10-17T13-27-28.440Z.sqlite`. The bounded
  resumed run completed at step 50, including all retained retries.
- Applied release is `data-hk-divisions-2026-10-01.0`; phase is `idle`, with zero
  jobs or pending changes and no target, lease or error.
- 184 referenced definitions all have polygons and hierarchy paths, with 184
  English and 184 Traditional Chinese name rows. All names, codes, identifiers,
  hierarchy paths and complete polygons match the pinned v0.2 API and published
  CURRENT area storage. The 131 nonempty codes and 172 populated identifiers
  reflect upstream optional fields; absent values were not manufactured.
- 4,456 selected memberships across 900 features all pass exact stored-polygon
  coverage. Another 924 features retain 5,369 candidate-only memberships. Four
  features have unsupported coordinates; no valid point lacks membership evidence.
  There are no mixed candidate/selected features or unreferenced definitions.
- Feature, count-entry and rollup totals remain 1,828. Exact rollup-bin and feature
  projection comparisons have zero differences; all 1,828 named-role projections
  agree with selected memberships. No foreign-key violations exist. Coordinates
  and authored translations still match the original pre-refresh backup.
- The production facet service with published/non-archived/non-draft predicates
  returns 1,067 features and 77 geometry-backed options. All 216 name/code search
  comparisons return identical IDs through panel and Omnibar pipelines. These
  predicates do not constitute additional hub/authorization acceptance.
- Playwright on the canonical local app confirms both rendered controls find
  Central and Western District by `CW` and `Central`. An initial browser check
  timed out during app reload; the successful repeat loaded without runtime errors.
  Metadata verification retried transient Atlas 503 responses with the same pin;
  no readiness check or release binding was bypassed.
- The final Worker typecheck and live facet test pass. The 21 refresh/role tests
  passed after the concurrent role changes. Earlier focused Hype and Atlas routing/
  geometry regression results remain recorded above.

No October backfill blocker remains. The local scheduled worker remains inactive;
future queued changes need the explicit local runner (with migration 0088 present)
or a deliberately configured local scheduler. No deployment, remote schedule,
production backfill or destructive cleanup was performed.

### Landing-page read recovery — 17 October 2026

The reported workerd `SQLITE_BUSY_SNAPSHOT` was wrapped by D1 as
`Failed to get session commit token: internal error`, which bypassed the existing
read retry classifier. Read operations now retry this specific nested wrapper
within the existing six-attempt limit. It is not classified as proof of SQLite
contention for writes; unrelated internal errors still propagate immediately.
Five focused tests verify detection, successful recovery and bounded failure.

After October completion, three consecutive Chromium loads of `hype.localhost`
verified populated division controls, `CW`/`Central` matching in both filter and
Omnibar, selected filter state, SAR exclusion and successful on-demand geometry
responses. There were zero page errors or failed remote responses. This verifies
the actual migrated local app; the original transient lock was not deliberately
reproduced against the shared database. Another 44 division/role/highlight/query
tests passed. Earlier copy-based admin-isolation evidence remains separate.
