# Component Architecture

This document defines the UI layering model for Bits components and how logic should be distributed.

## Layering

1. `src/lib/bits/custom/{componentType}/src/*`
- Lowest-level subcomponents.
- Raw HTML structure only.
- Headless by default; no app/domain coupling.
- No component-theme styles applied here.

2. `src/lib/bits/custom/{componentType}/{ComponentType}.svelte`
- Smallest complete reusable custom component.
- Composes only local subcomponents.
- Provides default classes/styles.
- Allows style extension via `class`.
- No app/domain coupling.

3. `src/lib/bits/core/{componentType}/{ComponentType}.svelte`
- Same as 2, but but built from official Bits UI primitives.

4. `src/lib/bits/patterns/{componentType}/components/*`
- Pattern subcomponents that adapt core/custom components to app usage.
- Can include conditional rendering and UI behavior.
- Should remain context-agnostic where possible.

5. `src/lib/bits/patterns/{componentType}/{ComponentType}.svelte`
- Pattern composite.
- Mostly routes nested props to pattern subcomponents.
- Minimal orchestration state only.
- Avoid direct app context coupling unless unavoidable.

6. `+page.svelte` / `+layout.svelte`
- Consumption boundary.
- Owns app wiring, state ownership, and side effects.
- Owns controller intent (for example `HeaderCtrl`) for page-level visibility/mode overrides.
- Integrates with `appCtx`/`adminCtx`.
- Builds/uses an adapter model (for example `createAdminHeaderModel`) to map app/context state into pattern props.
- Passes controlled/bindable state + callbacks into patterns via the adapter output.

## Handler Placement

- Local UI handlers:
  - Keep in component/pattern subcomponent.
  - Examples: input value forwarding, local toggle visuals, keyboard interactions.

- Domain/app handlers:
  - Keep in page/layout or adapter model.
  - Examples: filter mutations, facet changes, navigation, save/publish/delete behavior.

- Async orchestration:
  - Keep in page/layout or adapter model.
  - Examples: breadcrumb loading, URL sync, context sync, resource lookup.

## State Principles

- Prefer controlled/bindable props for pattern components.
- Keep pattern components "dumb" relative to app domain.
- Use adapters (for example `createAdminHeaderModel`) when page/layout glue becomes too large.
- Avoid hardcoded data dependencies inside reusable components; inject via props.

## Layout Component Control Pattern

- Use a page-callable controller context (e.g. `HeaderCtrl`) for per-route header visibility/behavior overrides.
- Keep the Header pattern itself stateless and prop-driven.
- Keep admin defaults in the adapter (`createAdminHeaderModel`) and merge `HeaderCtrl` overrides last.
- Enforce separation:
  - Automatic wiring (adapter): derive structural defaults from app/admin state (`activeResource`, `activeRef`, UI mode state).
  - Manual wiring (page): set programmatic header metadata (`title`, `icon`, `facets`) and per-page visibility intent via `HeaderCtrl`.
- Do not use `appCtx.state.header` as the source of truth for Bits header rendering.
- Recommended merge precedence:
  1. app/admin derived defaults
  2. adapter-level mode mapping (`auto` / `view` / `form` / `none`)
  3. page-level `HeaderCtrl.setVisibility(...)` overrides
- Place domain decisions in route/page code; keep components focused on rendering and local UI interactions.

## Pattern Styling Placement

- Prefer semantic pattern classes in component CSS files (for example `bits-pattern-*.css`) even when rules are mostly `@apply`.
- Keep these styles centralized to preserve theme scoping (`.bits-theme`), maintain layering consistency, and support future growth into variables, container queries, and non-utility CSS.
- Inline utility classes in Svelte markup only for truly local, one-off layout details that are unlikely to need reuse or theme-level overrides.

## Primitive Composition Convention

- When composing pattern or custom primitives, prefer namespaced usage: `<ComponentPrimitive.Root>`, `<ComponentPrimitive.Part>`.
- For pattern components, expose a local namespace via `components/index.ts` and import it as `import * as ComponentPrimitive from './components'`.
- This keeps composition explicit, aligns with Bits-style API shape, and avoids flat import sprawl in composites.

## Folding Regions

- Use `+++ <Region Name>` to start a fold region and `---` to end it.
- Match fold regions to the file's TOC or top-level logical sections.
- Leave one blank line before and after each region boundary line.
  - Preferred layout:
    - `// +++ Derived Header State`
    - blank line
    - section contents
    - blank line
    - `// ---`
    - `// +++ Next Header State`
- This keeps region markers visually distinct and easy to scan in the editor.

## TOC Comment Convention

- For large service/module files, start with a dedicated TOC fold region using this exact heading block:
```ts
// +++ Table Of Contents
// ═══════════════════════
// TABLE OF CONTENTS
// ═══════════════════════
//
```
- After the heading block, list numbered section labels in file order using `// <N>. <SECTION NAME>`.
- Under each section label, list function entries as `// - <functionName>`.
- Include both exported and file-local helpers when they are part of the section's navigable surface.
- Keep TOC section order aligned with the actual region order in the file.
- Close the TOC region with `// ---`.
- Preferred example:
```ts
// +++ Table Of Contents
// ═══════════════════════
// TABLE OF CONTENTS
// ═══════════════════════
//
// 1. CODE REF NAVIGATION
// - toSubmittedCode
// - shouldRedirectToSubmittedCode
// - navigateToSubmittedCode
// - createCodeRefResourceResult
//
// 2. RESOURCE EDITOR FACTORIES
// - createResourceFormConfig
// - createResourceEditorPage
// ---
```

## File Naming Convention

- Directories: use `camelCase` for component folders in `src/lib/bits/**` (for example `formI18nSection`, `inputField`, `labelPrimitive`).
- Svelte components (`*.svelte`): use `TitleCase` filenames (for example `HeaderRoot.svelte`).
- Non-component modules (`*.ts`, `*.svelte.ts`): use `camelCase` filenames (for example `useAdminHeaderModel.svelte.ts`).
- Keep SvelteKit route-convention files unchanged (`+page.svelte`, `+layout.svelte`, `+server.ts`, etc.).

## Type File Convention

- Default for component-scoped types: `name.types.ts` in the same folder as the component entry.
- Use `types.ts` only when the file is intentionally shared by multiple subcomponents in a local `src/` primitive package (for example `custom/*/src/types.ts`).
- Primitive component prop types should live alongside primitive components, typically under the same `components/` folder (for example `components/headerPrimitives.types.ts`), not in the parent composite type file.
- Primitive bundle type files should be named `<component>Primitives.types.ts`.
- Prefer naming by public component contract:
  - `button.types.ts`, `header.types.ts`, `sectionHeader.types.ts`, `formI18nSection.types.ts`.
- Placement rules:
  - `core/{componentType}/name.types.ts` for core wrappers.
  - `custom/{componentType}/name.types.ts` for custom component public APIs.
  - `custom/{componentType}/src/types.ts` only for shared internal primitive contracts.
  - `patterns/{patternType}/name.types.ts` for pattern public APIs.
- Avoid adding new plain `types.ts` files outside internal `src/` primitive folders.
- Existing inconsistent files can remain until touched; when editing or adding nearby types, migrate to this convention.
