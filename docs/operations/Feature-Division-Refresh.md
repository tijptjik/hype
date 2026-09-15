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
| `feature.divisionLeafId` | Unique deepest canonical non-landform division |
| `feature.divisionLevel1Id` … `divisionLevel6Id` | Canonical projections for fast level-specific filters/counts; level 1 prefers administrative over locality |
| `feature.landformLeafId` | Unique selected landform leaf, excluding `island_group` |
| `featureDivisionMembership` | Canonical and non-canonical IDs, indexed by division for targeted changes and hierarchy filters |
| `divisionRefresh`, `divisionRefreshChange`, `featureDivisionJob` | Checkpoint/lease, resumable change scans and retryable feature work |

The mirror contains referenced divisions, including ancestors and ambiguous
candidates. Metadata changes update existing mirror entries; they do not import
the entire upstream catalogue. Unreferenced definitions are pruned after refresh
work completes. No upstream membership polygons are retained after their change
scan finishes.

SaanSeoi defines levels **0–6**. The six feature projections represent levels 1–6;
level 0 remains in the membership index. HYPE uses the administrative branch when
an equivalent locality and administrative division coexist at level 1. An ambiguous
resolution keeps memberships but selects none. Never choose a branch by array order.

The membership index is authoritative for arbitrary division queries. Use
`filters.divisionIds` on the feature query API: it matches any supplied selected
ID, including ancestors or landforms, and counts each feature once. Responses
include the scalar projections, `division` with localized names and
`divisionMemberships` with selected/candidate flags. Client create/update schemas
exclude worker-owned division columns.

## One count system

Migration 0083 removes `featureDivisionCountRollup`, membership JSON scope bins,
and their count triggers. `featureCountEntry` and `featureCountRollup` instead
store the ordinary scope/status fields plus the eight division projections. Empty
strings represent null dimensions inside compound count keys; feature columns
remain nullable. One feature contributes exactly once to the canonical count
rollup, even when it has several selected ancestors.

Count by a specific projected level with `GROUP BY divisionLevelNId`, applying the
same authorization predicates as feature reads. For unions of memberships or
levels with multiple selections, use the membership index and distinct feature
selection. The server's division-ID filter takes this latter path and uses the
revision-checked detailed count cache.

`featureCountUserRevision` remains independent: `userFeature` insert/delete and
changes to user, feature, wishlist or visited flags increment the affected user's
revision. Saved-list count caches must match both this revision and the global
`featureCountRevision`. Editing one user's list does not invalidate public counts
or another user's list counts. Its missing user FK is deliberate: cascade deletion
can still increment the final revision.

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

In the verified local SaanSeoi setup, Atlas listens on port 8787; port 8788 is Harbour.

The local command calls the same refresh implementation as the scheduled Worker.
It validates authentication and the API contract before changing the database.
Supply an explicit database path; it never guesses among old local SQLite files.

```sh
bun --env-file=/path/to/server-credential.env run scripts/backfill-feature-divisions.ts \
  --database .wrangler/state/v3/d1/miniflare-D1DatabaseObject/LOCAL_DATABASE.sqlite \
  --base-url http://localhost:8787
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
Worker. The new application queries require migration 0083. The old Worker must
not run against 0083, because its membership-bin columns have been removed.
Pause the old schedule during that coordinated transition. Local execution does
not deploy or activate a remote cron.

## Compatibility and remaining UI work

Authored/imported `featureI18n.addressProperties` remain source address data.
They no longer drive division identity or count bins. `featureNeighbourhood` is a
read-only compatibility view of each selected `neighbourhood` membership's English
registry name, so features in a micro-neighbourhood still count toward its parent,
`facets.neighbourhoods` retains the current response field name. Existing label
selectors retain the static catalogue's parent-label expansion. New integrations
should use `divisionIds` and registry names.

The static neighbourhood navigation/map catalogue and legacy address lookup
provider in `src/lib/api/external/geocoding.ts` are separate remaining consumers.
Replacing those UI selections with registry IDs and switching forward address
search to `/addresses/v1/geocode` require their own payload/UI migration. This
change replaces automatic coordinate-to-division resolution, storage, filtering
and counts; it does not rewrite source addresses or claim those UI/provider paths
have already switched.

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
