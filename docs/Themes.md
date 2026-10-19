# Themes and panel composition

The application uses Tailwind v4 semantic tokens in `src/lib/styles/themes.css`.
Runtime `[data-theme]` scopes select the palette; `@theme inline` exposes utilities.

| Theme     | Identifier        | Appearance                           | Default            |
| --------- | ----------------- | ------------------------------------ | ------------------ |
| Nullspace | `hype-black`      | Pink, lavender and mint on true black | All other hubs     |
| Nebula    | `hype-dark`       | Pink, lavender and mint on ink       | Explicit selection |
| Oblivion  | `hype-light`      | Berry, violet and teal on pale lilac | Explicit selection |
| Milque    | `breadline-light` | Peach-forward blue, teal and coral on warm cream | `breadline.hk`     |
| Rye       | `breadline-dark`  | Aqua, salmon and sky blue on deep blue-green | Explicit selection |

Breadline palettes draw from the blueberry, frosting blue and peachy orange on
https://hkfoodworks.com/breadline-app/. Milque uses the Peach-forward direction for
light mode: blueberry structure, frosting teal support, and peach coral emphasis. Rye
keeps its own brighter aqua, salmon, and sky-blue order for dark surfaces. The source
swatches and experiments are documented at `/themes/colours`.

## Tokens and selection

Use `canvas` for the outer background, `panel` for a panel/card, `surface` for inset
controls, and `raised` for selected rows. Use `base-content`, `muted-foreground`,
`border` and `focus` for text and interactions. `primary`, `secondary`, and
`tertiary` describe the three identity accents. Filled controls must use the matching
`*-content` token for labels. Existing `accent` maps to tertiary. Status tokens remain
independent of identity accents.

The server resolves the validated `hype-theme` cookie before the hub default, so
returning users get the selected palette in the initial HTML. The root theme model
applies Settings changes immediately and mirrors the UI theme in localStorage and a
one-year host-scoped cookie. A small startup script restores validated localStorage
appearance before styles paint; the cookie supplies the server-rendered fallback.

The account owns `userPreferences.theme`: `uiTheme`, `mapStyle`, `syncUiAndMap`,
and `useActiveMapStyle`. The root layout restores these on login even when Settings
is closed, replacing browser caches with saved account choices. Accounts without
saved appearance settings adopt the current browser choices once. Explicit changes
made while preferences load take precedence over that older response. Failed reads
never migrate browser settings over unknown account preferences.

Appearance writes patch only `$.theme` in the existing preferences JSON, preserving
language, admin and other keys without a database migration. Writes are serialized,
and account identity is checked both locally and against the server session. Resource
map overrides remain transient and are not saved as the preferred map style. Browser
storage is a startup cache and offline fallback; synchronization errors leave the
local choice intact and show a notification. This is separate from domain-resource
offline caching.

## Component styling

Keep layout, spacing, typography and simple states in inline Tailwind utilities.
Use `cx()` when conditional utilities or caller classes need to override defaults;
keep large style maps in a colocated `component.styles.ts` file. Do not add semantic
classes just to name a bundle of utilities.

`themes.css` owns global palette aliases, component color aliases and shared shadow
variables at `:root` and every `[data-theme]` boundary. The legacy `glass-*`, `ok`
and `pending` colors now derive from that palette, so nested previews and runtime
selection use the same theme. `bits-theme` remains a scoped base/focus treatment;
it is no longer required to make theme variables available.

Shared component CSS retains selectors with coupled state, measurement or responsive
behavior, plus effects that are clearer in CSS. Check their cascade before moving a
base rule: an inline utility can override a modifier still in `@layer components`.

## Admin surfaces

The admin shell uses one composition token, `--admin-background`. Nullspace keeps
its saturated rose-to-fuchsia gradient. Nebula blends deep violet and rose with a
turquoise glow; Oblivion uses luminous rose, lilac and mint; Milque blends cool frosting blue
and teal behind its warm peach cards; Rye pairs ocean blue and teal with a coral glow.
Each composition mixes existing palette colors into the canvas, with lighter or
deeper stops to suit its foreground. The token is declared at every theme boundary,
so nested previews do not inherit another palette's background.

Headers, menus and dialogs use `panel`; action rails use `surface` and `raised`.
Translucent cards retain the shared `glass-*` aliases. Four shared form roles
(`--form-control-fill`, `--form-control-edit-fill`, `--form-control-border` and
`--form-label`) default to palette-derived colors. Nullspace overrides these with
its original translucent rose fills and creamy labels, keeping fields from turning
black over its vivid canvas. `--theme-glass-panel` preserves its original warm
translucent card fill, while `--theme-glass-field` retains the muted rose used by
selects and field-header borders. Other themes derive these from their panel and
surface colors. The Nullspace
gradient uses OKLab interpolation, matching the original Tailwind gradient.
Control text uses `foreground`.
Scope badges pair existing semantic colors with a lightly tinted panel background.
These rules also cover feature editing, task review and analytics. Fixed dark
scrims and photographic overlays remain independent of the UI palette.

## Preview

- `/themes`: interactive component studio with local sample rows, search, selection,
  a collection card, action buttons, status/progress, a five-palette comparison, and
  a local live colour sandbox.
- `/themes/colours`: Milque colour study showing the original Breadline swatches,
  revised semantic tokens, and side-by-side component applications.
- `/admin/styles/button`: existing button showcase with a local theme picker.

Preview selection is local and does not overwrite Settings. Navigation across the
standalone studio uses full document navigation so the application bootstrap remains
independent of sample data. No offline resource cache is required.

## Settings hierarchy and map styles

Theme is a peer of Language in Settings. Its UI subsection uses the palette picker;
its Map subsection displays the registered public map styles using their rendered
`/api/mapRenders/styles/{code}/asset` previews. An explicit map choice overrides the
active project's style and persists in host-local browser storage as
`hype-map-style`. Selecting the automatic option restores the active map's style.
“Sync UI & Map Styles” pairs Nullspace and Nebula with Hyper Dark (`hyper`),
Oblivion with Hyper Light (`hyperLight`), Milque with Day Runner (`breadline-light`)
and Rye with Night Runner (`breadline-dark`). Enabling sync applies the pairing
immediately. The preferred map persists as `hype-map-style`, sync as
`hype-sync-ui-map-styles`, and following resource styles as
`hype-use-active-map-style`. The two switches are independent and can both be on.

With both enabled, the most recent relevant change controls the map: changing the
UI theme applies its pairing; changing layers/projects applies that resource's
style. An unchanged resource context never undoes a later UI choice. A layer set
to **User Preference** uses the preferred map instead. Disabling resource styles
immediately returns to the user preference; disabling sync retains the preferred
map without changing it on later UI theme changes. Selecting a map card manually
turns off both automatic modes.

Layer editors offer a specific style, **Project Default**, or **User Preference**.
The override persists in the existing layer metadata: an absent `mapStyleCode`
inherits the project, a catalog code selects a style, and `null` selects User
Preference. Existing layers retain project inheritance; new layers default to User
Preference. Project editors also allow User Preference by clearing their existing
map-style assignment. No database migration is required. Shared layer thumbnails
use the explicit layer style, the inherited project style, or default Etch for
User Preference; the live map resolves the viewer's actual preference.

## Hyper basemaps

Hyper Dark (`hyper`) and Hyper Light (`hyperLight`) use the selected **Etch**
composition: fine building outlines, sparse uppercase place names, thin road
hierarchies, dashed rail and mint/teal coastlines. Hyper Dark follows Nullspace
with near-black land, violet footprints and rose roads. Hyper Light follows
Oblivion with pale lilac land, berry linework and teal coastlines. Neither style
includes POIs. Street names use a brighter foreground and a stronger halo.
Building names appear from zoom 18 using the shared OSM interior-point dataset;
building numbers appear from zoom 19 using the vector tiles' address points.
Both yield to label collisions, and label-free maps omit the building-name source.

`src/lib/map/styles/definitions/etch.ts` owns the shared composition, authored
directly against SaanSeoi's vector schema without Protomaps-generated layers.
`hyper.ts` and `hyperLight.ts` supply the two treatments. Locale selection and
label-free variants remain supported. The existing catalog IDs are retained so
saved map selections and UI/map synchronization continue to work.

Generated static assets and preview hashes follow the style content. Regenerate
the two thumbnails after style changes so the picker uses the current treatment.

Ghostery Legacy, Neonmaster, Genesis, Sin, Rosé Punk and Breadline Classic are
retired from theme and project style pickers. Their catalog entries remain registered to support saved maps.

Four POI-free design studies are defined in
`snippets/map-styles/hyper-directions/styles.ts`: Velvet (luminous route ribbons),
Petal (graphic colour blocks), Etch (fine cadastral linework) and Prism (saturated
poster geometry). Each has a Nullspace and Oblivion treatment. These studies
construct their own layers directly against the SaanSeoi vector schema, without
Protomaps-generated layers. Velvet, Petal and Prism remain exploratory directions; Etch is now
the Hyper Dark/Light composition. The studies are not additional picker options.

Default marker rings follow the chosen **map style**, independently of the app UI.
Hyper Dark uses a thin warm-white ring and muted rose interactions; Hyper Light
uses violet rings and berry interactions. Other dark/light map palettes use the
corresponding dark/light ring treatment. Rings remain solid and stable during panning.

Explicit layer palettes take precedence over project palettes, and every explicit
project palette takes precedence over the map default. A layer set to User Preference
uses the chosen map's default marker; an older layer without an override inherits
its project palette. Unassigned projects also use the chosen map's default.
Layer and project choices resolve from retained cache entries, including resources
outside the current page of results. Palette variables live in
`src/lib/styles/map-markers.css` and do not read UI theme tokens.

Building outlines interpolate smoothly from 0.45 px at zoom 14 to 1 px at zoom 18,
1.5 px at zoom 20 and 2 px at zoom 22.

Marker appearance is stable during camera movement: solid rings and unblurred
separators replace decorative glows, and the map no longer toggles marker styling
on movement start/end. Selection, highlights and hover remain interactive states.
