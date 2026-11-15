# Station exits and continuous pedestrian routing

Refs [shared routing EXT-1 #213](https://github.com/tijptjik/hype/issues/213).

## Current implementation

Hype's indoor router already compiles independent floor graphs at 0.75-metre spacing,
joins explicit evidenced connections, and searches unpaid areas before allowing paid
fallback. It is source-independent but its compiled nodes are private, ephemeral and
optimised for local geometry queries. See [indoor architecture](indoor-architecture.md).
It is not a Valhalla graph and its distance/clearance costs are not a walking-time
model.

Source `entry` amenities were omitted from floor markers. The viewer now displays their
source labels at their original points on the selected floor. Repeated exit codes at
different levels or physical locations remain separate. A visible exit label does not
establish an outdoor connection or a reviewed fare-gate crossing.

SaanSeoi owns graph builds and serving. Its `scripts/routing/build.py` currently feeds
`region.osm.pbf` into `valhalla_build_tiles` and creates `graph.tar`. Its checked-in
engine release is `3.8.3+6291`. `workers/routing/request.ts` currently normalises two
latitude/longitude endpoints and street costing; the public application contract must be
extended before sending floor-sensitive endpoints or paid-area restrictions. These are
repository observations, not a fresh production runtime audit.

## Baseline exit coverage

The 2026-11-15 baseline audit covers 33 stations on the former KCR corridors and
extensions/interchanges (excluding Light Rail). It contains 299 entry records across 32
stations. Lok Ma Chau has no entry records; this is a source gap, not proof that it has
no entrances. Sha Tin, Kam Sheung Road, Yuen Long and Che Kung Temple include an
Entrance Foyer label. Yuen Long includes Exit (Long Yat Road). Preserve descriptive
labels without assigning invented letters. Tuen Mun includes a full-width E, normalised
only for its display badge. Counts include repeated exit codes on distinct floors.

Reproduce with `python3 scripts/indoor/audit-exits.py BASELINE/stations`; output retains
source identity, floor and geometry. Rendering coverage does not prove all physical
exits are represented or that any entry has a verified outdoor graph connection.

## Recommended graph boundary

Maintain a versioned, engine-independent graph per station for authoring and validation;
compile the approved station graphs and outdoor network together into one regional
Valhalla graph release. Valhalla's tiles are its native open-source format, not a
proprietary format we should hand-write. Independently built station tile archives
cannot simply be appended to the regional archive: identifiers, boundary connections and
graph indexes must be produced coherently by the builder.

The station graph should contain:

- Stable source-derived node IDs, geographic coordinates, physical elevation, station
  ID, floor ID and the engine's numeric floor mapping. Source floor ordinals are not
  globally comparable elevations; bridge landings and concourses need explicit mappings.
- Directed edges for verified corridors, doors, stairs, escalators, lifts and fare
  gates, retaining geometry, source provenance, access class, accessibility and review
  status.
- POI access nodes attached through their actual doors to the circulation network. Shops
  are destinations, not shortcuts. A POI centre alone cannot establish connectivity.
- Explicit indoor/outdoor portals binding a source entry/opening and floor to an outdoor
  node or split edge. Match topology, height and physical access; never join by 2D
  proximity alone. One exit code can have several portals and several interior markers.

Use LandsD's 3D Indoor Network as the preferred source of traversable segments and the
3D Pedestrian Network for surrounding paths. Use the indoor map for rooms, labels,
openings and paid-area classification. Audit overlaps with existing OSM paths to avoid
parallel duplicate corridors and accidental access bypasses. Preserve all source hashes;
review attribution and redistribution terms for the combined downloadable graph.

Export approved segments into a build-time OSM-compatible input with stable
collision-free IDs, sharing real junction nodes with the outdoor input. Compile using
the pinned Valhalla builder. Do not ship the dense runtime sampling grid as an
unreviewed station network.

## Requests and map transitions

Resolve a selected POI to its verified access point on the requested floor. Request one
end-to-end pedestrian journey. Keep station/floor/portal identities in a release sidecar
and preserve level transitions when normalising the result. The outdoor map draws
outdoor segments; the indoor viewer draws the same journey's relevant floor segments.
Entering an interior changes the presentation, not the route's identity or destination.

Current upstream
[Valhalla route documentation](https://valhalla.github.io/valhalla/api/route/api-reference/)
describes floor-sensitive location filtering, level changes in responses and
level-scoped polygon exclusions. These capabilities must be demonstrated against our
pinned engine, builder and shared request normaliser; current upstream documentation
does not prove support in our deployed version. Do not treat physical z elevation as an
engine floor.

A transitional two-engine implementation is possible: evaluate outdoor routes to every
eligible portal plus indoor routes from those portals to the destination, using
compatible time costs, and choose the best complete journey. Choosing the nearest exit
first is incorrect. This is an interim option, not the recommended long-term graph
boundary.

## Paid areas and time costs

Keep access restrictions separate from preferences. Offer strict unpaid-only, prefer
unpaid with an explicit paid-access result, and paid-allowed policies. Preserve current
unpaid-first behaviour when migrating. A finite penalty does not guarantee unpaid-first;
use a strict unpaid search followed by a permitted fallback. Never silently relax a
strict restriction or equate failure/timeout with absence of an unpaid route.

Fare gates must be explicit directed edges. Unknown access and unreviewed links remain
excluded. Do not substitute vehicle toll avoidance for railway paid access. Level-aware
paid polygons may support a prototype if the pinned engine correctly enforces them; 2D
exclusions can block an unrelated floor or footbridge. Verify connector crossing and
endpoint snapping as well as the returned path. If necessary, implement a dedicated edge
access/costing representation in the shared engine pipeline.

Fastest walking paths need calibrated walking speeds, stairs/ramp costs and lift waits,
not just geometric distance. Preserve estimated travel time separately from preference
penalties. Wheelchair routes must respect known accessibility and connector direction;
missing accessibility evidence cannot establish step-free access.

## Acceptance before enabling continuous routes

Start with a former KCR station with available named entries, then cover East Rail and
former West Rail/Ma On Shan stations. Validate street-to-shop, shop-to-street,
same-floor, inter-floor and inter-station walking journeys. Include identical XY
positions on distinct floors, disconnected nearby exits, closed/one-way gates, unpaid
detours, paid destinations, unknown access, lift-only accessibility and duplicate source
corridors. Check reverse journeys and route reloads. Compare the full journey cost
across alternative portals.

The exit-marker change does not publish data, rebuild Valhalla, change the shared
service contract or claim that station routing is complete. Graph export, native engine
capability tests and service integration are the next implementation stage.

## Exit-label verification

On 16 November 2026, Li job `job-uGefbu0Dmj` passed 16 exit and existing navigation
safety tests. Job `job-H4sLbQMk4r` passed the three exit tests after adding full-width
code normalisation. Chrome job `job-5zZA1M4qhl` passed Kowloon Tong exit selection,
source-place detail and reload checks at 1440px and 390px with local admin identity and
admin access assertions. Screenshots were inspected. This is one-station interaction
coverage; the 33-station audit establishes source entry coverage only.

Scoped lint passes for the new helper, component, tests and this document. A check also
including the concurrently modified floor renderer reports formatting/non-null assertion
findings in its existing connector-relief edits. Those unrelated edits were preserved.
No full typecheck, Valhalla rebuild, native route test or deployment was performed for
this initial exit-label change.

## Experimental source edition, 16 November 2026

The optional
[published edition](https://tiles.saanseoi.hk/routing/hk/indoor/2026-11-16/manifest.json)
contains 98 station graphs and separate all-access and unpaid-only native Valhalla
packages. Default outdoor routing remains unchanged. The station planner offers an
explicit experimental opt-in and three paid-area policies. It searches actual LandsD
segments with a priority queue, retaining intermediate vertices and distinct floor
identities. Unmapped planar geometry is rejected rather than drawn as a shortcut.

The native graph is **experimental**, not enabled in the hosted routing service:
identical-XY lift-landing requests still collapse to zero distance in native smoke
checks, including requests with `search_filter.level`. Continuous outdoor-to-indoor
service integration is unfinished. Nine stations lack exact accepted outdoor portals;
see the published coverage report. Time-restricted source paths are excluded pending
schedule handling. POI attachment and lift waiting estimates need further review.

Exit signs use the Breadline theme's deep green `#28786a`, an inset rounded white
outline and the app's loaded Geologica typeface. Letter and numbered codes share a
32-unit square; numeric suffixes use smaller lettering at the lower right. Descriptive
entrances retain readable text labels instead of invented exit codes. All code letters
and numbers use the same font; there is no partial outlined-glyph lookup.
Source-location selection and keyboard use are preserved.

Verification for this edition: source and exit tests passed (Li `job-rojHT3vWPE`);
Python source invariants passed (four tests); artifact serving passed six tests. Chrome
`job-oPMPE9XBTe` passed grey exit selection/reload at 1440px and 390px; `job-J4KRKvs3ob`
passed opt-in Exit G1 to LBuy routing and policy-change clearing. Screenshots were
inspected. Public native package hashes match `build.json`, and the public Kowloon Tong
JSON matches its manifest hash. The artifact Worker was deployed from an isolated
checkout; Hype application changes remain local and uncommitted.

Full Svelte typecheck `job-N9XEOHYAIj` failed with Node heap exhaustion (exit 134,
approximately 4 GiB V8 heap within the 6 GiB managed lane). It did not produce a clean
full-project typecheck result. Resource evidence records a 4.68 GB process-scope peak;
this was a JavaScript heap failure, not a cgroup OOM kill.

The design studio at `/themes/exits` renders the shared `ExitSign` component for all 62
distinct exit codes recorded in the 98-station baseline. Search accepts exit or station
codes; size and selected-state controls support visual review. Regenerate
`src/lib/indoor/exit-catalogue.json` with
`python3 scripts/indoor/catalogue-exits.py BASELINE/stations`. This is source coverage,
not a generated alphabet/number cross-product or a complete physical-exit inventory.
