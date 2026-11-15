# Station layouts

## Current storage architecture (15 November 2026)

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

### Map connection editing and verification

The premises map admin uses a floor-plan connection mode. Facilities distinguish linked,
unlinked, selected and available endpoints; candidates must have the same category, be
on another floor and not already form a stored pair. Multiple links per facility remain
possible. Select a facility to disable or re-enable its links, set direction, or
navigate to the other endpoint. Zoom and scrolling support detailed floor plans.

Publishing verifies all enabled links as `editor-verified`. Unknown directions remain
display-only. The server writes and reads back the new immutable R2 bundle before
atomically updating the draft/public pointers and audit receipts; the publication
receipt records the verifying actor and time. Disabled links remain disabled.
Publication never modifies the previous release.

The eight migration objects were uploaded to
`r2-tijpdata:hype-assets-raw-dev/premises-maps/` and verified by downloading and
comparing them: eight matches, zero differences. This upload does not deploy the
application or migrate the remote database.
