# Map Styles

Built-in map styles are code-defined, generated into static JSON artifacts, optionally
rendered into preview PNGs, and then synced into D1 so projects can assign them.

## Files That Matter

- `src/lib/map/styles/definitions/*.ts`
  - Each built-in style definition returns a `StyleSpecification`.
- `src/lib/map/styles/catalog.ts`
  - `MAP_STYLE_CATALOG` is the source of truth for available styles.
  - `REGISTERED_MAP_STYLE_CATALOG` is the subset that gets persisted and exposed for
    project assignment.
- `src/lib/map/styles/i18n.ts`
  - Provides localized catalog copy used by admin UI and DB sync.
- `src/lib/types.ts`
  - `MapStyleCatalogKey` must include the new style key.
- `static/mapStyles`
  - Generated immutable JSON artifacts plus `manifest.json`.
- `scripts/generate-map-style-renders.ts`
  - Generates preview PNGs for registered styles.
- `scripts/sync-map-styles.ts`
  - Syncs registered styles and their i18n rows into D1.

## Adding A New Built-In Style

1. Add a definition file under `src/lib/map/styles/definitions`.
2. Import that builder into `src/lib/map/styles/catalog.ts`.
3. Add a `MAP_STYLE_CATALOG` entry.
4. Add localized copy in `src/lib/map/styles/i18n.ts`.
5. Add the key to `MapStyleCatalogKey` in `src/lib/types.ts`.
6. Add translation messages in `messages/en.json`, `messages/zh-hans.json`, and
   `messages/zh-hant.json`.
7. Add or update tests in `src/tests/map-styles.test.ts`.

If a style should be assignable by projects, it must remain inside
`REGISTERED_MAP_STYLE_CATALOG`. Setting `register: false` keeps it buildable in code but
prevents DB sync and project selection.

## Artifact, Preview, And DB Registration Flow

After code registration, run these commands:

```sh
bun run i18n:build
bun run build
bun run render:map:styles
bun run db:sync:map:styles:local
```

What each command does:

- `bun run i18n:build`
  - Regenerates compiled Paraglide message accessors after message-key changes.
- `bun run build`
  - Runs the map-style artifact plugin, which rebuilds `static/mapStyles/*.json` and
    `static/mapStyles/manifest.json`.
- `bun run render:map:styles`
  - Generates preview PNGs for every registered style.
- `bun run db:sync:map:styles:local`
  - Upserts `mapStyles` and `mapStyleI18n` rows from `REGISTERED_MAP_STYLE_CATALOG`.

Use the matching sync target when promoting a style beyond local development:

```sh
bun run db:sync:map:styles:preview
bun run db:sync:map:styles:prod
```

## Project Assignment

Projects do not discover styles from `static/mapStyles` directly. Project assignment
depends on the persisted `mapStyles` table, which is populated by
`scripts/sync-map-styles.ts`.

That means a style becomes project-assignable only after both are true:

- It is registered in `REGISTERED_MAP_STYLE_CATALOG`.
- The relevant `db:sync:map:styles:*` command has been run against the target database.
