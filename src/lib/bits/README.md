# Bits Components

This directory is the UI boundary for Bits-based work.

## Structure
- `core/`: thin wrappers around Bits UI primitives
- `custom/`: app-owned components with Bits-compatible APIs
- `patterns/`: composed components built from `core/` and `custom/`

## Import Rules
- In Svelte pages/routes, import from `$lib/bits` only.
- Do not import directly from `bits-ui` in routes/pages.
- Keep direct `bits-ui` imports inside `src/lib/bits/core` wrappers.

## Type Naming Rules
- Use `name.types.ts` for component or pattern public type files.
- Use `types.ts` only for shared internal primitive packages under `src/` (for example `custom/switch/src/types.ts`).
- Keep type file placement aligned with ownership:
  - `core/*/name.types.ts`
  - `custom/*/name.types.ts`
  - `patterns/*/name.types.ts`
- Do not introduce new generic `types.ts` files at component root level unless they are internal shared primitive contracts.
