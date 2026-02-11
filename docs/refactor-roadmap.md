# Refactor Roadmap

## Scope
This document tracks the multi-phase refactor of UI, forms, and supporting libraries.

Current strategic goals:
- Migrate forms from `sveltekit-superforms` to SvelteKit remote function `form` calls.
- Build new UI with Bits UI primitives and phase out DaisyUI usage.
- Continue Tailwind v4 + DaisyUI v5 migration safely while legacy UI remains.

Related checklist: `docs/refactor-todo.md`

## Principles
- Keep behavior stable while migrating implementation.
- Use incremental PRs by feature area, not one large rewrite.
- Keep legacy and new UI imports clearly separated in mixed files:
  - `// BITS COMPONENTS`
  - `// COMPONENTS`
- Store new Bits-based components under `src/lib/bits`.

## Phases

### Phase 1: Foundation (in progress)
- Tailwind v4 config moved to CSS-first (`src/lib/styles/app.css`).
- DaisyUI v5 theme config aligned with Tailwind v4.
- Font loading moved to `<svelte:head>` and locale-specific CJK fonts loaded conditionally.
- Guardrails added for post-migration UX regressions (pointer cursor, button border defaults).

### Phase 2: Forms Migration
- Identify all `sveltekit-superforms` usage by route/feature.
- Replace with SvelteKit remote functions `form` call patterns.
- Keep validation and error UX equivalent.
- Add tests for submission success/error flows where missing.

### Phase 3: Component Migration (Bits UI)
- Build new primitives/components in `src/lib/bits`.
- Migrate feature UIs progressively from DaisyUI to Bits UI.
- Keep legacy components functional until parity is reached.

### Phase 4: Dependency and Styling Cleanup
- Remove dead CSS/classes and old framework-specific overrides.
- Remove unused DaisyUI dependencies when migration completes.
- Confirm no regressions in map, filters, and admin flows.

## Workstreams from Previous Cursor Checklist
- Svelte modernization:
  - Evaluate async branch guidance: https://github.com/sveltejs/svelte/discussions/15845#discussioncomment-13456944
  - Evaluate `@attach` migration path: https://svelte.dev/docs/svelte/@attach
  - Continue using `<svelte:boundary>` where async/error boundaries are beneficial.
- Icon system:
  - Evaluate Iconify/unplugin-icons for SvelteKit:
    - https://github.com/unplugin/unplugin-icons/tree/main/examples/vite-svelte
    - https://github.com/unplugin/unplugin-icons/tree/main
    - https://icones.js.org
    - https://iconify.design
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
