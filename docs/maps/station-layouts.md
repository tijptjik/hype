# Station layouts

## Current storage architecture (15 November 2026)

### Upstream label corrections

Migration `0257_premises_map_correction.sql` adds `premisesMapCorrection` for current
text-field corrections. Each row is keyed by map, source dataset, source layer, stable
source entity ID and field. Use the publisher's `level_id` or `unit_id`, not a display
name or GeoJSON row number. Separate locale fields have separate rows.

The row stores the original value (nullable when absent), corrected value, source
snapshot hash, reason and `authorUserId` referencing `user.id`. The hash identifies the
upstream snapshot used to make the correction, not the corrected release. Editing a
correction replaces its current values and author user ID. There are no evidence links,
review states or correction revision records.

The super-admin map editor saves level-label corrections and rebuilds a draft from
retained upstream source. Publication serves a complete corrected immutable bundle; page
loads do not consult the correction table or patch labels. The source import path and
`refreshPremisesMapSource` replay exact-identity corrections before saving a new draft.
Level labels are also materialized onto denormalized child records.

Raw source bundles remain in private R2 by hash. Missing identities, changed source
values, unavailable baselines or changed geometry create deduplicated `systemTask` rows
and prevent the affected draft from publishing. Geometry comparison currently flags any
coordinate change conservatively. A matching upstream label with unchanged geometry
creates a resolved (accepted/reviewed) system task. Correction rows retain only their
current values; task review does not introduce correction revision history.

System issues appear in the existing Tasks list and count only for super admins.
Resource selects Feature, Location, Premises map or System tasks. System-only views
ignore Feature type, action and hierarchy filters, keeping Result and Reviewed.
Reviewing an issue records the reviewer user ID and result; it does not silently change
corrections or publish a map. Edit or remove the correction in the map editor to rebuild
a publishable draft. Apply migration `0258_system_task.sql` alongside
`0257_premises_map_correction.sql` before enabling these readers.

### Release storage

Runtime map content now comes from versioned **private R2** objects, with database
publication pointers. The snapshot paths described below are historical collection
notes: `static/indoor` is no longer an application data source. Preserved raw snapshots
are in ignored `.research/indoor/`; the migration input and backups are in
`.research/premises-map-migration/`. Real-source integration tests require that external
archive; synthetic navigation and release-contract tests do not.

- `premisesMap` stores discovery metadata, an outdoor footprint optimization, and
  separate optimistic draft/publication pointers. Existing `locationPremisesMap` links
  it to the canonical premises Location.
- R2 keys are `premises-maps/{mapId}/releases/{sha256}.json`. A schema-v1 bundle
  contains all six GeoJSON layers, explicit connections, source attribution,
  official-document links and embedded schematic imagery. The hash covers the exact
  stored bytes.
- `premisesMapDraftRevision` and `premisesMapPublication` preserve author/version
  receipts. Publishing first validates an R2 readback, then atomically switches the
  database pointer and records publication. Failed or stale writes cannot replace the
  active release.
- `/api/premises-maps/{id}` is `no-store`; published hash URLs are immutable. Public
  reads require a publication receipt, so draft hashes do not grant access. Older
  publications remain readable for rollback. The client checks for new releases every
  minute while visible and refreshes geometry/occupancy when returning to the tab;
  flights defer checks.
- The storage adapter uses the environment's **original/private asset bucket**, not its
  public image bucket. Development is `ASSET_RAW_DEV` (`hype-assets-raw-dev`); preview
  and production use their respective existing bindings. Local simulation uses local R2.
- `premisesMapUnit` binds each source polygon ID to a stable canonical physical
  Location. Current public occupancy resolves the establishment and its curated brand;
  approved catalogue artwork supplies the logo. Geometry never embeds live brand
  presentation. Missing or conflicting occupancy/brand evidence produces no invented
  logo.
- `/admin/premises-maps` is a super-admin connection editor: save draft, publish saved
  draft, discard unsaved edits, or restore a previous publication as a draft. Unknown
  direction remains display-only. Publishing verifies every enabled connection. Imported
  reviewed-layout evidence retains its source URL. Polygon edits can use the same
  full-bundle draft command; a graphical polygon editor is not included.

Apply migrations `0255_premises_map_releases.sql` and
`0256_premises_map_draft_history.sql` before deploying these readers. The local-only
importer accepts an external index containing `id`, `code`, `name`, `nameZh`, `kind`,
`sourceDirectory` and `bundle` for each map:

```sh
dev-check bun scripts/indoor/import-map-releases.ts /path/to/index.json
# After reviewing the plan:
dev-check bun scripts/indoor/import-map-releases.ts /path/to/index.json --apply
```

The importer never infers occupancy. It binds exact canonical source keys only and
preserves already published maps. `--refresh-import` can update only maps still owned by
that importer; edited maps require the editor. R2 garbage collection is deliberately
absent: publication and draft history retain their objects.

Local cutover: five maps and eight distinct retained bundles were copied to private
local R2 and verified through HTTP with SHA-256 readback. There are 542 canonical unit
bindings across the three MTR maps. Current Kennedy Town occupancy is absent in the
local head table; Hysan Place and TKO Plaza lack canonical unit bindings. Completing
those relationships is separate evidence-backed catalogue work. Production has not been
migrated or deployed. The approved remote development-bucket upload completed; download
comparison confirmed eight matching files and zero differences.

Validation: scoped formatting/lint and local HTTP/module checks were performed. Managed
unit tests, storage integration tests, full typecheck and Chrome interaction checks
could not start because Li had no reachable SSH address. HTTP reads are not browser
interaction proof.

The public Hype map opens Kennedy Town from the regular menu. The station panel occupies
the Maps panel slot, and the omnibar stays mounted in its usual position. General map
restores the retained outdoor renderer and camera. Station state belongs to the public
`AppCtx`; no administrator or catalogue context owns it.

The menu offers the exploded view, detailed floor plan, fit, general map and existing
theme settings. The station panel supplies the level selector, directory and source
shop/facility details. Floor labels in the exploded view are keyboard operable.

## Source snapshot

`static/indoor/kennedy-town/manifest.json` records source URLs, counts and SHA-256
hashes. The Lands Department snapshot contains 377 features: one venue, six levels, 88
units, 175 openings, 97 amenities and 10 occupant records. Reference MTR layout and shop
PDFs are retained in the ignored research archive. The viewer checks layer counts and
venue identity before displaying the snapshot.

Occupants join units by source `unit_id`. Shop records are display data and do not
create or link Hype Features, Locations or catalogue identities. The unnamed-code
7-Eleven unit and neighbouring KET 8 (Yamazaki Bakery) are distinct. KET 9 retains both
source occupant records without inventing a subdivision.

## Geometry and appearance

The SVG renderer uses a local metre projection. Its single-floor view preserves the plan
geometry; the exploded view adds schematic vertical separation between ordinal groups,
keeping ground entrances together. Neither rendering mutates source geometry. Floor
selection opens the corresponding detailed plan. Pan, wheel zoom and keyboard zoom
operate within the viewer; Fit layout restores the floor extent.

Stair treads use perpendicular scanlines clipped against the rotated source perimeter,
including holes. Escalators use clipped rails and landing bars. These are schematic
facility drawings, not measurements of individual steps or operating direction.

7-Eleven artwork derives from `static/brands/breadline/7eleven.svg`, with the circular
badge removed. The whole source shop polygon is white; the undistorted logo fits an
interior rectangle and lies in the floor plane. Source occupant points do not position
logos. Other shop boundaries and kiosk codes remain visible.

Live `--theme-*` tokens supply canvas, panel, border, text and facility colours. Paid
areas use the info tone and unpaid areas the warning tone, mixed with the panel surface.
Connector details use the tertiary tone. White branded units preserve logo contrast
across themes.

## Connections and limits

Paid/unpaid classification comes from explicit source `section_name_en` values. Optional
dashed links are possible connections inferred from matching categories, access areas
and mutually best overlapping footprints on different levels. The source supplies no
confirmed connector correlations or escalator operating directions. These links do not
form a routing graph and do not establish step-free access.

This is a station-map prototype. Occupants and hours are not live; the English control
copy and schematic floor stack need product review before generalising to other stations
or malls. Source terms: <https://api.portal.hkmapservice.gov.hk/disclaimer>.

## Verification

Run focused geometry checks through
`dev-remote test bun x vitest run src/tests/indoor.test.ts`. Run the application
interaction check using the managed local admin persona server and
`dev-remote --port 4173 chrome env DEV_RUNNER_TEST_DIR=tests/e2e/station bun x playwright test station.spec.mjs --config .dotjik-runner/playwright.config.mjs`.
The environment setting belongs inside the remote command so it reaches Li. Full Hype
Svelte validation uses `dev-remote typecheck`.

## Premises URLs and station directory

`/premises/{station-name}-mtr` opens a station;
`/premises/{station-name}-mtr/places/{source-id}` opens a particular unit or amenity on
its floor. Card Copy link and Share use this address. Source IDs preserve identity
independently of shop names or kiosk codes. Every source unit is selectable, including
unoccupied rooms. These URLs do not create or imply a match to a Hype Location record.

The existing taxonomy defines `premises` as a class of **built** Location, labelled
“Premises / site”, separate from the `address` kind. The namespace can accommodate
shopping malls, transit sites and managed park premises; natural geographic features
should keep their geographic classification.

Outdoor station labels use the persistent `[longitude, latitude]` coordinate in
`src/lib/routing/mtr-catalog.json`, keyed by station code. The label source emits one
point per station independently of the footprint polygons; multipart footprints and tile
boundaries must not introduce additional label anchors. Update the catalogue coordinate
to reposition a station label. Footprints remain the outline and hit area.

The omnibar searches the 98 MTR stations by English name, Chinese name or station code.
The roster matches all 98 codes on the official MTR system-map index. This coverage is
the indexed heavy-rail and Airport Express stations, not Light Rail stops or a separate
High Speed Rail station catalogue. Kennedy Town and Hong Kong have interactive geometry;
other stations show links to their available official PDF maps.

Run `python3 scripts/indoor/download-mtr.py` to collect shops (Chinese URL), station
layouts (English URL) and location maps (Chinese URL). Four concurrent requests use
bounded retries and validate the PDF signature. `static/indoor/mtr/manifest.json`
records source URLs, retrieval time, HTTP status, sizes and SHA-256 hashes. The official
index HTML is retained alongside it. The initial collection contains 292 valid PDFs:
Airport and Racecourse shop URLs returned non-PDF content. PDFs are reference documents;
this collector does not turn their contents into verified shop identities or floor
geometry.

## Research storage and R2 sync

Reference PDFs live outside Git at
`.research/premises/transit/mtr/maps/{type}/{stationCode}.pdf`, where type is `shops`,
`layout` or `location` and the station code is uppercase. The original index and
retrieval manifest live beside these folders. Additional Kennedy Town references are
under `.research/premises/transit/mtr/references/kennedy-town/`. The public application
retains its small map index and uses the official MTR URLs; research documents are not
shipped as application assets. Runtime GeoJSON fixtures remain in
`static/indoor/kennedy-town`.

`bash scripts/research/sync.sh` synchronises `.research` with the private R2 bucket
`r2-tijpdata:hype-research`, using the desktop's existing rclone configuration. It
restores files missing on either side, transfers one-sided edits, and retains previous
content under `.sync/versions/` before overwriting it. Concurrent changes are reported
as conflicts and neither copy is overwritten. Deletions do not propagate. The local
`.sync/state.json` records the last common checksums; sync verifies R2 hashes before
advancing that baseline. Keep credentials in the existing rclone configuration, never in
the repository.

The installed `hype-research-sync.timer` runs every fifteen minutes, with a small random
delay and catch-up after downtime. Unit sources are in `scripts/research/systemd`.
Inspect with `systemctl --user status hype-research-sync.timer` and
`journalctl --user -u hype-research-sync.service`; run the script directly for a manual
sync. The initial 297-file backup was additionally verified with
`rclone check --download`.

## Indoor camera and connection evidence

The SVG viewer has its own camera: drag to pan, scroll/pinch to zoom, Shift-drag or
right-drag to rotate and tilt, or use the View controls sliders. Touch rotation uses
both fingers. Arrow keys rotate/tilt the focused viewer. Default schematic floor spacing
is 24 metres rather than a representation of physical heights; users can adjust it from
10 to 65. Individual floor plans also support tilt.

Supported solid lift links comprise: four pairs with matching source lift codes, plus
the Exit B mezzanine-to-ground continuation shown in MTR's official layout. Its ground
record has no L06 code, so this pair has explicit reviewed-layout evidence in the
connection model. Endpoints are drawn above the floors to prevent occlusion from making
links appear attached to nearby shops.

Exit C also has three explicit reviewed-layout links: its two parallel escalators and
adjacent stair connect the ground landing to the unpaid concourse. MTR's
[official layout](https://www.mtr.com.hk/archive/en/services/layouts/ket.pdf), reviewed
2026-11-15, confirms the bank; source lane ordering identifies the corresponding
polygons. Their footprints are horizontally separated, so overlap matching misses them.
The stair is available to the routing adapter through source pedestrian openings;
escalators remain display-only because operating direction is not established. The
unmatched Exit C L01 lift is not assigned an invented destination.

Bounding-box candidates are shown by default, per the user's preference, and can be
hidden through Show unverified connections. They use dashed strokes. These do not
establish stairs/escalator destinations or operating direction. The complete pedestrian
connection graph is still unverified; missing stair links must not be interpreted as
unavailable access.

## Cross-repository handoff

See [the indoor handoff guide](indoor-handoff.md) for current ownership, source IDs,
archive recovery, controls and remaining source-validation work. The same guide is
available in SaanSeoi at `docs/datasets/sources/hkgov-landsd/indoor-handoff.md`.

## Hong Kong station

`/premises/hong-kong-mtr` uses Lands Department venue
`3c17605d-df03-4b09-90f5-bbca8cf1294d`. The raw snapshot in `static/indoor/hong-kong/`
contains 953 features: one venue, nine levels, 249 units, 379 openings, 232 amenities
and 83 occupant records. Its manifest records retrieval time, source URLs, counts, byte
sizes and SHA-256 hashes. Retrieval is not a survey date.

The snapshot registry drives both indoor loading and outdoor discovery. Hong Kong's
source footprint opens its own station route. The default detailed level is the Tung
Chung Line concourse. Combined kiosk names such as `HOK 3a & 3b` and `HOK 43-44` remain
on their original source polygons; occupant names do not create new identities. All nine
source level IDs remain distinct, including the ground-level group.

The existing Kennedy Town route-preview experiment is confined to that station. Hong
Kong connections retain the shared evidence rules and dashed candidate styling; no
reviewed Hong Kong pedestrian or step-free network is asserted.

Reproduce a new snapshot with
`python3 scripts/indoor/download-geometry.py VENUE_ID DESTINATION`. The collector
refuses an existing destination, incomplete responses, responses reaching the
5,000-record cap, or mismatched venue IDs, and publishes only after all six raw layers
validate. Official Hong Kong PDFs remain in the research archive and are linked from
MTR's originals.

Focused coverage: `src/tests/indoor-hong-kong.test.ts` validates source hashes, counts,
references and combined kiosk identities. `tests/e2e/station/hong-kong.spec.mjs` checks
the exploded view, exact-place selection and copying, reload/history, mobile layout and
outdoor footprint entry using managed Chrome on Li.

Verification on 15 November 2026: 16 indoor unit/regression tests passed on Li. The Hong
Kong indoor interaction scenario passed, and the outdoor footprint click passed on rerun
after correcting the test's assumption that the map panel was open. Desktop and mobile
screenshots were inspected. Scoped Biome checks passed. Basemap tile health is separate
from successful footprint entry.

Full Svelte validation completed with the documented 31 errors and four warnings in 13
unrelated files, with no indoor diagnostics. The rerun used a 5 GiB Node heap within the
6 GiB lane after the default heap exhausted.

## Reusable floor and navigation modules

See [Indoor architecture](indoor-architecture.md) for the floor loader, routing model,
barrier rules, unpaid-first policy and reusable drawing/planner components. Both
stations now expose the same data-driven route planner. This supersedes the earlier
Kennedy Town-only UI restriction, while preserving its evidence boundaries: no new Hong
Kong inter-floor or fare-gate connections have been inferred. Incomplete routes produce
an explicit unavailable result.

## Hysan Place and TKO Plaza (15 November 2026)

`/premises/hysan-place` loads the LandsD building API snapshot for venue
`5bb79500-645d-4089-b5bc-5a02cfeed057`: 48 level records, 2,525 units, 2,354 openings,
2,235 amenities and 138 occupants. The source includes the podium and office tower;
level records are not a count of retail floors. The initial view is the ground-floor
plan. All source levels remain available in the selector and exploded view. Preserve
source names, including generic Shop records; this is not a verified current tenant
roster. Raw layers and hashes live in `static/indoor/hysan-place`.

Collection uses `scripts/indoor/download-geometry.py VENUE_ID DESTINATION --building`.
The building endpoint omits the MTR layer prefix. There is no reviewed walking network
for this venue. The same source-unit URLs, directory and outdoor footprint are used.

`/premises/tko-plaza` offers the mall's official floor directory. The complete LandsD
building venue response checked on 15 November contained 689 records and no TKO Plaza,
Tseung Kwan O Plaza, 將軍澳廣場 or matching Tong Tak Street address. Do not substitute
PopCorn or an MTR station, manufacture geometry, or advertise an interactive footprint.
Both premises are searchable in Stations & malls, retaining separate public slugs.

Official sources:

- <https://tools.csdi.gov.hk/csdi-webpage/apidoc/3d-indoor-map-api>
- <https://www.tkoplaza.com.hk/en/find-us?submenu=floor>

Focused validation: `src/tests/indoor-malls.test.ts` checks complete source hashes,
counts, occupant joins, ground-level selection and identity separation.
`tests/e2e/station/malls.spec.mjs` exercises floors, exact-place reload, exploded view,
mobile overflow, official-directory fallback and Kennedy Town regression on Li.

Validation evidence: Li job `job-rxJlSwjcxh` passed 14 focused tests; Chrome job
`job-W76ohA2P60` passed the complete mall interaction scenario, including the local
admin identity assertion. Desktop, exploded and mobile screenshots are in that job's
artifacts. An earlier Chrome attempt timed out during TKO app startup; the rerun uses an
explicit readiness allowance and verifies the mobile-accessible directory link.

Full Svelte validation (`job-HDEHRKAMio`, 5 GiB Node heap within the 6 GiB lane)
completed with 32 errors and four warnings in 14 other files; none were in the indoor
implementation or mall tests. The first attempt exhausted Node's default heap and was
retried after exit. Full repository validation is therefore not clean.

## TKO Plaza schematic conversion

The official directory does expose HTML image-map hotspots. The two floor fragments at
`https://www.tkoplaza.com.hk/en/floor_level` (POST `level=1` / `level=2`) include
location IDs, rectangles/polygons, tenant IDs and shop codes; the `/hk/` equivalents
supply Chinese labels. `scripts/indoor/convert-tko.py` preserves these source records,
archives responses, validates bilingual joins and converts them into the same six indoor
layer containers. Stable UUIDs derive from source location IDs, independently of tenant
names. The original JPEG artwork remains unchanged.

The vector conversion has two traced levels, 103 source hotspot units, 22 neutral
unclassified polygons traced from the plan's grey regions, 91 named occupants and 25
selectable facility anchors (toilets, accessible toilets, baby changing, information,
lifts and escalators). Twelve mapped units have no named tenant. Two source listings
have empty coordinates: L1-130 is a duplicate of an existing mapped unit; L1-006a
remains unplaced. Doorway data is absent.

`scripts/indoor/tko-annotations.json` records reviewed floor outlines and symbol anchors
in the source image frame. The converter traces grey regions with OpenCV, NumPy and
Pillow. Shapely repairs six self-intersecting source hotspots into valid
polygon/multipolygon geometry; `source_coords` retains the original vertices and
`geometry_repaired` identifies these repairs. Grey regions are explicitly unclassified:
colour does not establish access restrictions. Facility symbols are points, not surveyed
room footprints or confirmed inter-floor connections.

The shared Hysan renderer draws vectors and unit codes by default. Options → Original
plan opacity overlays the unchanged JPEG from 0–100%, above vectors with pointer events
disabled. The overlay shares each floor's projection, including rotation, tilt and
exploded view.

`coordinateSpace: image-pixels` is mandatory for this snapshot and each layer.
Coordinates retain the website's displayed 920-pixel image frame, including its
positive-down Y axis; the higher-resolution JPEG is scaled to exactly that frame. These
are GeoJSON-shaped local-coordinate collections, **not RFC 7946 geographic GeoJSON**.
Floor and venue outlines are labelled reviewed artwork traces, not surveyed boundaries.
The renderer projects them schematically; geographic map footprints and routing reject
this coordinate mode. No real heights, distances, accessibility or connections are
inferred. TKO Plaza attribution replaces LandsD attribution for this source.

Source archive: `.research/premises/malls/tko-plaza/2026-11-15`. Application snapshot:
`static/indoor/tko-plaza`. The manifest records source URLs, POST bodies, input hashes,
converted-layer hashes and unmapped entries.

TKO browser verification passed on Li (`job-nYm14MrXq2`): original artwork decoded,
MILKSHA hotspot selected the matching unit, exact-place refresh restored it, both levels
and exploded view worked, and the mobile plan had no horizontal overflow. Screenshots
are stored with the job artifacts. Full Svelte validation `job-ZVuH9uSijY` retained 31
errors and four warnings outside the indoor code.

The final TKO data/projection tests passed in `job-z6q0Xm27B7`. The preceding combined
run passed the other 27 indoor/navigation tests; its TKO label assertion caught blank
source tenant placeholders, which the converter now keeps as unoccupied source units
rather than manufacturing occupant records.

Vector update validation (15 November): 15 indoor tests passed in `job-B7HWg3nBLR`; all
125 unit geometries and both traced level outlines pass Shapely validity checks. Chrome
`job-HJQCvoC3bT` passed facility selection, vector-default rendering, 0/50/100% overlay
controls, shop links, floor switching and mobile layout. Full Svelte check
`job-hTyMEAye5X` reports the same 31 errors and four warnings in the existing broader
checkout.

Final repaired snapshot tests passed in `job-u7In8VXRzS`. Chrome rerun `job-9AAZkrVmrC`
also passed the compact unit labels and overlay rotation check. Final Chrome evidence
for repaired multi-part unit labels: `job-HxP8kafVnI` passed. The preceding attempt
(`job-m0YQ4VSysp`) hit an HTTP 500 at initial navigation; the local endpoint recovered
and the retry completed all assertions.

TKO minimum-width correction: `scripts/indoor/tko_geometry.py` uses the narrow stepped
passage beside L1-004 as its reference: 10 displayed pixels (about 20 pixels in the
original JPEG). Vector morphological closing collapses white outline strips below that
width, including irregular steps and junctions. Passages at the threshold survive. The
added area is partitioned by nearest source-boundary samples into shared unit
boundaries. It retains `source_coords` for comparison;
`boundary_correction: minimum-corridor-width` records derived geometry. This replaces
the earlier four-pixel parallel-edge-only correction, which left outline notches.

Regression checks cover 4/8/9.9-pixel gaps, retained 10/12-pixel passages, stepped
outlines, multi-unit junctions, valid exports and open points in both legs of the
reference passage. The width is schematic, not a physical measurement in metres.

The converter requires OpenCV, NumPy, Pillow and Shapely 2.1+ with GEOS 3.12+ (for
ordered Voronoi cells). Boundary allocation samples at half a display pixel; source
polygon rings are not rasterized. Numerical pinholes below 1e-8 square pixels are
removed before export. The current correction adjusts regions across two floors while
retaining all 125 valid polygons and the 25 facility anchors. Minimum-width
verification: five Python geometry tests and three TKO snapshot tests passed
(`job-alKa9mNcCT`). Final Chrome check `job-rWymAftomW` passed both floors, facilities,
exact-place links, overlay opacity/rotation and mobile layout; screenshots were
reviewed. Earlier attempts encountered an initial HTTP 500 and a preview-server listener
interruption, respectively. The final run waited about 29 minutes for the shared
validation queue before passing.

Artifact correction: the minimum-width result now becomes a noded, non-overlapping
planar coverage before shared-edge simplification at a two-pixel tolerance. This removes
tiny tabs without independently changing adjacent boundaries. Near-perimeter outline
strips are included in gap closing, using the floor outline as the outside boundary.
Source pixel coordinates and unit IDs remain intact as provenance; derived boundaries
can move during cleanup, so preservation of every original interior is no longer
claimed.

Reviewed shared-coordinate annotations resolve the L1-132–141 island, the southwest
service area and units 130/131/126–129/112–125. Unit 142 is a reviewed rectangle with
its neighbouring grey area adjusted to the same edge. The combined source location for
133–135 remains one polygon and one selectable shop, with the service-area notch
retained and internal source slits removed. The official hover groupings corroborate
this identity grouping; they are not separate physical corridor geometry. Artifact
cleanup verification: six Python geometry regressions passed, including the reported
island, rectangular 142, and shared 130/service-area edge. TKO data tests passed on Li
(`job-0oLYyhtDyo`). Chrome `job-Cbt9U7T3qk` passed combined 133–135 selection, both
floors, opacity/rotation, exact-place reload and mobile layout. The combined-unit
close-up was visually reviewed. An earlier test timed out clicking a faraway unit after
selection zoomed the camera; the test now resets the view first.

Unit text uses `src/lib/indoor/labels.ts`: an area-weighted polygon centroid with holes
subtracted, independent of ring winding. Each disconnected polygon gets its own label,
so unit 005 no longer labels the corridor between its components. A centroid outside a
concave polygon uses an interior scanline fallback. The full text rectangle is fitted
within the polygon; when a long label would be substantially shrunk at the centroid
(such as 133–135 beside its service-area notch), a nearby interior span is used instead.
This changes label anchors only, not camera/navigation centres or source geometry. Label
verification: seven focused tests passed on Li (`job-JgFqrKRquO`). Chrome
`job-fcAaT3cLHV` verified that all four corners of the rendered text boxes for 004, both
005 components, 007 and 133–135 lie inside their unit polygons, and passed the existing
two-floor/overlay/selection/mobile checks. Full-floor and combined-shop screenshots were
reviewed. The initial centroid-only browser check caught the long 133–135 label crossing
the notch; full-rectangle fitting resolves that case.

Facility markers now have a 28px diameter and 14px glyphs at the normal text scale
(previously 14px/8px). Nearby point markers are spaced apart with leaders back to their
source locations, so adjacent toilet symbols remain selectable and readable.

SaanSeoi tenant evidence checked against the hosted `/places/v0.1/search` and full place
endpoints on 15 November 2026 (English and Chinese mall-name queries):

| Establishment             | Source address evidence                                     | SaanSeoi Place ID                       |
| ------------------------- | ----------------------------------------------------------- | --------------------------------------- |
| Circle K                  | 1/F, 1-007                                                  | ss-39a8bbac-59f7-5da4-95ba-3a160fc08d06 |
| Oliver's Super Sandwiches | 1/F, 1-003                                                  | ss-38120877-b998-5a80-84dd-4cf4e4961cb7 |
| Chateraise                | Shop 141; mall directory confirms L1-141                    | ss-540f2dbf-9abc-5753-b3d1-a54dbd1bb880 |
| TamJai Yunnan Mixian      | 1/F, 96–100; directory calls this Tam's Shop / 譚仔雲南米線 | ss-a7028d56-4146-5909-958b-58d6c7d25ad8 |

All four match the mall directory, but their full records have null `address2dId`,
`address3dId` and `address3dUnitId`: these are freeform-address matches, not existing
structured occupancy relationships. Their `lastSeenMonth` is September 2026 and their
resource release is `7cdbd963-309e-5967-8f76-61415806d895`. No records were linked or
modified. Search also returned Tei Mou Koon, Saizeriya and Cherry On Top; their unit
mapping needs separate review. Chicken Factory's source says L2-070–072, while the mall
directory assigns only L2-072 to it and 070–071 to MOMOKU, so do not auto-match that
range. The local endpoint returned 502; hosted reads succeeded with an explicit Hype
application user-agent and the existing configured API credential. Larger-marker
verification passed in managed Chrome (`job-Y1A9H8gsr0`), including facility selection,
shop hit targets, both floors, overlay/rotation and mobile layout. Both floor
screenshots were reviewed for readable symbols and separation of adjacent restrooms. The
first run caught a removed shop hit-target loop during the marker refactor; restoring
that loop resolved the interaction regression before delivery.

### TKO tenant catalogue experiment (15 November 2026)

The local experiment imports six publication-pinned SaanSeoi Locations and six catalogue
Brands: Circle K (L1-007), Oliver’s Super Sandwiches (L1-003), Chateraise (L1-141),
TamJai (L1-096–100), Tei Mou Koon (L1-036), and Chicken Factory (L2-072).
`scripts/catalogue/import-tko-local.ts` previews by default; `--apply` uses only
`wrangler.local.toml` with remote bindings disabled. Source documents, downloaded
artwork, hashes and import receipts are retained in `.research/catalogue/tko/`.

Indoor addresses are separate community corrections with SaanSeoi Organisation
provenance and the local administrator as actor. Chicken Factory's exact bilingual
L2-072 correction is user-supplied and corroborated by the mall's detail page. These
corrections do not rewrite upstream SaanSeoi snapshots or create surveyed unit occupancy
links. The reviewed map-to-Location/Brand association is in
`src/lib/indoor/tko-brands.json`.

All six marks use opaque backgrounds. Sources are the mall (Circle K), Oliver's linked
official social profile, Chateraise and TamJai's websites, the Hong Kong Brand
Development Council (Chicken Factory), and Hang Lung's tenant directory (Tei Mou Koon).
Food photographs were rejected. The map uses the same immutable local catalogue asset
URLs. Pixel-map logos fit an interior rectangle before floor rotation; they never pass
through the geographic metres conversion.

Facility markers and the map-symbol legend share vector pictograms. B formerly meant
baby changing; diagonal/vertical arrows formerly meant escalator/lift, not travel
direction. Labels wrap ranges, collapse redundant intermediate range codes, and retain a
10 CSS-pixel minimum. The legend is expanded on desktop and collapsible on mobile.
Northeast diagonals and southeast orthogonal blocks have reviewed shared coordinates.
Blank duplicate website hotspots stay in the source snapshot but no longer cover a named
shop in the rendered layer.

Validation for this experiment: seven managed Python geometry tests pass; scoped Biome
checks pass; all six local logo endpoints return HTTP 200 image/png; database reads
confirm all six Brand links, bilingual address corrections and SaanSeoi Organisation
attribution. Import replay retains source and correction identities. Initial Chrome run
`job-OpW8R5GAc4` revealed the duplicate blank hotspot and a logo count expectation made
before the final two marks were available. Those were corrected. Final Chrome
`job-wg8muGT8x5` and focused Vitest `job-NkP2SjIK0b` lost SSH connectivity to Li while
queued (exit 255); final browser/test results are not confirmed. No deployment was
performed.

## Kowloon Tong station

`/premises/kowloon-tong-mtr` uses Lands Department venue
`93187202-7a40-4906-b7e4-1e56c37562db`. The complete snapshot preserves 12 levels, 205
units, 434 openings, 257 amenities and 40 occupant records. The existing station viewer
supplies floor selection, exploded views, directory search and stable shop URLs. KOT
kiosk codes, combined units and code-only occupants retain their source identities.

[The complete shop index](kowloon-tong-shops.md) records every source occupant and
provides map links. Six separate 7-Elevens occupy KOT2, KOT113, KOT121, KOT122, KOT203
and KOT206. Local onboarding reuses six existing establishments, adds reviewed occupancy
relationships and imports all 205 physical units under the existing station premises. No
Feature is deleted or relinked. The G1 Feature/KOT113 mismatch remains for review.

The scoped plan is generated by `scripts/indoor/plan-mtr-onboarding.py` and restricted
to `mtr-station:KOT` before applying. Reviewed local identities and revision guards are
in `scripts/indoor/kowloon-tong-occupancies.json`. Apply through `apply-mtr-drafts.ts`
after an offline rehearsal; retain the local backup and do not infer production
authorization.

### Map connection editing and verification

The premises map admin has Floor connections, Level labels, Saved corrections and
Published history tabs. Connections use two equal-size floor plans with a shared XY
projection and camera. Wheel zoom and drag pan on either plan update both; scrolling
outside the plans scrolls the page. Each pane has its own floor dropdown. Stairs,
escalators, ramps and lifts have distinct icons.

Selecting the left floor suggests another level whose geometry covers the current map
coordinate. Selecting a left facility refines that suggestion using its interior anchor:
existing enabled destinations rank first, then matching facility footprints, then
covering floor geometry, with nearer elevations preferred. The right dropdown can
override the suggestion. A suggestion never selects an endpoint or creates a connection.
Source geometry is tested in its own coordinate space, including holes. The current
Kennedy Town source does not establish escalator operating direction; floor elevation
and display thickness are not operating-direction evidence.

Facilities distinguish linked, unlinked, selected and available endpoints. Select a
polygon on each floor, choose travel direction, then explicitly connect them. Candidates
must have the same category and be on different floors; existing pairs can be inspected,
disabled or re-enabled without creating duplicates. Multiple links per facility remain
possible. Right-to-left travel stores the reversed endpoint order, and existing entrance
sides remain attached to their physical endpoint.

The editor header uses the map name and has no New or resource-search controls.
Connection saving does not ask for a reason; the optional API note defaults to
“Connection updated in map editor.” Existing attribution and concurrency fences remain.
The corrections tab compares upstream and overridden values. Published history can
compare immutable connection and level-label values with the preceding publication; it
does not claim to be a geometry or occupancy diff.

Publishing verifies all enabled links as `editor-verified`. Unknown directions remain
display-only. The server writes and reads back the new immutable R2 bundle before
atomically updating the draft/public pointers and audit receipts; the publication
receipt records the verifying actor and time. Disabled links remain disabled.
Publication never modifies the previous release.

The eight migration objects were uploaded to
`r2-tijpdata:hype-assets-raw-dev/premises-maps/` and verified by downloading and
comparing them: eight matches, zero differences. This upload does not deploy the
application or migrate the remote database.

Connection curations use the same `premisesMapCorrection` list as labels:
`sourceLayer=connection`, a stable unordered pair of source unit IDs, and
`field=connection`. Original and corrected values contain the connection JSON; new pairs
have a null original value. The snapshot hash, reason and authenticated user ID use the
existing columns. No new review status or correction history is added.

“Save connections” records the editor's current pairs, including previously draft-only
pairs, and builds a complete corrected draft. Omitted pairs become disabled curations so
an import cannot resurrect them. Unchanged saved values retain their author and reason
while their source baseline remains unchanged. Each endpoint can record an entrance side
as a polygon component and outer-edge index, selected through overlays on the plan.
Unknown sides stay unknown; the side where the connection meets the floor is independent
of allowed travel direction.

Refresh checks both source unit identities, geometry, categories, floor membership and
floor elevation/order against the retained baseline. A mismatch creates a system task
and blocks publication; it never transfers an entrance by proximity. Saved pairs and
entrance sides are materialized before publication. Public map reads do not query the
correction table. Entrance metadata is retained for subsequent routing work; this change
does not infer exact entrance coordinates or change the existing route planner.

The compact connection editor selects an entrance directly on the plan: hovering
previews the nearest outer polygon edge in yellow and clicking records it in blue.
Keyboard users can focus individual edge overlays. Dragging only pans the shared camera.
The centre direction button cycles both ways, left to right, right to left, then unknown
(display-only). New pairs start at both ways; existing pairs retain their recorded
direction. Direction changes preserve each physical entrance.
