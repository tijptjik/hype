# Repository Guidelines

## Project Structure & Module Organization
This is a Bun-powered SvelteKit app.

- `src/routes/`: route handlers and pages (`+page.svelte`, `+server.ts`, layouts).
- `src/lib/`: shared app code (components, auth, DB schema/services, remove functions, API clients, map logic, styles).
- `src/tests/`: Vitest test files (current pattern: `*.test.ts`).
- `static/`: public assets and PWA files.
- `messages/`: i18n message catalogs.
- `migrations/` and `sql/`: schema migrations, routines, and DB utilities.
- `scripts/`: maintenance, translation, scraping, and data tooling.
- `docs/`: architecture, deployment, database, and feature flow docs.

## Build, Test, and Development Commands
Run all commands with Bun:

- `bun install`: install dependencies.
- `bun run build`: production build (runs Svelte sync + Vite build).
- `bun run check`: run `svelte-check`.
- `bun run lint`: run Biome checks with auto-fixes.
- `bun run format`: format code with Biome.
- `bun run test:run`: run tests once in CI mode.
- `bun run db:migration:new <name>`: create a new Drizzle migration.
- `bun run db:migration:run:local`: apply local D1 migrations.

## Documentation
- Authorisation Design is defined in `docs/specs/Design-Spec-Authorization.md`
- Authorisation Roles are defined in `docs/auth/Roles.md`
- Authorisation Function order is defined in `docs/refactor-guides/Refactor-Guide-Authz-Function-Ordering.md`
- Component architecture and boundary rules are defined in `docs/Components.md`

## Coding Style
- Formatter/linter: Biome (`biome.json`).
- Indentation: 2 spaces; line width: 88; LF endings.
- JavaScript/TypeScript style: single quotes, only use semicolons when needed.

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

## Testing Guidelines
- Framework: Vitest with `jsdom` and `@testing-library/jest-dom`.
- Place tests as `*.test.ts` (prefer `src/tests/` or near related code when useful).
- Run `bun run test:run` before pushing.
- Coverage uses V8 + `lcov` output; include tests for new behavior and bug fixes.

## Package and Library specific instructions

- `ts` TypeScript guidance:
  - Prefer explicit return types for exported functions and non-trivial functions.
  - Use type guards/type predicates for runtime narrowing where needed.
  - Prefer discriminated unions for complex state machines.
  - Use utility types (`Partial`, `Readonly`, `Pick`, etc.) and `as const` for enum-like constants.
  - Add new TypeScript types in `src/lib/types.ts`, not inline in feature files.
  - Place new types under the correct existing heading in `src/lib/types.ts` (usually resource-based or domain-based) so related type changes can be reviewed together.
- `bun` - Package/runtime tooling:
  - Use Bun for dependency management and command execution.
  - Use `bunx` where `npx` would normally be used.
  - Do not use `npm` or `pnpm` for this repository.
- `drizzle-orm` - Drizzle conventions:
  - Import query helpers from `drizzle-orm`.
  - Use `eq`/`and`/`or` for conditions.
  - Use `insert`/`select`/`update`/`delete` patterns for CRUD.
  - Define schema relations with `relations`.
  - If a schema/API rename is shipped without a physical DB migration (for compatibility or staged rollout), add an entry to `docs/Deferred-Migrations.md` in the same PR.
- `paraglide-js` - i18n:
  - Use Paraglide for translations in `messages/`.
  - Supported locales are `en`, `zh-hans`, and `zh-hant`.
  - Write messages using Inlang Message Syntax.
- `unplugin-icons` - icon usage:
  - Use Lucide icons via unplugin-icons.
  - Import icons with `import IconName from 'virtual:icons/lucide/<icon-name>'`.

## Agentic Behaviour
- For Svelte/SvelteKit questions and implementation work, consult Context7 docs first, especially for experimental or cutting-edge APIs.
- Treat framework docs as authoritative over memory; verify behavior against the current docs before coding.
- Whenever you touch a component, make a brief refactoring pass on that component and its immediately related local pieces so the codebase improves incrementally over time.
- During that refactoring pass, prefer simplifying toward inline Tailwind, reducing unnecessary semantic wrapper classes, and splitting obvious subcomponents when it materially improves clarity.

## Commit & Pull Request Guidelines

- Use Conventional Commits: `feat:`, `fix:`, `docs:`, `refactor:`, `test:`, `chore:`, `perf:`, `style:`, `revert:`.
- Use `bun run commit` for Commitizen prompts; commit messages are enforced by commitlint.
- Branch naming is enforced: `type/topic` (for example, `feat/map-filter-sync`).
- Open PRs to `preview` (not `main`) with:
  - clear summary and rationale,
  - linked issue(s),
  - screenshots/video for UI changes,
  - notes on migrations, env vars, or deployment impact.
- Pre-push hooks run branch-name lint and tests; ensure both pass locally.
