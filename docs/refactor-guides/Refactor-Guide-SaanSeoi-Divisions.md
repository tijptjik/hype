# SaanSeoi divisions handoff

## Objective

Align Hype's DivisionCtx geographic context and align its
division contracts, references, codes, filters and labels with SaanSeoi. Review
the wider application for remaining neighbourhood-specific assumptions. Preserve
the existing division mirror and refresh pipeline wherever correct; this is not
a new geographic ingestion system.

Review and implementation date: 17 October 2026. The adapter, metadata enrichment,
geometry retention, shared selector search and context identity have been updated.
The initial handoff did not change the database, upstream publication or deployment;
the subsequent local refresh verification is recorded in the operations guide.
Migration 0088 and on-demand map highlighting implement the integration design below;
local migration/browser evidence is recorded in the operations guide.

## Working alongside the context refactor

Read both repositories' AGENTS.md files and Hype's docs/Components.md and
docs/refactor-guides/Refactor-Guide-Context-Boundaries.md before implementation.

The main Hype checkout contains a context refactor being reviewed in staged
chunks. At handoff, root.svelte.ts, resourceView.svelte.ts, app.svelte.ts and
admin.svelte.ts are staged. Other consumers remain unstaged. A separate fix makes
ResourceList.input reactive, with resource-collection-reactivity.test.ts and its
fixture; preserve it.

Do not commit, reset, unstage or reformat another thread's work. Coordinate an
isolated checkout based on the completed context refactor, or wait to edit
overlapping files until that thread has committed them. A worktree from HEAD
alone will omit the current staged/untracked implementation. Recheck status
instead of assuming this snapshot is current.

No monorepo conversion. Hype owns its application state; SaanSeoi owns geographic
identity and definitions. Do not add runtime imports reaching into ../saanseoi.
Treat that checkout as the contract reference. If a published schema package is
available, evaluate it; otherwise use a narrow validated adapter with upstream
contract fixtures. Do not invent a package or copy server implementation wholesale.

## What already exists

Read docs/operations/Feature-Division-Refresh.md first. It describes migrations
0082–0084 and records local verification on 16 September 2026 against a pinned
release. Those historical results do not establish today's database or deployed
Worker state.

Hype already has:

- workers/division-refresh/src/api.ts: validated upstream API boundary.
- workers/division-refresh/src/refresh.ts: monthly discovery, pinned comparison
  and cursor, fenced leases, resumable change scans and retryable feature jobs.
- workers/division-refresh/src/index.ts and wrangler.jsonc: dedicated Worker,
  with five-minute triggers configured for preview and production. Monthly
  discovery is controlled by checkedMonth in UTC; frequent ticks drain work.
  This is separate from workers/maintenance-scheduler.
- src/lib/db/schema/division.ts: divisionDefinition and divisionI18n mirrors.
- src/lib/db/schema/featureDivision.ts: membership and refresh/job persistence.
- Named administrative/locality/island feature roles and per-query divisionResolution
  replace fixed-level projections in migration 0088. The membership index remains
  authoritative for arbitrary filtering; definition metadata retains full source paths.
- src/lib/api/services/featureQuery.types.ts: DivisionFacet and ID-based filters.
- src/lib/db/services/featureCounts.ts: localized registry facets and counts.
- scripts/backfill-feature-divisions.ts: explicit-database inspection/backfill.
- src/tests/division-refresh.test.ts and src/tests/neighbourhoods.test.ts.

The old static neighbourhood catalogue and compatibility view were already
removed according to the operations guide. Current DivisionCtx consumes division
facets and selected membership IDs. The context and generic membership/count APIs now use division terminology;
existing collection URL vocabulary remains unchanged. Verify remaining static data
by searching producers and consumers; do not recreate a migration already done.

## Current integration and live evidence

Development origin: `http://api.atlas.localhost`. Production remains configured
separately as `https://api.saanseoi.hk`.

- Changes use `fromReleaseSet` / `toReleaseSet`; geocoding uses `releaseSet`.
  Response metadata still uses `apiReleaseSet` and must not be renamed mechanically.
- Changes require `membershipGeometry: "saanseoi"`. Geocoding explicitly requests
  `geometry=saanseoi`. Polygon and MultiPolygon data are retained under
  `divisionDefinition.attributes.membershipGeometry`; label points do not qualify.
- Live geocoding omits codes, identifiers and stored hierarchies. The worker enriches
  missing metadata through `/divisions/v0.1/{id}?releaseSet=...&profile=full&include=hierarchy`,
  validating ID, release and schema version. Same-release mirrored metadata is reused.
- Both write paths retain `names`, classification, optional `divisionCode`,
  `identifiers`, `hierarchies` and `membershipGeometry`. Geocoding merges into richer
  mirrored metadata; explicit absent codes from definition enrichment clear old codes.
- `DivisionFacet` is a query-scoped option: ID, classification, translated names,
  optional code, polygon availability and distinct matching-feature count. It is not
  a geographic definition or hierarchy. Facet payloads do not contain all polygons.
- The shared panel/Omnibar search accepts only polygon-backed options, matches all
  supplied translated names and codes, and keeps canonical IDs as selection identity.
  Empty Omnibar previews skip Area, District and Major Island; typed searches include them.
  The panel displays class icons and sorts by supplied display level, using class order
  where levels are missing. Display order does not assert ancestry.

Read-only local inspection found zero definitions and memberships, and 1,828 pending
jobs in the main local Hype SQLite database (the `d3080fe...` file, not its backup).
The refresh checkpoint was idle with no applied release. This explains the empty UI.

Live Atlas currently selects `data-hk-divisions-2026-09-23.0`, with 140 of 1,818
divisions covered by membership geometry. Current/current changes validate successfully.
The v0.1 metadata endpoint works; `include=areas:saanseoi` returns
`409 variant_unavailable`. v0.2 returns `503 snapshot_not_ready`. Geocoding reports
coverage geometry `overture`, even with the explicit selector. These observations
must be resolved with upstream publication before claiming canonical-area backfill
or full local selector acceptance. Do not silently select a different publication.

## Hierarchy integration design

Use SaanSeoi's `hierarchies.administrative`, `.locality`, `.landform` and `.full`
as independent arrays of root-to-leaf ancestor paths. Preserve alternatives,
`fullContainment` and the owning ID separately (paths exclude the owner). Numeric
levels are nullable display metadata and cannot establish parentage or a deepest leaf.

Migration 0088 replaces level-specific projections with SaanSeoi's named roles:
`countryId`, `areaId`, `districtId`, `townId`, `ruralAreaId`, `macrohoodId`,
`neighbourhoodId`, `microhoodId`, `villageId`, `hamletId` and `islandId`.
Only unique selected role IDs become scalars. The island projection removes an
ancestor only when every full path of another selected island contains it.
All alternative memberships remain indexed; query status and branch paths are
stored in `divisionResolution`. Existing query paths that were never persisted
remain null rather than being fabricated during the metadata-only migration.
Schema, refresh writes, coordinate invalidation, count rollups and response fields
migrate together. `DivisionFacet` remains the counted localized option contract.

Polygon storage is per division and release, not per feature. The geometry remote
query validates stored polygons and uses scoped resource detail handles on demand.
`MapCanvas` renders fill/outline layers for hovered/focused options, selected filters
and the active Omnibar division collection, with style-reload and teardown handling.
Facets and dashboard initialization do not fetch the polygon catalogue.
A metadata-only backfill can enrich referenced definitions without re-geocoding every
feature; geometry availability and changed membership still require independent proof.

## Upstream sources to read

Paths below are relative to ../saanseoi:

- docs/division-changes.md and docs/geocoding.md.
- apps/atlas-api/src/schema/divisions.ts.
- apps/atlas-api/src/schema/geographicCodeFilters.ts.
- apps/atlas-api/src/schema/geocoding.ts.
- apps/atlas-api/src/schema/divisionChanges.ts.
- apps/atlas-api/src/routes/divisions/changes.ts and changes.test.ts.
- apps/atlas-api/src/services/divisionChanges.ts and divisionChanges.test.ts.
- apps/atlas-api/src/routes/divisions/v0/divisions.ts and
  divisions.contract.test.ts; inspect index.ts for mounted API versions.
- apps/atlas-api/src/schema/divisionIdentifiers.test.ts.
- Division hierarchy/crosswalk routes and docs if a feature genuinely requires
  relationships across different geographic inventories.

The current division resource has stable id, optional divisionCode, category,
class, level, localized names and hierarchy branches. Categories are
administrative, locality, hood and landform. Locality is one category; it is not
the umbrella name for this context.

Geographic code filters are namespaced: adminCode, localityCode, hoodCode and
landformCode. Their classes differ. Preserve canonical IDs as persisted identity.
Use codes for readable references/search where the upstream contract supports
them. Do not assume codes are mandatory, globally unique, immutable, or valid
without a category/release context. Validate lookup, ambiguity and code-change
behavior before designing URL references.

## Implementation sequence

1. Audit current state and producer-to-consumer contracts. Map upstream response
   fields through adapter, mirror, feature projection, facets, UI and URL state.
   Inspect local refresh checkpoint and job state only against an explicitly
   identified database. Report deployment/configuration separately from code.

2. Repair the upstream adapter and contract tests. Preserve bounded requests,
   release/comparison pinning, pagination, retries and fenced atomic writes.
   Use the authoritative membership-impact flag. Keep schema version handling
   explicit rather than accepting arbitrary shapes or silently dropping fields.

3. Define a typed division identity/reference/metadata model. Separate source
   definition metadata from per-query counts, selected membership, display labels
   and current filter state. Decide how optional codes and branches are projected
   into facets/details. Prefer a narrow schema-backed Hype adapter over another
   independent geographic classification list.

4. Rename PlaceCtx, placeCtx, PlaceState, context keys and accessors to DivisionCtx,
   divisionCtx, DivisionState, setDivisionCtx/getDivisionCtx. Rename generic
   neighbourhood APIs to division APIs where they actually accept all categories.
   Preserve useful comments and update their terminology. Do not rename literal
   source address fields or a genuinely hood-only UI blindly.

5. Keep division filter selection, exclusions, visible memberships and counts
   surface-local. AppCtx and AdminCtx must not share mutable selection through
   RootCTX. Reuse shared scoped metadata/resource capabilities where appropriate.
   Future BreadlineDashCtx can request relevant divisions without bootstrapping
   the public map, importing all polygons or fetching the complete catalogue.
   Do not create global SSR singletons or a second independent payload cache.

6. Audit consumers: ResourceViewCtx and AppCtx constructors, public/admin layouts,
   client/services/geospatial.ts, adapters/panels/useFilterPanelModel.svelte.ts,
   panels/sections/neighbourhoods/NeighbourhoodsSection.svelte, search/navigation,
   feature forms/cards, map filters, saved views, admin lists and dashboard needs.
   Retain existing source addresses as authored/imported text; canonical geographic
   identity comes from SaanSeoi membership.

7. Present any UI scope decision before changing it: retain a hood-only
   “Neighbourhoods” selector, or expose an all-category “Divisions” selector with
   class indicators and display-level ordering. Recommend based on actual current facets. Explain
   benefits for consistent localized labels, disambiguated names, geographic
   filtering, analytics and reusable dashboard filters without implementing
   speculative product features.

8. Update operations and architecture documentation with actual decisions and
   verification. Use existing issue tracking where applicable; do not create a
   second Breadline progress ledger. Split implementation into reviewable commits
   after coordinating with the context-refactor thread.

## Refresh invariants

The monthly pipeline should update names/codes and other non-membership metadata
without unnecessary geocoding. Membership-affecting changes include hierarchy and
classification, not only polygon coordinates. Process the changed ID and
transitive dependent descendants from both releases. New/expanded geometry must
scan newly covered features, including divisions never previously mirrored.

Preserve alternative branches, candidates and ambiguity. Do not select a branch
by array order, infer containment from a display point, or treat missing polygons
as empty territory. Use authoritative membershipGeometry, not label geometry.
Level 0 membership remains relevant; numeric level is not a hierarchy guarantee. Parent/child counts overlap and must not be summed as distinct totals.

Definition references include release identity and definitionHash with record
and optional geometry URLs. Historical content can be unavailable; never silently
substitute the current definition. Verify checkpoint advancement only after all
comparison pages and feature jobs finish. Coordinate edits must supersede stale
jobs and clear obsolete membership.

## Verification and acceptance

Implementation verification on 17 October: Worker compilation, production build
and 135 focused tests across eleven files pass. Migration 0088 preserves all 1,828
feature contributions in a disposable populated database copy. Chromium verifies
shared filter/Omnibar search, highest-three previews, lazy geometry loading,
selected/hovered fill and outline, style replacement, light/dark presentation and
public/admin division-state isolation. External basemap tiles returned HTTP 401
at the review origin; this does not establish background-tile availability.
Repository-wide checking remains non-clean (966 errors and 21 warnings).

The shared database was not migrated while its October refresh remained active.
Apply 0088 with the refresh writer stopped and restart the matching application
and Worker together. See the operations guide for evidence and environment limits.

Run the focused checks appropriate to each change:

- bun run check:division-refresh
- bunx vitest run src/tests/division-refresh.test.ts src/tests/neighbourhoods.test.ts
  src/tests/feature-query.services.test.ts src/tests/feature-query.test.ts
  src/tests/feature-query-integration.test.ts
- Context/resource lifecycle tests from the completed context refactor, including
  resource-collection-reactivity.test.ts.
- Production build and comparison against the existing noisy type-check baseline.

Add coverage for current upstream selector names and response literals; optional
codes; same-name/different-ID divisions; category-scoped code references; code
changes preserving ID-based selection; both metadata write paths; locale changes;
parent/child distinct counts; ambiguous and landform memberships; and month rollover,
cursor resumption, metadata-only updates and expanded coverage.

Verify public/admin isolation and initial loading in the browser. Report fixture,
local authenticated UI, actual database state and deployed Worker evidence
separately. Existing unit tests do not establish a running production schedule.

Ask before product-policy decisions such as persisted URL compatibility, scope of
the selector, or broad catalogue mirroring. Do not deploy, change remote schedules,
run production backfills, or perform destructive migrations based solely on this
handoff. Prepare concrete changes and verification first. No credentials or raw
personal-data exports belong in fixtures, documentation or issue comments.
