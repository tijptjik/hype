# SaanSeoi feature divisions

HYPE resolves division membership through `GET /divisions/v1/geocode` and compares
releases through `GET /divisions/v1/changes`. Both authenticate with the server-side
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

The command stops on failed jobs, retaining progress and retry times. Inspect:

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

The shared local database still had an active October refresh and pending jobs
when reviewed. It was not migrated by this work. Stop its refresh writer before
applying 0088, then run the matching application and Worker code together: the
migration removes fixed-level columns, and old/new writers cannot be mixed across
that boundary. No production migration, backfill, deployment or schedule changed.
