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

## Admin marker choices (Refs #199)

The marker picker offers Photo, Dot, Country chip (`flag`) and Brand status
(`breadline`). Layers additionally offer Project Default and preview the inherited
project style. Projects have no User Choice option; an unset project displays Photo.
Pin is retired from the picker, and saved `pin` values resolve to Photo. Persisted
`flag` and `breadline` codes remain unchanged by the display-name updates.

## Donor card and marker decision (19 October 2026; Refs #199)

The main specification already defines bakery-card fields and yield/claim marker
semantics. The dedicated card is Breadline-specific and based on the full-card layout;
default HYPE cards do not render MTR data. Donor photos are shown in the card and
must not be used as map markers. Brand badges should remain visible alongside
shop identity whether or not a brand icon is also used inside the marker.

The initial styling proposal uses a small brand badge and a restrained brand-colour
header or border accent, leaving operational yield colours and status rings intact.
Brand assets/colour tokens, contrast and the finished layout remain design acceptance
work. Pickup times, availability and Claim/Unclaim require date-specific event data;
do not fabricate these values from static feature properties. The user-facing card
and marker implementation is separate from the routing-policy change; see below.


## Implemented presentation (20 October 2026; Refs #199)

The `breadline` card reuses the full card photo viewer, title, hierarchy and actions.
Its content adds a text brand badge and restrained accent, address, phone, description
and verified MTR access up to 1,000 metres. Other card styles still omit MTR.
`BreadlineRunPresentation` supplies date-specific pickup, amount and Claim/Unclaim;
the event adapter/backend remains outstanding, so no availability or claim action is
fabricated when that adapter is absent. Brand badges currently use text, not verified
commercial logos. Official assets and final colour approval remain open.

Projects and layers can select Photo, Dot, Country chip or Brand status in
admin Style settings. Layers also offer Project Default; unset projects display
Photo. Pin and User Choice are not offered. Custom providers are registered in `customMarkers.ts`,
consume feature data, and return DOM markers without modifying MapLibre. Stored
configuration selects a provider, never executable code. Country rings read `country`
labels/ISO codes and support combined countries with bundled MIT-licensed flags.
Breadline markers never use feature photos. They show brand identity, a neutral ring
when yield is unknown, operational yield/reported/claimed states when supplied, and
a distinct destination shape for the canonical drop-off layer. Date filtering and
live state delivery remain #199 acceptance work. Shared map previews use the same
saved marker choices.

Migration 0102 adds project marker configuration; 0103 selects the card and marker
only for the hkfoodworks Breadline project. Neither imports donors or runs. Browser
checks exercised desktop/mobile cards and the real DOM marker providers; focused
presentation, migration, authorisation and marker tests cover configuration and
reconciliation. Full repository typecheck still has unrelated existing errors.


## SVG brand treatments (20 October 2026; Refs #199)

Eight standalone 128-unit SVGs are available in `static/brands/breadline/` for review:
7-Eleven, Maxim’s, arôme, Saint Honore, Yamazaki, Maison Kayser, Peninsula and Garden.
They share ivory rims and restrained palettes without baking in operational state.
The requested interpretations use a clean cocoa rose, an olive egg, the app-inspired
chef outline, centred wheat, the negative Kayser monogram, a favicon-inspired P and
Garden’s chef. No raster images, external fonts or remote resources are embedded.
The eight assets were rendered and inspected at 48 px and 32 px. These files are selected by the Brand status renderer through the effective
feature brand property; the renderer does not query Place storage. Date-specific
pickup/claim integration is explicitly deferred at the user’s request.


The version 03 review extends the family to fourteen SVGs with Childhood’s rocking
horse, Harlan’s negative H, Fresh Wheat’s diagonal wheat/disc, Nibbles’ bitten loaf,
Wooloomooloo’s dotted W and Dee Dee’s spiral cat. Yamazaki and Kayser are enlarged
18% and 20% respectively for balanced visual weight. All new/revised badges were
rendered at 48 px and 32 px, with no raster/font dependencies. Runtime selection uses the same brand-property contract for stored and inherited values.


## Effective brand property contract (Refs #199, #194)

`brandIdentity.ts` maps canonical brand values and reviewed classifier labels to the
fourteen local SVGs. `customMarkers.ts` reads only the hydrated feature property:
a direct `value`, a classifier's canonical `propertyValue.value`, or its English label.
It never guesses identity from a feature title or queries Place/source tables.
Place inheritance can supply that property transparently. Brand SVGs participate in
marker invalidation signatures; failures retain a text badge, and drop-offs keep the
destination shape. Donor photos remain excluded from Brand status markers.

Admin feature-list thumbnails also prefer the resolved brand SVG, using the same
effective property contract. Features without a recognised brand retain their photo
or identicon fallback; this display choice does not replace stored feature images.

Until Place inheritance provides brand identity, migration 0106 replaces only the
generic Independent classifier on eight known imported donors, preserving explicit
overrides. The import adapter seeds the same canonical values for future imports.
This bridge is confined to import/data preparation and can be retired independently
of the renderer. The migration was rehearsed and applied locally: eight assignments,
eight values, 24 translations and the expected cache revision changed; integrity and
foreign keys pass. No other feature data or jobs changed; production is untouched.
