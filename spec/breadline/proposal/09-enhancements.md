# Routing integration and enhancements

Tracking: [routing parent #186](https://github.com/tijptjik/hype/issues/186),
[EXT-1 #213](https://github.com/tijptjik/hype/issues/213).

## Routing runtime experiment

The October 18 experiment compares native Valhalla 3.8.3 in a container with the
community `valhalla-server@0.2.1` WASM Worker adapter using the same Hong Kong
OSM-derived graph. The source is SaanSeoi's October 1 regional PBF. Its recorded
measurements remain in the benchmark report; the dedicated benchmark deployments
and tooling are retired. Application routing uses the shared SaanSeoi services
described in [routing setup](../../../scripts/routing/README.md).

The [benchmark report](../../../docs/benchmarks/routing-2026-10-18.md) records
measured latency, route parity, resource failures and the initial deployment blocker.
A dedicated token resolved the HTTP 403 for the recorded native deployment.
The paired 468-request Cloudflare run favored native Valhalla: warm medians were
148 ms walking, 138 ms cycling and 140 ms car, versus 225/166/200 ms for WASM.
Native completed all routable requests; WASM retained memory/queue failures.
Both Worker endpoints reported NRT; container placement and dedicated HK/mobile
clients still need validation. No EXT-1 integration acceptance item is complete
from this experiment alone.

### On-demand native lifecycle

The follow-up deployment accepted a custom one-vCPU / 3 GiB / 2000 MB disk
container. All 223 routable corpus requests passed; warm medians were
196/187/183 ms for walking/cycling/car, and eight concurrent walking requests
had 695 ms p95. Five verified stopped starts ranged from 1.0 to 6.7 seconds.
These separate runs show feasibility, not a sustained capacity guarantee.

The intended app flow issues a server-authorized `POST /warmup` as soon as the
user enters in-app directions, without coordinates. Parameter collection proceeds
while startup runs. `POST /route` can independently wait for/start the engine, so
warm-up failure, omission or expiry cannot prevent a calculation. The single
shared engine expires after 120 seconds of inactivity; each warm-up/completed
route refreshes that window, and in-flight requests defer shutdown. No periodic
keepalive or always-warm instance is intended. The isolated benchmark used
authenticated readiness/state/stop endpoints with a server-only bearer token.

The runtime experiment initially left the Google Maps action unchanged. The
application integration below now replaces it on the public card. The technical
report contains raw deployment measurements and the on-demand cost model; actual
monthly uptime and sustainable production load remain unmeasured.

## Initial current-location navigation panel

The public card's GET THERE action now opens `Panel.navigation` on the right,
using canonical panel arbitration and the existing panel shell. The layout-owned
navigation adapter starts warm-up and one-shot browser geolocation in parallel.
Walking is the initial profile, with cycling, car and motor scooter choices.
Mode changes calculate another journey from the same location fix; a new GET
THERE intent obtains a new fix. This is a static journey planner, not continuous
GPS guidance. The panel lists every returned maneuver in order, with distance,
estimated travel time, origin/destination and monetary cost when known.

`routing.remote.ts` exposes session-required commands, including valid guests.
It applies a Cloudflare 30/minute limiter by user and client IP before forwarding
to the private native Worker through `ROUTING_SERVICE`. `ROUTING_TOKEN` remains
server-only. Commands avoid query caching of precise locations; the app does not
persist coordinates in URLs, local storage or its database. Closing via X/End
route, switching markers/profiles and unmounting invalidate obsolete async results.
View map deliberately retains the journey while minimizing directions.

Valhalla's route optimization cost is never displayed as money. Foot/bicycle
routes without ferry connections show HK$0 transport fare; motorized/ferry cost
is unavailable until a verified estimate source is added. Ferry edges display an
explicit warning that schedules, waiting time and fares are excluded. Bus/MTR/
scheduled ferry planning remains unavailable.

Native polyline6 leg shapes now decode to a GeoJSON MultiLineString on the server.
The renderer-owned map overlay draws the selected route and endpoints with a
contrasting accent, restores layers after style changes, fits the route beside
desktop panels and refits after viewport changes. Other photo markers dim while
the destination remains emphasized. GET THERE dismisses the large card to expose
the map; View map/Show directions switch between map and instructions without
another GPS or routing request. X/End route removes layers and clears the journey.
The live app verified 235 walking positions within the desktop viewport, visible
car geometry at 390×844, and native source removal on close. Focused geometry,
restoration/cleanup and navigation tests pass; production deployment is pending.

Journey steps now carry their exact geometry from Valhalla's inclusive,
leg-local maneuver shape indices. Hovering or focusing a step highlights that
section in amber; arrival steps highlight a point. Pointer hover takes priority
over retained focus, and leaving a step restores any focused step. Highlights
clear on blur, hiding directions, recalculation or ending the journey. Selection
updates a separate renderer-owned source without a route request or camera fit,
and survives basemap replacements with the route.

The [integration verification notes](../../../docs/benchmarks/navigation-2026-10-18.md)
record real browser-to-app-to-deployed-engine checks, mobile/error handling and
focused tests. Local credentials are configured. Dedicated production/preview infrastructure
and secrets are now provisioned as described below; main application publication
remains pending. Automated graph refresh, cache/uncertainty and shared
volunteer/operations consumers remain incomplete,
so #213 and its existing acceptance checkboxes remain open.

## Shared SaanSeoi routing

SaanSeoi owns regional PBF/Valhalla/GraphHopper publication, graph retention and the
private `ss-routing-prod` / `ss-routing-preview` services. Each service has a separate
container namespace and app-token registry. Hype uses a private service binding,
`X-Routing-Client: hype` and its server-only routing credential; guest/session and
per-user/IP checks remain in Hype. Local experiments remain isolated.

The shared engine loads a pinned compatible GBA Valhalla release, covering all three
regions with one named engine per environment, eight admitted calculations and a
120-second idle shutdown. Hype still constrains initial UI endpoints to Hong Kong.
Public graph downloads do not grant access to private compute. See
[shared operations](../../../docs/operations/Feature-Routing.md) and SaanSeoi's
`docs/datasets/families/routing.md` for source manifests, downloads and rollback.

## Modes and future contract

- Street modes: walking, cycling, car and motor scooter. Native Valhalla exposes
  the scooter costing; the tested WASM SDK does not. Do not substitute car costs
  for scooters or bicycle costs for motor scooters.
- Passenger transit: bus, MTR and ferry itineraries need service calendars,
  stop times or frequencies, access/egress walks and transfers. Native `bus`
  vehicle costing is not a passenger journey planner. OSM ferry edges can supply
  untimetabled connections, but cannot establish boarding wait or last departure.
- Existing OSM subway route relations establish useful rail topology. They do
  not by themselves establish timed MTR journey-planning support. The inspected
  Transport Department GTFS headway feed includes MTR Bus, buses, minibuses,
  ferries and trams, but no MTR heavy-rail/subway routes. MTR rail service timing
  needs a separately verified source.
- Keep routing provider/runtime separate from the app's public mode contract.
  A result should describe an itinerary with typed legs, geometry, metres,
  seconds, transfers and departure/arrival times when available. Include graph,
  engine/profile versions, calculation time and estimate/uncertainty metadata.
- Keep a transit-engine adapter possible. Evaluate native Valhalla's GTFS
  multimodal path and a dedicated planner such as OpenTripPlanner once complete
  feeds are available; neither is validated by the street benchmark.

## Production acceptance still outstanding

Graph/admin/timezone preparation and an automated refresh pipeline, route quality,
broader native cold/warm/concurrent capacity, cache keys and
invalidation, shared volunteer/operations consumption and broader UI integration remain
implementation work under #213. Distinguish cached estimates from fresh routes;
an unreachable route must not silently become a straight-line travel estimate.


### Core nearest-MTR walking access (Refs #213)

`mtrStation` stores the station code, `mtrExit` a stable OSM entrance node ID and
`mtrDistance` integer walking metres. `mtrResolution` records graph/catalog version,
calculation time and ready/unreachable/unsupported state. This is feature data, not
hub/organisation/project configurable property data. Cards resolve names and exit
labels from the catalog.

Geometry-change triggers clear obsolete results and enqueue durable work. Authorized
feature creation/edits attempt request-local background enrichment; the dedicated
MTR refresh Worker retries queued work. Lease/geometry fencing prevents stale writes.
Candidate entrances are ordered by great-circle distance; actual pedestrian routes
across stations compete until the remaining lower bound exceeds the best walk.
Routes involving ferries or endpoint snaps over 75 metres are rejected. A short snap
connector is included in the distance, so entrance approach quality still depends on
OSM pedestrian connectivity and requires visual sampling before production acceptance.

The catalog contains 98 stations and 635 entrances from OSM HK 2026-10-01. Associations
include 496 stop-area relations, 19 explicit station-exit-plan mappings and 120 spatial
fallbacks. Spatial fallback associations require review; they are recorded in provenance.
See `docs/operations/Feature-MTR.md` for commands, limitations and the routing blocker.
