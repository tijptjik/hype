# Volunteer map presentation

Tracking: [map discovery #199](https://github.com/tijptjik/hype/issues/199),
[volunteer parent #182](https://github.com/tijptjik/hype/issues/182).
Requirements: [Breadline v4 specification](../breadline.v4.spec.md), Views → Map Styles.

## Day Runner and Night Runner

`breadline-light` is displayed as Day Runner; `breadline-dark` is Night Runner.
Their saved style IDs stay stable. The existing `breadline` style remains available
as Breadline Classic. Its
Milque palette follows `src/lib/styles/themes.css`: cream land, peach buildings,
pale teal water, paper roads and muted teal labels.
Pedestrian paths, steps and footbridges use softened burnt coral (`#d5a084`) in Day Runner
to bring walking connections forward against the cream and peach background.
Ordinary basemap POIs are removed; station names and MTR-logo entrance badges remain, with actual exit references
below each logo. The transit symbol differs from bakery availability markers and
their status rings.
The sprite includes normal and double-resolution assets. Full icon/reference badges participate in collision
placement, with labels trying four sides of the entrance. Specific references
(e.g. D3) take priority over single-letter concourse markers. A small point keeps
every entrance location visible when its full badge cannot fit; zooming in
reveals more badges. Street names repeat at 500 px rather than 750 px (50% more
frequent native placement). When a name cannot fit, the placement controller
tries road-section midpoints and progressively offset positions along the line,
keeping MTR signs fixed. Each round excludes street names already visible, so
fallback layers do not add copies of names already placed by earlier layers.
The search resets after camera/style changes and stops after its bounded candidate
list; a name can still be hidden when none of its positions fits.

Shopping malls and department stores appear from zoom 15, and other named
buildings from zoom 17. The tiles omit building names, so a bundled OSM overlay
supplies interior label points for 35,383 named buildings and shopping landmarks
(including 590 malls/department stores). Matching containing-building labels are
suppressed near a mall with the same name. Labels use available localized names
and collision-aware placement; ordinary shop POIs remain hidden. Source and
regeneration details are in `static/mapData/README.md`.
The same policy applies to the dark style. Night Runner preserves
the transit overlay with a dark teal palette and warm labels. Both are featured
in the expanded map-style picker alongside Hyper, Hyper Light, Hyperpop and
SaanSeoi Midnight; Show more reveals the remaining styles.

Bakery High / Medium / Low / None tiers, white statistical estimate rings,
volume-accent reported estimate rings and claimed states remain application
markers. Drop-off markers should use a distinct destination shape. Neither live
availability nor drop-off locations are baked into the basemap. This change does
not implement the event filtering, marker states or cards tracked by #199.

The live Hong Kong tile source uses `pois.kind=subway_entrance` but omits exit
references. A bundled OSM entrance layer now supplies 648 entrances, including
624 current references, from the 2026-10-01 Hong Kong source extract. Entrances
appear from zoom 15. Labels retain actual `ref`, `local_ref` or `loc_ref` values;
unnumbered entrances remain blank, and former references are never revived.
See `static/mapData/README.md` for provenance, licensing and regeneration.
The overlay can be retired once equivalent reference coverage is in the tiles.

## Verification

- MapLibre style validation and focused catalogue/runtime tests.
- Live Mong Kok render through `/headless/map-style-render/breadline-light`,
  including the custom sprite, with no browser page errors.
- Preview: `output/playwright/breadline-light.png` (local artifact).
- Registered in local D1 with all three catalogue locales. Deployment and remote
  catalogue sync follow the existing release process.
