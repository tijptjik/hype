# Volunteer map presentation

Tracking: [map discovery #199](https://github.com/tijptjik/hype/issues/199),
[volunteer parent #182](https://github.com/tijptjik/hype/issues/182).
Requirements: [Breadline v4 specification](../breadline.v4.spec.md), Views → Map Styles.

## Day Runner and Night Runner

`breadline-light` is displayed as Day Runner; `breadline-dark` is Night Runner.
Their saved style IDs stay stable. The existing `breadline` style remains available
as Breadline Classic. Its
Milque palette follows `src/lib/styles/themes.css`: cream land, peach buildings,
pale teal water, paper roads and muted teal labels. Ordinary basemap POIs are
removed; station names and MTR-logo entrance badges remain, with actual exit references
below each logo. The transit symbol differs from bakery availability markers and
their status rings.
The sprite includes normal and double-resolution assets. Night Runner preserves
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
