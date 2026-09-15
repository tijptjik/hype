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
applies Settings changes immediately and stores a one-year host-scoped cookie.
This is a device/browser preference, separate from domain-resource offline caching.

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
The UI palette and map style remain independent preferences.
