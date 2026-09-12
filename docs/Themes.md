# Themes and panel composition

The application uses Tailwind v4 semantic tokens in `src/lib/styles/themes.css`.
Runtime `[data-theme]` scopes select the palette; `@theme inline` exposes utilities.

| Theme     | Identifier        | Appearance                           | Default            |
| --------- | ----------------- | ------------------------------------ | ------------------ |
| Nullspace | `hype-dark`       | Pink, lavender and mint on ink       | All other hubs     |
| Oblivion  | `hype-light`      | Berry, violet and teal on pale lilac | Explicit selection |
| Milque    | `breadline-light` | Coral, navy and teal on warm cream   | `breadline.hk`     |
| Rye       | `breadline-dark`  | Coral, aqua and wheat on dark green  | Explicit selection |

Breadline palettes draw from the coral, aqua and navy on
https://hkfoodworks.com/breadline-app/. Milque deepens the coral for readable text;
Rye uses lighter accents for contrast on dark surfaces.

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

## Preview

- `/themes`: interactive component studio with local sample rows, search, selection,
  a collection card, action buttons, status/progress and a four-palette comparison.
- `/admin/styles/button`: existing button showcase with a local theme picker.

Preview selection is local and does not overwrite Settings. Navigation across the
standalone studio uses full document navigation so the application bootstrap remains
independent of sample data. No offline resource cache is required.
