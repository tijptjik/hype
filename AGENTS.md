# Repository Guidelines

## Documentation

- Authorisation Design is defined in `docs/specs/Design-Spec-Authorization.md`
- Authorisation Roles are defined in `docs/auth/Roles.md`
- Authorisation Function order is defined in `docs/refactor-guides/Refactor-Guide-Authz-Function-Ordering.md`
- Component architecture and boundary rules are defined in `docs/Components.md`

### Naming and Path Conventions

- Svelte components: `PascalCase.svelte` in `src/lib/bits/...` - see `docs/Components.md` for rules.
  - `core/`: wrappers over `bits-ui` primitives.
  - `custom/`: app-owned components with Bits-compatible APIs.
  - `patterns/`: composed components built from `core` and `custom`.
- Route files follow SvelteKit conventions (`+page.svelte`, `+server.ts`).
  - `+page.ts` are dropped in favour of svelte remote functions.
  - Remote functions are stored in `src/api/server/<resourceType>.remote.ts`
- Keep domain service modules grouped by entity (`src/lib/db/services/feature.ts`, etc.).

### Comments

- ALWAYS preserve existing comments when editing code; update wording if behavior changes instead of deleting useful context.
- ALWAYS use standard JSDoc for exported functions and remote APIs: include `@param`, `@returns`, and `@remarks` where behavior constraints matter.
- For service modules and route modules:
  - ALWAYS add JSDoc to exported functions and non-trivial file-local helpers.
  - ALWAYS add a concise one-line comment immediately above the block of a complex operation so the intent is scannable before reading the implementation.
  - WHEN they are multiple logical sections, add a file-level TOC comment that follows the repository TOC convention in `docs/Components.md`.
- Imports:
  - Keep import blocks grouped by section comments such as `// SVELTE`, `// I18N`, `// BITS COMPONENTS`, `// COMPONENTS`, `// TYPES`, `// DB`, `// API`, `// DRIZZLE`.
  - Order imports by: framework first, then third-party, then project/library imports, then type imports.

### Styling

- Use inline Tailwind utility classes for light styling.
- Use a colocated `{component}.styles.ts` when the styling becomes heavy. Break the styles up into readable, logical chunks based on their domain and combine them with `cx()`
- NEVER add semantic wrapper classes.
- Use shared CSS in `src/lib/styles/*.css` under `@layer components` only for genuinely reusable theme tokens, CSS variables, cross-component states, or styling that cannot be expressed cleanly inline.

### Browser UI verification (Playwright)

- Use the installed `playwright` package directly with Bun for manual UI checks; do not add a dependency solely for this.
- Start the app with `bun run dev -- --host 127.0.0.1 --port 4173`, then stop it after the check.
- Launch Chromium with `args: ['--disable-web-security']` for local map verification: the development origin otherwise cannot load the external map tiles because of CORS.

## Package and Library specific instructions

- `ts` TypeScript guidance:
  - Prefer explicit return types for exported functions and non-trivial functions.
  - Use type guards/type predicates for runtime narrowing where needed.
  - Prefer discriminated unions for complex state machines.
  - Use utility types (`Partial`, `Readonly`, `Pick`, etc.) and `as const` for enum-like constants.
  - Add new TypeScript types in `src/lib/types.ts`, not inline in feature files.
  - Place new types under the correct existing heading in `src/lib/types.ts` (usually resource-based or domain-based) so related type changes can be reviewed together.
