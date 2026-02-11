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
