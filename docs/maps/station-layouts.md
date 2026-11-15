# Station layouts

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
