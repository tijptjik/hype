# Initial navigation panel — 2026-10-18

Refs [EXT-1 #213](https://github.com/tijptjik/hype/issues/213), parent
[#186](https://github.com/tijptjik/hype/issues/186), and the
[technical domain](../../spec/breadline/proposal/09-enhancements.md).

## Implemented flow

GET THERE on a public point-feature card opens the existing right panel shell.
The layout starts authenticated engine warm-up immediately, while requesting a
single browser location fix (up to 30 seconds old, 15-second timeout). With the
location available, it calculates a walking journey to the marker. Walk, Cycle,
Car and Scooter choices recalculate the journey; all native instructions appear
in order with distances and durations. Route time/distance and an available
monetary estimate appear near the top. The selected journey is also rendered on
the map; this remains a static planner rather than live GPS guidance.

For local development, the requested mock origin is now Tai Hing House in
Sheung Wan: **22.28411, 114.14991**, resolved by the government's ALS lookup for
132–134 Hollywood Road / 1 Square Street. The panel labels it as a mock location
and navigation bypasses GPS. `src/lib/routing/developmentOrigin.ts` gates this
override on `import.meta.env.DEV`; production builds continue to use browser GPS.

Permission denial, unavailable/timed-out location, out-of-HK location, engine
failure and unreachable routes have retryable feedback. Closing via X/End route
or changing destination/profile invalidates pending results. View map deliberately
retains the calculated journey and offers Show directions without recalculation.
The browser does not
need to await warm-up; `/route` can independently start/wait for the engine.
The existing native two-minute idle shutdown remains unchanged.

Walking/cycling without a ferry shows HK$0 transport fare. Motorized fuel/tolls
and ferry fares are unavailable. Valhalla's optimization `cost` is not currency.
Ferry edges show a timetable/wait/fare warning. Passenger bus, MTR and scheduled
ferry planning remain pending complete service data and a transit engine.

## Server boundary and deployment

`src/lib/api/routing.remote.ts` uses commands rather than location-keyed queries.
It requires an existing session, including a guest session. A Cloudflare
`ROUTING_LIMITER` allows 30 requests/minute per user and per client IP (local to
the serving Cloudflare location). The limiter runs before warm-up or routing.
Only supported HK points and four street profiles are accepted.

`ROUTING_SERVICE` is a private binding to the already deployed
`ss-routing-preview` service for local development and preview, and
`ss-routing-prod` for production. Only the app server attaches
`ROUTING_TOKEN`. The app does not persist origin/destination coordinates in its
URLs, local storage, database or its own application logging/cache.

Both Wrangler configs include local bindings; production/preview include their
own service and rate-limit bindings. Local development uses a remote service
binding and the ignored root `.dev.vars`, now configured with the server-only
routing credential. **The main application was not deployed in this task.**
After adding these bindings or changing `.dev.vars`, fully restart the existing
Vite process. The Cloudflare adapter deliberately retains its binding proxy
across hot/config reloads, so a reload alone can leave `ROUTING_LIMITER` missing.
The normal `hype.localhost` server uses port 5175; keep that listener when
refreshing the running app rather than testing only a separate temporary port.
Before a production/preview rollout, configure `ROUTING_TOKEN` as that
environment's Worker secret, matching Hype's credential in the corresponding
SaanSeoi client registry.
Use Wrangler's secret prompt or a secret file passed through stdin; never put
the value in command arguments, browser configuration or source control. Graph generation and service deployment are owned by SaanSeoi.

## Map route overlay

The server now decodes every native leg's polyline6 shape into longitude/latitude
GeoJSON `MultiLineString` geometry. Leg boundaries are preserved, including gaps;
no straight-line substitute is drawn. Malformed, truncated, overflowing and
out-of-range shapes are rejected. A single-position zero-distance shape is
represented as a legal zero-length line.

`MapCanvas` receives the ready journey from its owning layout. A renderer-owned
`NavigationRouteLayer` draws a contrasting line/casing and start/end points,
using the active basemap's accent palette. Native map objects remain in the
renderer. Layers restore after style replacement and are removed when the
journey clears. Photo markers other than the selected destination dim during
navigation so they do not obscure the line; normal styling returns on close.

GET THERE dismisses the large feature card to reveal the map. Camera fitting
accounts for desktop panels and waits for the native renderer's current size;
it also refits after viewport resize without fighting ordinary user pans. View
map minimizes the panel, including on mobile, while retaining the geometry.
Show directions restores it; X/End route clears the line and transient journey.

Live `hype.localhost` checks verified the real MapLibre route source contained
one leg with 235 positions, rendered line features, and every route point within
the desktop map. After switching to car and resizing to 390×844, rendered route
features and full bounds remained visible. View map/Show directions worked,
and closing removed the native route source. Style restoration and ownership
cleanup also have focused renderer tests. The local basemap tile requests still
have the separate upstream authorization issue seen in earlier checks; the
route overlay itself rendered successfully on the live canvas.

Updated screenshots: `output/playwright/routing/route-map-desktop.png`,
`route-map-full.png`, and `route-map-mobile.png` (ignored local artifacts).

## Verification

- Real Chromium through `http://127.0.0.1:4173`, running the application with
  local data and the private remote service binding. Geolocation was set to
  a fixed demonstration point in Central, not an actual user's position.
- A visible Regal Court marker opened its card; GET THERE invoked `warmRouting`
  and `calculateJourney`, both successfully. The walking result contained
  31 ordered maneuvers and an untimetabled ferry warning.
- Cycling correctly displayed a valid unreachable-route error. Car and scooter
  returned routes. The final scooter/retry journey contained 26 maneuvers.
- At 390×844 the panel occupied the full viewport width, its close button
  remained visible, and there was no horizontal page overflow.
- A simulated geolocation permission denial displayed actionable feedback;
  Try again restored the native geolocation call and loaded a real journey.
  Closing dismissed the panel. No browser page errors were observed.
- 21 focused tests passed across controller startup/races/cancellation, retry,
  HK coverage, route unit/cost normalization, engine errors, session/rate guards
  and panel viewport arbitration, plus polyline6 decoding, geometry bounds,
  basemap restoration and overlay cleanup. New/changed files passed focused Biome.
- Full `bun run check` reports **6 errors and 21 warnings**, all outside this
  change's implementation/test files (map street-label imports/types and legacy
  info-panel `$props` typing, plus existing warning locations). The global check
  is not green; no before/after baseline equivalence is claimed.

Local screenshots and the browser log are retained under
`output/playwright/routing/` (ignored artifacts). Agent-started dev/browser
processes and the test routing instance were stopped after verification.

These checks prove local application integration with the deployed engine. They
do not prove a deployed production app, sustainable load, route quality, traffic,
elevation or timed transit correctness. #213 remains partial and open.

## Journey-step hover and focus

Each normalized maneuver now includes its geometry, using the native inclusive
begin/end shape indices within its own leg. Invalid ranges reject the upstream
journey. Arrival maneuvers with one position use Point geometry. A separate
renderer source highlights the active step in amber without updating full-route
data, making another routing call or changing the camera. Pointer hover takes
priority over retained focus; leaving restores focus, while blur, hiding the
panel, recalculation and ending navigation clear the applicable selection.
Style replacement restores both route and selected geometry.

The live Chromium check through `hype.localhost` verified the real 47-step walk
from the Tai Hing House development origin: first and middle steps highlighted
LineStrings, and the final step highlighted its arrival Point. Pointer leave,
keyboard focus, Tab and blur updated/cleared selection correctly, and the camera
coordinates, zoom, bearing and pitch remained identical throughout hover.
View map/Show directions, car recalculation, 390×844 map view and closing passed;
closing removed the native route source. Screenshot:
`output/playwright/routing/route-step-hover.png` (ignored local artifact).
The existing local basemap authorization problem remains separate from the
verified route overlay.

The browser initially caught a closed-panel reactive loop caused by clearing
selection reading journey state during the panel lifecycle effect. Clearing now
short-circuits before reading journey state; the subsequent full live flow passed
without page errors. All 23 focused tests pass, covering inclusive/leg-local
ranges, invalid indices, arrival geometry, hover/focus lifecycle, independent
highlight updates, style restoration and cleanup alongside existing routing
checks. Focused Biome passes. The full check still reports 6 errors/21 warnings
outside the routing changes. No production app deployment or commit was made.
