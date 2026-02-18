# Refactor Roadmap

## Scope
This document tracks the multi-phase refactor of UI, forms, and supporting libraries.

Current strategic goals:
- Migrate forms from `sveltekit-superforms` to SvelteKit remote function `form` calls.
- Build new UI with Bits UI primitives and phase out DaisyUI usage.
- Continue Tailwind v4 + DaisyUI v5 migration safely while legacy UI remains.

Related checklist: `docs/refactor-todo.md`
Resource cache architecture: `docs/Resource-Cache-Architecture.md`

## Principles
- Keep behavior stable while migrating implementation.
- Use incremental PRs by feature area, not one large rewrite.
- Keep legacy and new UI imports clearly separated in mixed files:
  - `// BITS COMPONENTS`
  - `// COMPONENTS`
- Store new Bits-based components under `src/lib/bits`.

## Phases

### Phase 1: Foundation
- [x] Tailwind v4 config moved to CSS-first (`src/lib/styles/app.css`).
- [x] DaisyUI v5 theme config aligned with Tailwind v4.
- [x] Font loading moved to `<svelte:head>` and locale-specific CJK fonts loaded conditionally.
- [x] Guardrails added for post-migration UX regressions (pointer cursor, button border defaults).

### Phase 2: Forms Migration (`in progress`)
- Identify all `sveltekit-superforms` usage by route/feature.
- Replace with SvelteKit remote functions `form` call patterns.
- Keep validation and error UX equivalent.
- Add tests for submission success/error flows where missing.

### Phase 3: Component Migration (Bits UI) (`in progress`)
- Build new primitives/components in `src/lib/bits`.
- Migrate feature UIs progressively from DaisyUI to Bits UI.
- Keep legacy components functional until parity is reached.

### Phase 4: Dependency and Styling Cleanup
- Remove dead CSS/classes and old framework-specific overrides.
- Remove unused DaisyUI dependencies when migration completes.
- Confirm no regressions in map, filters, and admin flows.

### Phase 5: Resource Cache Unification
- Introduce `CacheCtx` as a dedicated canonical entity/query cache dependency for `AppCtx`.
- Treat Svelte remote-function cache as transport cache only.
- Introduce query-index model (ids + metadata) for active collections.
- Add stale-while-revalidate + persistence strategy (IndexedDB) for cross-session offline support.
- Start rollout with organisations only, then expand to projects/layers/features.

## Workstreams from Previous Cursor Checklist
- Svelte modernization:
  - Evaluate async branch guidance: https://github.com/sveltejs/svelte/discussions/15845#discussioncomment-13456944
  - Evaluate `@attach` migration path: https://svelte.dev/docs/svelte/@attach
  - Continue using `<svelte:boundary>` where async/error boundaries are beneficial.
- Map stack:
  - Evaluate move from current map integration to `svelte-maplibre-gl`:
    - https://github.com/MIERUNE/svelte-maplibre-gl
- Runed utilities adoption:
  - https://runed.dev/docs/utilities/use-geolocation
  - https://runed.dev/docs/utilities/on-click-outside
  - https://runed.dev/docs/utilities/textarea-autosize
  - https://runed.dev/docs/utilities/previous
  - https://runed.dev/docs/utilities/debounced
  - https://runed.dev/docs/utilities/watch
  - https://runed.dev/docs/utilities/resource

## Definition of Done
- No active feature routes depend on `sveltekit-superforms`.
- New UI work is implemented in `src/lib/bits`.
- DaisyUI usage reduced to approved legacy areas or fully removed.
- Tests cover critical form and UI state transitions after migration.
