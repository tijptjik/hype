# Reusable indoor floors and routing

Indoor navigation uses independent floor modules and explicit connections. The source
snapshot and its source IDs remain unchanged. No Hype Feature or Location links are
created by this adapter.

## Modules

| Module                        | Responsibility                                                                               |
| ----------------------------- | -------------------------------------------------------------------------------------------- |
| `navigation/types.ts`         | Source-independent floor, area, barrier, access point, connection and route contracts.       |
| `navigation/floors.ts`        | Load individual floors, deduplicate concurrent requests, cache successes and retry failures. |
| `navigation/geometry.ts`      | Planar containment and exact segment intersections, including polygon holes.                 |
| `navigation/router.ts`        | Compile and cache each floor's graph, join declared connections and search unpaid-first.     |
| `navigation/landsd.ts`        | Adapt raw Lands Department records, coordinates and connection evidence.                     |
| `routing.ts`                  | Adapt station UI requests/results and cache navigation sessions per immutable snapshot.      |
| `IndoorFloorLayer.svelte`     | Render one floor's supplied geometry, artwork, labels and hit targets through callbacks.     |
| `IndoorRoutePlanner.svelte`   | Source-independent origin/destination controls and asynchronous route feedback.              |
| `StationRouteControls.svelte` | Bind the reusable planner to station records and route playback.                             |
| `artwork.ts`                  | Resolve known occupant artwork independently of floor drawing and navigation.                |

The floor drawing component receives its data and interaction callbacks; it owns no
application context or camera. `StationScene` retains shared camera gestures, projected
floor placement, cross-floor overlays and animation. The renderer's current source-view
records still follow the existing Lands Department display format. Navigation contracts
are independent of that format.

## Floor contract

Navigation coordinates are metres in one shared site coordinate system. Each floor
contains an ID, name, physical elevation, routable area polygons, solid barrier segments
and access points. Areas declare `unpaid`, `paid` or `unknown` access and whether they
allow through-travel. A shop can be a destination without becoming a shortcut.

An access point belongs to one specific area. Connections reference floor and access
point IDs at both ends and declare type, direction, evidence, source IDs and enabled
state. Connections may join areas on the same floor or distinct floors. Missing floor or
endpoint references do not create edges. Candidate links remain display-only.

`FloorRepository` accepts an asynchronous loader, so future sources can fetch each floor
separately. The current Lands Department adapter partitions the existing complete
six-layer station snapshot in memory; it does not introduce a new per-floor HTTP asset
format. Only floors reachable from the origin through enabled, evidenced connections are
loaded/compiled by the router. Graphs are cached for the immutable snapshot's lifetime;
a new snapshot creates a new repository/router.

## Barriers and paid access

Area boundaries are closed by default. Merely touching or overlapping two polygons does
not create a connection. Grid edges stay within one area and cannot cross a polygon
boundary, a hole or a solid barrier. The same checks apply when attaching an exact
origin or destination point. A declared same-floor connection cannot cross a solid
barrier either: a door/gate must occupy a real gap in the barrier geometry.

Crossing between paid and unpaid areas requires an explicit `faregate` connection. An
ordinary doorway, overlapping connector or nearby fare-gate marker cannot cross that
access boundary. Connection direction and enabled state are respected.

Routing first searches with paid areas excluded. Only if that search fails does it
repeat with paid areas allowed. This guarantees that any mapped unpaid route wins over a
shorter paid route. The fallback still respects every barrier and connection rule. A
result using paid space carries `requiresPaidAccess`, displayed as “Requires paid-area
access”. Unknown-access areas remain excluded. A paid origin or destination necessarily
uses the fallback. This preference does not establish ticket eligibility, opening hours
or step-free accessibility.

A point destination must be inside a routable area and connect to nearby graph nodes
without crossing a barrier. An area destination chooses a reachable interior graph
point; it does not assume that the polygon's bounding-box centre is inside. Distances
are measured on the 0.75-metre sampled graph plus exact endpoint/connection segments.
They are approximate walking distances, not a proof of continuous geometric optimality.

## Lands Department evidence boundaries

The adapter accepts public circulation categories and occupied destination rooms.
Explicit section names determine paid/unpaid access. It associates source pedestrian
opening lines with areas sampled on opposite sides of the actual line midpoint; the
association is bounded to 1.2 metres on each side and ambiguous associations are
omitted. This is retained preview evidence, not a claim that every doorway's operating
access has been reviewed. Openings with populated access-control restrictions are
excluded.

The adapter retains existing matching-code lift pairs and the reviewed Kennedy Town Exit
B continuation. It never promotes aligned-footprint candidates into route edges. No new
stairs/escalator directions or Hong Kong inter-floor links are inferred.

Neither snapshot supplies a complete reviewed fare-gate crossing map. The adapter
therefore creates no paid/unpaid connections from fare-gate points. The generic router
supports paid fallback now, but real-station paid routes require separately reviewed
connections before they can be returned. Solid barrier lines can be supplied by other
floor loaders; the present source adapter uses closed area boundaries and openings,
without inventing wall geometry from point symbols.

Both stations use the shared route planner with data-derived choices. An incomplete
network reports “No verified route available between these places.” The route preview
remains explicitly provisional, including matching-code lift and source-door evidence.

## Verification

`src/tests/indoor-navigation.test.ts` exercises unpaid preference over a shorter paid
shortcut, paid fallback, gate direction/closure, unknown access, solid barriers, thin
holes, disconnected touching areas, destination interiors, non-transit rooms and lazy
floor caching/retry. Existing source-data and Kennedy Town route tests remain in use.
Managed Chrome station tests cover the extracted renderer, gestures, floor drilldown,
source-place sharing, route playback/interruption and planner resets between stations.

Verified on 15 November 2026: 25 focused tests passed (`job-kIqnDSlsC2`). All ten
station Chrome scenarios passed across `job-0FC6ijWkdz`, `job-bMoCylq48g` and
`job-HEFSmiDOgg`. Targeted reruns accounted for map visibility readiness, a concurrently
updated search label, and a transient guest-account startup failure after reload.
Screenshots of the extracted floor rendering and route overlay were inspected. Full
Svelte validation (`job-whkieOJnGD`, 5 GiB Node heap in the 6 GiB lane) retained the
existing 31 errors and four warnings in 13 unrelated files, with no indoor diagnostics.
Scoped Biome checks and whitespace checks passed.

The isolated station-only commit snapshot was checked separately: all 29 indoor and
omnibar tests passed (`job-2XE9ORytjb`), as did five research-sync unit tests. All
twelve raw layer SHA-256 hashes match their source manifests. Its full Svelte check
(`job-DWQiX3aUhI`) reported 14 existing errors and four warnings, confined to
`DisplayTemplateEditor.svelte`, `display-template-blocks.test.ts` and
`feature-naming-form.test.ts`; there were no indoor diagnostics. The higher error count
above belongs to the combined working tree. Browser evidence above also covers the
combined working tree; the station-only commit snapshot was not separately browser-run.
All five atomic commits passed the normal staged lint hooks, including full-tree lint
for the research ignore rule and raw-source formatting exception. Concurrent mall,
catalogue, project-policy and dependency changes are excluded from this series.
