# Indoor premises maps: Hype and SaanSeoi handoff

Updated 15 November 2026. The interactive application belongs in `/home/io/code/hype`,
on the shared `preview` checkout. Do not implement the product UI in SaanSeoi's basemap
preview. SaanSeoi owns source research/documentation; Hype owns the public premises
routes, station state, indoor renderer and omnibar integration. Preserve unrelated dirty
files in both repositories. No commit or deployment was requested.

## Start here

- Preview: <http://localhost:4173/premises/mtr-ket>.
- Exact place example:
  <http://localhost:4173/premises/mtr-ket/places/85dc0347-d11b-4c8c-9686-dc6697050317>.
- Hype implementation notes: `docs/maps/station-layouts.md`.
- SaanSeoi source notes: `docs/datasets/sources/hkgov-landsd/indoor.md`.
- Read the applicable AGENTS.md before editing. Use the existing managed admin preview
  server; `bun run dev:agent admin --port 4173` reuses it.

## Current product behaviour

The outdoor map displays Kennedy Town's actual LandsD venue polygon from zoom 16, with a
themed fill and dashed outline. Its indoor-map label appears from zoom 16.5. Clicking
the footprint opens the station route. It is not a bounding rectangle and must not
advertise interactive geometry for stations without a snapshot. The overlay restores
itself after MapLibre style changes and has a keyboard-accessible link.

The indoor SVG surface replaces the map surface; the station panel occupies the normal
Maps panel slot. The omnibar and normal menu remain mounted. The menu switches general
map, floor plan and exploded view. The directory supports all 88 source units and named
amenities. Copy link and Share preserve the source space ID, including on refresh and
browser history navigation. Source places are not automatically linked to Hype Features
or Locations.

`premises` is a **built Location class**, labelled Premises / site, not the address
kind. `/premises/mtr-{code}/places/{source-id}` is the current public namespace. Managed
mall/park sites can fit a future premises registry; natural geographic features should
not be silently reclassified.

All 98 stations on MTR's official system-map index are searchable by English name,
Traditional Chinese name or station code. Searching MTR exposes the expandable full
station list. This roster covers the indexed heavy-rail/Airport Express stations, not a
complete Light Rail or High Speed Rail catalogue. Kennedy Town and Hong Kong have
interactive geometry. Other stations open their available official PDF references.

## Routing preview and bread-run demo

Open Kennedy Town, then choose **Highlight route** or **Fly to 7-Eleven** in the compact
route controls. The default is Exit A ground level to KET 3 on the concourse. Expand
Route preview to choose another mapped entrance or unpaid-area shop. Playback takes 18
seconds; Stop, a map gesture, a camera option, floor selection or leaving the indoor
surface cancels it. Reduced-motion preference uses highlight mode. Clear restores the
default exploded view.

`src/lib/indoor/routing.ts` runs Dijkstra over a 0.75-metre grid in unpaid walkways,
lobbies, ramps, lifts and the selected shop. Segment sampling respects polygon holes;
pedestrian openings bridge survey seams within 1.1 metres. Shop/lift boundary crossings
require nearby opening evidence. Only matching-code/reviewed vertical links enter the
graph. Unverified display links, escalators with unknown directions and paid spaces are
excluded. No path means no route, never a straight-line fallback. Distance is
approximate and optimal only within this sampled graph; it is not a certified pedestrian
or step-free route. Door status, lift operation, clearance and complete connectivity
remain unverified. Extend this to arbitrary destination points through the same graph
contract, not by projecting a line through rooms.

`StationRouteControls.svelte` owns endpoint selection; `StationState` owns route and
playback state; `StationScene.svelte` projects the highlighted path and runs an
interruptible animation frame loop. The camera pans along the route while rotating and
zooming. Upon reaching the target floor, spacing grows and other floors/connections fade
until only that floor remains. The displayed route remains on arrival.

## Camera and rendering requirements

- Default camera is −115° bearing and 60° tilt; exploded separation is 25 schematic
  metres per ordinal group. This is not a claim about actual floor heights. Ground
  entrances stay in the same ordinal group.
- Drag pans; ordinary scroll and Ctrl-scroll zoom. Ctrl-drag or right-drag rotates and
  tilts; Alt-drag tilts. Alt-scroll rotates; Ctrl+Alt-scroll tilts. Shift-drag remains
  supported. Two-finger gestures combine centroid panning, pinch zoom and rotation.
- Hana-musubi artwork is enlarged and clipped to its shop polygon, with pink extending
  across the remaining footprint. Other brands retain their own backgrounds. Dark floors
  use brighter semantic paid/unpaid paints, stronger edges and a subtle canvas gradient.
- Sliders are confined to the collapsed Options menu for touch/accessibility use.
- Unconfirmed connections are **shown by default**, per the user's latest instruction.
  Solid connections use matching lift codes or explicit reviewed-layout evidence; dashed
  connections are geometric candidates, not verified routing.
- Connector portions that overlap rendered floor polygons use exactly 50% opacity. The
  SVG draws a normal segment masked outside floors and a half-opacity copy clipped
  inside them. Keep endpoint markers distinct from line opacity.
- Use actual projected vertices for bounds and floor-label anchors. Rotating a
  geographic bounding rectangle inflated extents and detached labels from floors.
- Shop artwork lies flat in the floor plane, centred within the polygon. Branded units
  have white backgrounds. Preserve a positive image-transform determinant.
- The supplied Hana-musubi symbol has a cleaned 1254 × 1254 PNG at
  `static/indoor/hana-musubi.png`, also backed up in research storage. It is a cleaned
  bitmap, not an official vector master. Its aspect ratio is 1:1; 7-Eleven uses 0.75.

## Code map in Hype

| Path                                                      | Responsibility                                                 |
| --------------------------------------------------------- | -------------------------------------------------------------- |
| `src/lib/indoor/model.ts`                                 | Raw layers, immutable identities, occupant joins, directory    |
| `src/lib/indoor/registry.ts`                              | Station search and public premises paths                       |
| `src/lib/indoor/station.svelte.ts`                        | Session, loading, routes, selection, camera settings           |
| `src/lib/indoor/scene.ts`                                 | Local-metre projection, bounds, label anchors, logo transforms |
| `src/lib/indoor/geometry.ts`                              | Oriented footprints and fitted artwork                         |
| `src/lib/indoor/spatial.ts`                               | Candidate connections, reviewed lift continuation, treads      |
| `src/lib/bits/patterns/station/`                          | SVG, panel, surface and collapsed options                      |
| `src/lib/bits/patterns/maps/StationFootprintLayer.svelte` | Outdoor source-footprint discovery                             |
| `src/lib/bits/patterns/maps/MapCanvas.svelte`             | Outdoor overlay composition and click routing                  |
| `src/lib/adapters/bars/useOmnibarModel.svelte.ts`         | Local station search category                                  |
| `src/routes/(public)/(app)/premises/`                     | Public route validation and page composition                   |

Imports through `#lib` require `.js` suffixes for TS modules and `.svelte.js` for rune
modules; actual component imports use `.svelte`.

## Source facts and identity boundaries

Lands Department API documentation:
<https://tools.csdi.gov.hk/csdi-webpage/apidoc/3d-indoor-mtr-station-map>. Kennedy Town
venue: `6f0e1339-7f9b-4024-abed-a462006568bc`. The six raw GeoJSON layers and hashes are
in `static/indoor/kennedy-town/`: 1 venue, 6 levels, 88 units, 175 openings, 97
amenities and 10 occupants (377 features). Retrieval was 14 November 2026, not
necessarily the survey date.

WFS requests use `https://mapapi.hkmapservice.gov.hk/ogc/wfs/indoor/mtr_{layer}`, WFS
1.1.0, GeoJSON output, `srsName=EPSG:4326` and a `venue_id` filter. Preserve raw
responses and validate counts/caps before treating a snapshot as complete. Geometry
coordinates are longitude/latitude; do not trust collection bbox axis order blindly.
Retain Lands Department attribution on the map.

Important source IDs:

- Concourse: `2374cbd5-3901-4ee9-8b84-ca926994c99d`.
- Platform: `5106db44-ed35-4991-b7be-a33e47cbcb5f`.
- KET3 / 7-Eleven unit: `85dc0347-d11b-4c8c-9686-dc6697050317`.
- Other 7-Eleven unit: `90e0ec60-9ec2-4e2a-aa70-fac74bab2b06` (no source kiosk code).
- Yamazaki / KET8: `d639fad3-3246-431e-b28a-5cc2124dc6f1`.
- Hana-musubi: `e4214678-8599-4e2b-9356-79d1630321ef` (unit name `room1`; no KET code).
- Exit B reviewed lift continuation: mezzanine unit
  `c1769bda-5a37-4043-bbf0-4d3352bb9841` to ground unit
  `5dc92c22-09a9-46ff-a049-4f7e4c438a5a`.

KET9 has two occupant records on one unit. Do not invent tenant subdivisions or new
kiosk codes. Paid/unpaid areas come from explicit section fields. Missing accessibility
fields mean unknown. Unit vertices contain floor heights, not connecting flight slopes.
There is no complete authoritative connection graph or escalator operating direction.
Four matching-code lift pairs and the reviewed Exit B continuation have stronger
evidence than the remaining footprint candidates.

## Research archive and sync

The PDFs are deliberately outside Git:
`/home/io/code/hype/.research/premises/transit/mtr/maps/{type}/{stationCode}.pdf`. Types
are `shops`, `layout`, `location`; codes are uppercase. The initial archive has 292
valid PDFs: 96 shops, 98 layouts, 98 location maps. Airport and Racecourse shop URLs
returned non-PDF content. The manifest records URLs, failures, sizes and SHA-256 hashes.
The official index HTML and additional Kennedy Town references are retained too.

Official URL patterns use lowercase station codes:

- `https://www.mtr.com.hk/archive/ch/services/shop/{code}.pdf`
- `https://www.mtr.com.hk/archive/en/services/layouts/{code}.pdf`
- `https://www.mtr.com.hk/archive/ch/services/maps/{code}.pdf`

Collector: `python3 scripts/indoor/download-mtr.py` from Hype. The app retains only
`static/indoor/mtr/manifest.json` and points PDF links at MTR's originals. Do not copy
PDFs back into application assets or Git.

R2 bucket: `hype-research`, reached through existing rclone remote `r2-tijpdata:`. Run
`bash scripts/research/sync.sh` from Hype. It maps `.research/` to the bucket root,
restores missing copies, versions one-sided overwrites and reports simultaneous edits as
conflicts. It never propagates deletions. Local `.sync/state.json` holds common
checksums; `.sync/versions/` holds retained versions. Do not remove the baseline to
silence a conflict. Rclone JSON hashes use the lowercase `md5` key; disable unnecessary
modtime/mimetype retrieval when listing objects. Never copy credentials into a guide.

The user service `hype-research-sync.timer` runs every fifteen minutes. Unit sources are
in `scripts/research/systemd/`. Inspect
`systemctl --user status hype-research-sync.timer` and
`journalctl --user -u hype-research-sync.service`. The initial 297-file archive passed
remote read-back comparison; the new logo is the 298th file. A fresh checkout can
restore research through the same sync command with an authorised rclone configuration.

## Verification and next work

Use Li for heavy checks. Reuse the local port-4173 admin server; do not start local
Chrome. Exact browser command:

```bash
dev-remote --port 4173 chrome env DEV_RUNNER_TEST_DIR=tests/e2e/station bun x playwright test station.spec.mjs --config .dotjik-runner/playwright.config.mjs
```

The environment assignment belongs inside the remote command. Putting it before
`dev-remote` did not reach Li and accidentally ran unrelated suites.

Focused tests:

```bash
dev-remote test bash -c 'bun run i18n:build && bun x vitest run src/tests/indoor.test.ts src/tests/indoor-routing.test.ts src/tests/omnibar-search-budget.test.ts'
dev-check python3 -B -m unittest discover -s scripts/research -p 'test_*.py'
```

Full validation uses `dev-remote typecheck`, generating i18n and SvelteKit outputs in
the remote job. With the current checkout, Svelte validation has 31 pre-existing errors
and 4 warnings outside indoor code. Use `NODE_OPTIONS=--max-old-space-size=5120` inside
the 6 GiB typecheck lane. Read each job's actual diagnostics; do not hide new errors in
the baseline. Verify latest browser outcomes in the runner artifacts rather than
assuming a previous pass covers subsequent edits.

Latest verification (15 November 2026): fourteen indoor/routing unit tests passed,
including missing-lift and polygon-hole cases. Seven station browser scenarios passed
across the main run and focused reruns, including route playback, stopping/replaying,
arrival floor isolation, reduced motion, real two-finger gestures, sharing and decoded
full-footprint Hana-musubi artwork. The demo route from Exit A to KET 3 is approximately
41 metres via the mapped lift. An initial outdoor attempt failed during local
guest-account startup and passed on rerun. Full typechecking retained the
31-error/four-warning baseline with no indoor diagnostics. Scoped Biome checks passed.

The outdoor check encountered HTTP 401 from the external SaanSeoi tile service. The
footprint now installs independently of tile completion, so source failure does not
prevent indoor entry. A successful click check does not establish healthy basemap tiles;
verify tile authentication separately when reviewing the full visual context.

Next substantive source work is to obtain reliable stair/escalator correlations, review
the remaining inferred links against stronger evidence, and acquire complete geometry
for additional premises. Keep evidence attached to any manual link. Do not turn
schematic links into pedestrian or step-free routing without verification. Preserve
source IDs and provenance if building a reusable SaanSeoi dataset/API.

## Hong Kong addition (15 November 2026)

Hong Kong is now available at `/premises/mtr-hok`, with nine levels, 249 units, 379
openings, 232 amenities and 83 occupant records. Venue:
`3c17605d-df03-4b09-90f5-bbca8cf1294d`. Raw layers and hashes are in
`static/indoor/hong-kong/`; collection uses `scripts/indoor/download-geometry.py`. The
snapshot registry in `src/lib/indoor/registry.ts` drives indoor loading and outdoor
footprints. Combined HOK kiosk codes preserve one source polygon. Exact-place example:
`/premises/mtr-hok/places/f78b733e-3d9f-4674-b974-11cdc2dbc65a` (HOK 4). The Kennedy
Town route-preview experiment remains confined to Kennedy Town; Hong Kong has no
reviewed walking network. See `station-layouts.md` for the source and test details.

## Reusable navigation refactor

The shared floor and route modules are documented in `indoor-architecture.md`.
`src/lib/indoor/navigation/` now owns source-independent floor loading and caching,
barriers, access points, directed connections and unpaid-first routing, with a separate
Lands Department adapter. `IndoorFloorLayer` and `IndoorRoutePlanner` are reusable UI
components; both stations use the planner without Kennedy Town-specific default IDs.
Paid fallback requires explicit fare-gate edges; current raw gate points are not enough
to create them. The station views continue to use the original six-layer snapshots.

## Location onboarding contract (15 November 2026, Refs #194)

The agreed model is a built/premises Location per MTR station and built/building_part
Locations for source units. Each unit has a `locationMembership` to its station.
Establishment Locations occupy those units through `locationOccupancy`; addresses
support placement but do not replace identity or containment relationships.

Preserve source venue, unit, level and section IDs. Unit display names retain the
supplied MTR code, including combined codes such as HOK 43-44, without splitting a
single source polygon. Retain uncoded source names without inventing codes. Retain floor
names, short names and ordinals separately from section names. Paid area and Unpaid area
are source section labels, not floors or inferred intermediate Locations.

`scripts/indoor/plan-mtr-onboarding.py OUTPUT.json` prepares a database-free review
artifact from the station roster and hash-verified LandsD snapshots. Current coverage is
98 proposed station premises, 337 units and memberships across KET/HOK, and 93 occupant
evidence records. Other stations do not acquire invented units or footprints. Roster
points retain their OSM provenance; LandsD geometry keeps its own manifest and raw
source. Plan references are not canonical SaanSeoi or Hype IDs.

Shared canonical drafts now use normal Hype Location IDs, `state='unresolved'`,
`ssId=NULL` and no owning organisation. `locationCanonicalDraft` retains the unique
provider source key and author; ordinary organisation-owned unresolved Locations and
private manual Locations remain distinct. Null `ssId` by itself does not mean draft.
Draft revisions use local provenance without fabricated upstream publication metadata.
The UI identifies them as Upstream draft / Not yet published.

Migration 0252 makes the draft working baseline mutable through the SuperAdmin Location
editor. Repeated profile saves update its facts and locale rows without appending
correction history. Content hashes fence edits and publication; promotion requires both
the displayed baseline ID and content hash. Published baselines retain the immutable
guards. The Locations index has a SuperAdmin-only Published/Draft selector; Draft does
not include Organisation-owned unmatched records.

`createCanonicalLocationDraft` is a trusted idempotent importer. An existing source key
never overwrites reviewed facts. `publishCanonicalLocationDraft` requires an explicit
upload correlation, exact latest revision and a real upstream publication. It retains
the Hype ID, accepted Feature pins, occupancy and membership references, adds identity
history and attaches the real `ssId`. Reused upstream IDs and stale drafts are rejected.
Later source refreshes retain premises/building-part classification.

`0250_location_canonical_drafts.sql` permits ownerless shared drafts and direct
building-part membership in premises. The durable single-root ownership constraint
continues to prevent reassignment or suppression of a unit's owning station/building.
The migration is rehearsed against an isolated full copy before any local application.

`scripts/indoor/apply-mtr-drafts.ts` imports premises and units with their memberships;
source-key replay is idempotent and the complete import is atomic. Default use requires
an offline database copy. `--apply-local` explicitly permits the managed local D1
folder; production and remote databases are unsupported. The separate local migration
script retains a full backup and applies only the selected migration (0250 or 0251).
Migration 0251 excludes shared drafts from automatic source rematching. Reconciliation
shows drafts separately from matched, unavailable and remaining records. Optional
reviewed occupancy mappings contain `sourceOccupantId`, `establishmentLocationId` and
`expectedRevisionId`; they link an existing shared establishment only after that exact
revision is verified. The importer does not create businesses from names or unit codes.
The featured-shop filter remains pending reviewed establishment/occupancy links.

Occupancy audit: all 93 source occupant points lie inside their referenced units and
agree on floor ID. They occupy 87 of 337 physical units. Seven records contain only shop
codes (not business identities); seven named records reference shared lobby or concourse
polygons. Four of those have repeated names at different coordinates and remain separate
source identities. KET 9 combines a code-only row with Original Taste Workshop. All
other unoccupied geometry includes infrastructure and vacant/unnamed rooms; absence of
an occupant record is not proof of vacancy. Source categories such as
transportationservices are also too broad to establish business identity.

Validation: eight Python onboarding checks passed through `dev-check`, covering source
integrity, duplicate identities, containment, combined codes and floor/section
separation. Full-copy migration rehearsal preserved all 163 original table counts,
external schema and the foreign-key baseline. The service rehearsal verifies draft
replay, occupancy, publication with stable identity, stale/reused-source rejection and
later premises refresh; all mutations roll back. Local onboarding contains 435 drafts
and 337 memberships. Establishment identities and featured-shop filtering remain pending
review.

Focused reconciliation validation passes all 10 tests. Targeted authenticated Chrome
checks pass on desktop/mobile for draft metadata, simulated publication and editing the
actual Kennedy Town draft. The progress display wraps without horizontal overflow at
390px. No establishment occupancy was applied from unreviewed evidence.

Full Svelte validation completed in managed job `job-aDJfnqHnFf` with 32 errors and four
warnings outside the draft additions (including duplicate MapLibre style types and
existing UI/test typing). The initial default-heap run exhausted Node's heap; the retry
used a 5 GiB heap within the runner's 6 GiB limit. Full validation is therefore not
green; focused draft lint, service tests and Chrome checks pass.

## Kennedy Town upstream review (15 November 2026)

Hosted Places API searches for `Kennedy Town MTR` returned three records, all verified
through the full collection response in `data-hk-places-2026-09-23.0`, catalog revision
`catalog-hk-places-v0.1-2026-10-18.11`. No identity links were written.

- `ss-3cf18cd2-3e76-54de-98de-cacbdb8dbf4d`: 港鐵堅尼地城站 MTR Kennedy Town Station,
  train_station, point [114.1284531, 22.2815463], freeform address 堅尼地城士美菲路.
  Strong station candidate, still requiring duplicate/identity review.
- `ss-01732739-beea-5207-bfd1-2559902ab709`: New Kennedy Town Mtr Station, broad
  travel_and_transportation category, point [114.128602, 22.281523]. Possible duplicate.
- `ss-8d7b9b3a-043e-59d8-91b6-b177fdf79730`: MTR Kennedy Town Station, point
  [114.17455,
  22.27374],
  roughly 4.8 km away. Do not match by name alone.

All three have null identifiers and structured address/unit links. Their source evidence
is Meta through Overture, not an MTR station-code register. The complete `KET` search
returned only the unrelated 間 MA.KET shop. These station candidates do not establish
shop occupancy relationships. Individual occupant searches remain a separate review.

Local admin basemaps at `localhost:4173` were failing tile authentication: that origin
is absent from the hosted tile service's first-party exemption, although CORS permits
it. Development now requests TileJSON/vector tiles through a restricted same-origin
endpoint using the existing server credential. The credential stays server-side;
production retains direct tile URLs.

Authenticated real Chrome verification passed on the actual Kennedy Town Location page
(`job-mXztoeUtFP`): TileJSON and vector-tile requests returned 200, and the screenshot
shows rendered roads/buildings. Eight focused source/proxy tests passed.

## Station upstream reconciliation policy (15 November 2026, Refs #194)

Current decision: station premises remain proper upstream drafts with null `ssId`. The
Places candidates below are unlinked evidence; they are not confirmed upstream premises.
No station identity merge, service-point creation or blacklist is applied. A station POI
category alone does not establish a separate transport operation. A verified
passenger-service operation may later be modelled as an operational service_point; shops
remain establishments occupying station units.

The following policy is deferred until typed upstream premises/building records and
family-aware reconciliation are available. Reconcile existing station drafts against
those identities before creating another canonical station record. Prefer an explicitly
classified premises representing the same station. If no premises is available after an
adequate source search, a reviewed building representing that same station may be
accepted and corrected to built/premises. Preserve the original source classification
and evidence alongside the correction. Subsequent source refreshes must not silently
undo an accepted classification correction.

If upstream supplies both premises and building candidates, require review. A building
that duplicates the same station identity becomes a proposed SaanSeoi blacklist entry,
with source family, ID, publication, retained identity, reason and evidence. A genuine
physical building within the station remains a separate member of the premises. No
blacklist is applied merely because names or coordinates coincide. Approved exclusions
must cover discovery and ingestion consistently, without removing retained history.

Keep the existing Hype station ID and all unit memberships when accepting an upstream
identity. If that upstream record already exists in Hype, require an explicit local
identity merge plan covering references and history; never attach the same upstream ID
to two Hype Locations. Existing-upstream reconciliation is distinct from an upload
receipt: do not fabricate a publication receipt for a record discovered through search.

The current Places projection exposes POI categories such as train_station, not a
confirmed built/premises classification. Buildings use a distinct source-family ID. A
train_station POI is review evidence, not proof that the premises preference was
satisfied. Family-aware identity acceptance and durable classification correction are
required before applying cross-family station reconciliations.

The initial Kennedy Town review is in `scripts/indoor/mtr-station-reconciliation.json`.
Its blacklist is deliberately empty: no building-family duplicate has been verified.
