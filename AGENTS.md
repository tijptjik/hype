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
  - Remote functions are stored in `src/lib/api/server/<resourceType>.remote.ts`
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

## GitHub work tracking

- Breadline v4 tracker: https://github.com/tijptjik/hype/issues/178. Domain parent issues are #179–#187; use the matching parent and leaf issue for the work being changed.
- When work belongs to a tracked issue, include the issue URL or number in the branch, pull request and relevant commit message. Use `Refs #N` for partial work and `Closes #N` only when the change fully completes the issue.
- Keep implementation and acceptance TODO checkboxes accurate as evidence is produced. Link code, tests, migrations, browser checks and design decisions from the issue; leave incomplete or unverified items unchecked.
- Record blockers and scope changes on the issue. Keep the domain parent checklist and milestone counts current using completed leaf issues / total leaf issues and verified acceptance TODOs / total acceptance TODOs. Do not double-count parent issues or canceled work.
- GitHub issues, sub-issues and repository milestones are the public delivery record. Do not create or maintain a parallel progress ledger in `spec/breadline/breadline.v4.spec.progress.md`; technical specifications link to their tracking issues and document requirements and decisions.
- Use the Breadline labels and milestone assigned to the issue. Keep issue bodies public-safe: never include credentials, personal contact details or raw migration exports.
- Link each implementation to the technical domain document under `spec/breadline/proposal/` and update that document when the implementation path or blocker changes.
