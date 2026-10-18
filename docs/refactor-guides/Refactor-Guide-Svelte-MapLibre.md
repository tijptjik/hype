# Svelte MapLibre migration review

Reviewed 2026-09-12. Status: implementation complete; focused checks pass and the repository-wide typecheck remains baseline-heavy outside mapping.

## Direction

Use `svelte-maplibre-gl` for map, marker, and control lifecycle. Share one prop-driven rendering foundation between the application map, location editor, task map, animated backgrounds, and headless previews. Give each rendered map its own controller and keep application decisions in adapters at the consumption boundary, following `docs/Components.md`.

Preserve current map styling, marker treatments, navigation, editing, and camera behavior. Correct lifecycle and synchronization defects during the migration. Existing unrelated Breadline work is outside this change.

Images do not require DOM markers in MapLibre: a canvas symbol layer can render a
registered image through `icon-image`. The current marker treatment still needs DOM
elements because each feature can use an arbitrary transformed image URL and the UI
relies on CSS masks, gradients, shadows, hover/selection classes, fade transitions,
dragging, and marker-to-card element geometry. Moving those markers to canvas would
require an image registration/cache, feature-state styling, and a separate transition
geometry bridge, so this migration keeps DOM markers while keeping their instances
inside the renderer.

## Dependency and delivery decision

The released `svelte-maplibre-gl@2.2.1` declares Svelte `>=5.0.0` and MapLibre `^5.19.0 || ^6.0.0` peer dependencies, compatible with this checkout's Svelte 5 and MapLibre 6.9 dependencies.

The package constructs maps and controls from its own `maplibre-gl` import. It does not accept an injected runtime namespace. The application now uses the dependency-locked MapLibre runtime, CSS, and worker asset; `svelte-maplibre-gl/vite` supplies the worker URL integration, and the headless renderer calls `loadMapLibre` before capture.

Upstream release sources reviewed:

- [Package metadata](https://github.com/MIERUNE/svelte-maplibre-gl/blob/svelte-maplibre-gl%402.2.1/svelte-maplibre-gl/package.json)
- [MapLibre component](https://github.com/MIERUNE/svelte-maplibre-gl/blob/svelte-maplibre-gl%402.2.1/svelte-maplibre-gl/src/lib/map/MapLibre.svelte)
- [Repository](https://github.com/MIERUNE/svelte-maplibre-gl)

## Current surfaces

| Surface | Current implementation | Migration contract |
| --- | --- | --- |
| Main application | `MapCanvas.svelte`, 860 lines | Selected features, project styles, card transitions, panel offsets, URL camera, geolocation, controls, layer prompt |
| Location editor | `Maplet.svelte`, 370 lines, through `FormMapSection` | Draggable coordinates, initial user-location center, address marker, localized admin style, collapse/fullscreen callbacks |
| Task location | `TaskMap.svelte` through `Maplet` | Read-only marker, task style, fullscreen transition and Escape handling |
| Authentication and screensaver | `FlightSurface` through `AppLanding` and `MapCanvas` | Local orbit animation, reduced pixel ratio, disabled interaction, screensaver targets and duration |
| Project/layer image renders | `HeadlessMapRenderCanvas.svelte`, 288 lines | Explicit payload, token forwarding, feature crop, marker images, render-ready protocol |
| Style image renders | `headless/map-style-render/[style]/+page.svelte` | Explicit camera query overrides, noninteractive rendering, capture settings, render-ready protocol |

`GuestProfileMapBackground` uses a static image and canvas effects; `VisualSectionMap` provides layout. They do not construct MapLibre maps.

## Review findings

1. **Map ownership is shared accidentally.** Both `MapCanvas` and `Maplet` assign `appCtx.map`. Task fullscreen, feature creation, orbit animation, and camera helpers can consequently target the wrong map. Map lifecycle callbacks also reread that shared slot. Independent maps need independent handles and cleanup.
2. **Rendering depends on application contexts.** `MapCanvas` reads app, omni, responsive, routing, and preference state. `Maplet` reads app/admin state. Headless rendering manufactures app/omni contexts to reuse the main renderer. These dependencies belong in adapters.
3. **Marker instances are application state.** `appCtx.state.markers` holds MapLibre objects, while app selection mutates their DOM classes. Omni card transitions retrieve marker elements from this cache. Move instances into the renderer; pass selected/highlighted IDs as data and retain an explicit element handoff for transition geometry.
4. **Marker reconciliation has correctness defects.** An unchanged image/theme signature skips coordinate updates. A pending 300ms removal can delete a marker reintroduced by filtering. Replacing a marker can discard active/highlighted classes. Declarative identity, coordinates, and presentation should update independently.
5. **Style behavior is inconsistent.** The main map refetches on locale change without forwarding locale; the editor builds a localized style. Consolidate style resolution, locale/no-label transformation, background color, cancellation, and retry behavior. Apply resolved styles through the upstream component's `style` prop so it preserves component-owned sources/layers.
6. **Geolocation patches private fields.** The main map overwrites `_updateCamera`, clicks `_geolocateButton`, creates another position watcher, and nests a load listener inside load. Separate user location state and initial-camera policy from the control, using public APIs. Retain the existing Hong Kong restriction and explicit-camera priority.
7. **Navigation extends MapLibre's prototype.** The custom `cached*` camera and tile-precaching methods were removed; camera commands now use the normal MapLibre instance API.
8. **Preview readiness is not reliable.** Existing paths can announce success after load errors/timeouts; marker image waits can hang. Keep the existing ready selector and global flag for successful renders, with bounded waits and explicit failure reporting.
9. **Editor camera intent is global and contradictory.** `Maplet` forces `zoomToMarkerOnly = true` immediately before testing its inverse. Model editor camera intent locally and preserve the observed marker-follow behavior; fitting both coordinates is not established behavior.
10. **Unused and mixed responsibilities obscure the API.** `bottomInset` is accepted but unused; orbit animation lives among geospatial search helpers; map styles/control styles and marker DOM rules span broad modules. Remove obsolete surface area and group functionality by responsibility.

## Proposed boundaries

| Location | Responsibility |
| --- | --- |
| `src/lib/bits/custom/map/` | Domain-free `MapSurface` wrapper around the upstream component; lifecycle, sizing, children, and event forwarding |
| `src/lib/bits/patterns/maps/` | Application adapter (`MapCanvas`), editor/task composite (`Maplet`/`TaskMap`), and headless preview rendering |
| `src/lib/bits/patterns/forms/formMapSection/components/MapPrimitive.svelte` | Admin preference/navigation adapter for the editor map |
| `src/lib/map/` | Instance controller; camera/orbit lifecycle; style resolution; preview settling; and marker rendering |
| `src/lib/styles/map.css` | MapLibre canvas, user-location, and control overrides |
| `src/lib/styles/map-markers.css` | DOM marker presentation, themes, and transitions |

Routes/layouts instantiate the application and task adapters. Task/editor/preview maps receive or create local handles; mounting them never replaces the main map handle. `MapCanvas` binds the application handle only when its `bindAppMap` adapter flag is enabled, so `FlightSurface` can host an isolated orbit map. Components inside the upstream map can use its own map context for low-level composition.

## Proposed control API

Use component props for configuration and data: resolved style, features/markers, selected/highlighted IDs, interaction flags, initial camera, rendering quality, and callbacks. Use an instance controller for imperative camera actions:

```ts
controller.getCamera()
controller.flyTo({ center, zoom, duration })
controller.easeTo({ center, offset, duration })
controller.jumpTo({ center, zoom, bearing, pitch })
controller.fitBounds(bounds, { padding, maxZoom, duration })
controller.resize()
controller.stop()
const stopOrbit = controller.startOrbit({ center, radiusKm, durationMs })
```

Expose observable lifecycle state (`initializing`, `ready`, `error`, `disposed`) and camera changes. Reject or safely discard commands after disposal; do not retain commands that could execute against a replacement map. Explicitly define readiness behavior in the controller contract and tests.

Keep native MapLibre access internal to rendering integrations. A narrow `getMarkerElement(id)` transition bridge can support Omni's existing fallback while marker click callbacks supply their source element directly. Do not reproduce the entire native MapLibre API in a new abstraction.

Domain actions such as focusing a feature or fitting visible results remain in the app adapter: they resolve resources and responsive padding before calling the controller. New-feature placement reads the main controller's camera. The editor uses its local camera. Styles flow through component props, rather than direct native `setStyle` calls.

Avoid competing camera ownership: upstream bound camera props update with `jumpTo`, so animated commands must not be overwritten by effects that continuously reapply an initial or stale camera.

## Behavior and verification

- Preserve main camera defaults, min zoom 9, opt-in `mapTracking=true` query round trips, unrelated query parameters, and camera priority for feature links and tracked URLs over the first GPS fix.
- Preserve marker image/dot modes, project palette, eager image loading, fade/hover states, selected/highlighted combinations, `data-type="marker"`, `data-feature-id`, and marker-to-card source-element geometry.
- Preserve background-click dismissal order: card, then search tray, then panels. Preserve the layer-selection prompt.
- Preserve portal placement after scroll, description-expansion suppression, resize/scroll recentering, and panel compensation. Test simultaneous panel/card changes rather than camera helpers alone.
- Preserve editor drag callbacks, read-only pins, initial camera, address comparison marker, style/locale changes, collapse preference, fullscreen, and subsequent coordinate updates.
- Preserve background orbit duration and render quality settings, and stop animations when their map unmounts.
- Preserve headless token forwarding, empty-feature Hong Kong bounds, single-point zoom 16, multiple-feature 5% padding/max zoom 16, and style-render camera overrides.
- Preserve `#map-style-render-ready[data-ready="true"]` and `window.__HYPE_MAP_STYLE_PREVIEW_READY__` for successfully settled frames. Cover timeouts, bad images, and failed styles.
- Add focused tests for ownership/teardown, marker coordinate and filter races, camera URL parsing, style request cancellation, and render settlement. Existing style and render planning tests remain relevant.
- Run browser checks with the installed Playwright package and Bun. Start the app on `127.0.0.1:4173` with the repository command and use Chromium's `--disable-web-security` for local map assets. Verify simultaneous maps, editing, navigation, card placement, style changes, fullscreen, and all preview types. Inspect worker/style/TileJSON/tile/glyph/sprite/image requests and console errors. Stop the check-owned server afterward.
- Run the build, inspect server/client mapping assets, and compare typecheck diagnostics against the captured baseline. Test success is not browser proof.

## Implementation sequence

1. Resolve runtime delivery; establish a single client runtime and the shared surface/controller with independently owned lifecycle.
2. Migrate editor/task maps and both preview implementations to local map handles and shared style/marker behavior.
3. Migrate the main map and background maps, extracting app policies and moving callers to the controller.
4. Replace global marker instances and prototype patches with declarative state, explicit element handoff, and normal camera APIs.
5. Complete focused tests and build/typecheck comparison; browser verification remains the final environment-dependent check.

## Verification after implementation

- Focused map tests: **74 tests passed across 10 files** (active style, feature queries, markers, style runtime, render planning/storage/jobs, deep links, and style catalog).
- Full suite baseline: **1,638 tests passed across 155 files**. A later run had one transient timing failure in `feature-query-integration.test.ts`; its isolated rerun passed all 9 tests.
- `bun run check` reports no diagnostics in the migrated map components, while the repository still reports **993 existing type errors and 17 warnings in 176 files** outside this mapping work. Retained output: `/tmp/hype-check-final-map.log`.
- Bounded map-event and marker-image waits are shared in `src/lib/map/render-readiness.ts`; headless render generations discard stale completions after payload or style changes.
- Browser rendering and generated-image capture still require the repository's Playwright environment and external tile access.
