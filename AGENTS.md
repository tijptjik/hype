# Repository Guidelines

## Development branch

- Use `preview` as the shared development and integration branch. Keep the primary
  `/home/io/code/hype` checkout on `preview`.
- Do not create or switch the primary checkout to a feature branch unless the user
  explicitly requests it. Temporary isolated worktrees are allowed for safe review,
  testing and conflict resolution; integrate their completed work back into `preview`.
- Preserve concurrent uncommitted work when integrating. Committing or consolidating
  locally does not authorize a push or deployment.

## Response summaries

- Preface every final summary response with "# SUMMARY `r{sequence}`" with `{sequence}`
  is an auto-incrementing number.

## Documentation

- Authorisation Design is defined in `docs/specs/Design-Spec-Authorization.md`
- Authorisation Roles are defined in `docs/auth/Roles.md`
- Authorisation Function order is defined in
  `docs/refactor-guides/Refactor-Guide-Authz-Function-Ordering.md`
- Component architecture and boundary rules are defined in `docs/Components.md`

### Naming and Path Conventions

- Svelte components: `PascalCase.svelte` in `src/lib/bits/...` - see
  `docs/Components.md` for rules.
  - `core/`: wrappers over `bits-ui` primitives.
  - `custom/`: app-owned components with Bits-compatible APIs.
  - `patterns/`: composed components built from `core` and `custom`.
- Route files follow SvelteKit conventions (`+page.svelte`, `+server.ts`).
  - `+page.ts` are dropped in favour of svelte remote functions.
  - Remote functions are stored in `src/lib/api/<resourceType>.remote.ts`
- Keep domain service modules grouped by entity (`src/lib/db/services/feature.ts`,
  etc.).

### Comments

- ALWAYS preserve existing comments when editing code; update wording if behavior
  changes instead of deleting useful context.
- ALWAYS use standard JSDoc for exported functions and remote APIs: include `@param`,
  `@returns`, and `@remarks` where behavior constraints matter.
- For service modules and route modules:
  - ALWAYS add JSDoc to exported functions and non-trivial file-local helpers.
  - ALWAYS add a concise one-line comment immediately above the block of a complex
    operation so the intent is scannable before reading the implementation.
  - WHEN they are multiple logical sections, add a file-level TOC comment that follows
    the repository TOC convention in `docs/Components.md`.
- Imports:
  - Keep import blocks grouped by section comments such as `// SVELTE`, `// I18N`,
    `// BITS COMPONENTS`, `// COMPONENTS`, `// TYPES`, `// DB`, `// API`, `// DRIZZLE`.
  - Order imports by: framework first, then third-party, then project/library imports,
    then type imports.

### Styling

- Always use skeletons for loading states; never display loading text. Match the
  skeleton to the loaded content's layout and dimensions. Accessible loading labels and
  busy states may still be provided to assistive technology.

- Use inline Tailwind utility classes for light styling.
- Use a colocated `{component}.styles.ts` when the styling becomes heavy. Break the
  styles up into readable, logical chunks based on their domain and combine them with
  `cx()`
- NEVER add semantic wrapper classes.
- NEVER use Tailwind `truncate` for street names or essential labels in flex/grid result
  buttons: this pattern has hidden names in Firefox. Use a `minmax(0, 1fr)` grid column
  with `min-w-0 whitespace-normal break-words`, allow rows to grow, and verify narrow
  layouts in Firefox.
- Use shared CSS in `src/lib/styles/*.css` under `@layer components` only for genuinely
  reusable theme tokens, CSS variables, cross-component states, or styling that cannot
  be expressed cleanly inline.

### Browser UI verification (Playwright)

- Use the installed `playwright` package directly with Bun for manual UI checks; do not
  add a dependency solely for this.
- Run every browser check through `dev-check`, including headless Chrome/Chromium,
  Firefox, WebKit, inline `bun -e` checks, temporary scripts and Playwright CLI
  commands. Browser child processes inherit the launcher's memory scope; launching them
  directly from Zed charges their RAM to the editor and can stall it.
- Use `dev-check bun scripts/visual-checks/<check>.ts` for saved checks, or
  `dev-check bun -e "import { chromium } from 'playwright'; /* launch, inspect, screenshot, close */"`
  when the `playwright-cli` wrapper cannot resolve this checkout's dependencies. If the
  user systemd bus is blocked by the sandbox, request execution with bus access; do not
  retry without `dev-check` or set `DOTJIK_DEV_CHECK` manually.
- For admin UI verification, use the user's existing authenticated browser session. A
  redirect from a fresh unauthenticated Playwright context does not establish that no
  admin session is available.
- An authenticated local admin account is available to agents. If the existing browser
  session cannot be accessed, use `bun run dev:agent admin --port 4173` and run a
  dedicated headless Playwright check through `dev-check`. The launcher in
  `scripts/dev/agent.ts` seeds the reserved local accounts and enables the admin persona
  without passwords or production accounts. Do not report admin verification as blocked
  solely because browser integration is unavailable or a fresh context redirects to
  sign-in; check this supported local authentication path first.
- Start the app with `bun run dev -- --host 127.0.0.1 --port 4173`, then stop it after
  the check. Package Vite launchers use `dev-server` to keep server memory outside Zed.
  Wrap direct or temporary Vite launches with `dev-server` too; long-lived servers must
  not hold the `dev-check` validation lock.
- Launch Chromium with `args: ['--disable-web-security']` for local map verification:
  the development origin otherwise cannot load the external map tiles because of CORS.

## Package and Library specific instructions

- `ts` TypeScript guidance:
  - Prefer explicit return types for exported functions and non-trivial functions.
  - Use type guards/type predicates for runtime narrowing where needed.
  - Prefer discriminated unions for complex state machines.
  - Use utility types (`Partial`, `Readonly`, `Pick`, etc.) and `as const` for enum-like
    constants.

## GitHub work tracking

- Breadline v4 tracker: https://github.com/tijptjik/hype/issues/178. Domain parent
  issues are #179–#187; use the matching parent and leaf issue for the work being
  changed.
- When work belongs to a tracked issue, include the issue URL or number in the branch,
  pull request and relevant commit message. Use `Refs #N` for partial work and
  `Closes #N` only when the change fully completes the issue.
- Keep implementation and acceptance TODO checkboxes accurate as evidence is produced.
  Link code, tests, migrations, browser checks and design decisions from the issue;
  leave incomplete or unverified items unchecked.
- Record blockers and scope changes on the issue. Keep the domain parent checklist and
  milestone counts current using completed leaf issues / total leaf issues and verified
  acceptance TODOs / total acceptance TODOs. Do not double-count parent issues or
  canceled work.
- GitHub issues, sub-issues and repository milestones are the public delivery record. Do
  not create or maintain a parallel progress ledger in
  `spec/breadline/breadline.v4.spec.progress.md`; technical specifications link to their
  tracking issues and document requirements and decisions.
- Use the Breadline labels and milestone assigned to the issue. Keep issue bodies
  public-safe: never include credentials, personal contact details or raw migration
  exports.
- Link each implementation to the technical domain document under
  `spec/breadline/proposal/` and update that document when the implementation path or
  blocker changes.

On managed desktops, run heavy validation through `dev-check COMMAND ...`, including
direct Vitest, Svelte checks and Cargo builds. It shares one user lock across agents and
repositories. Do not set DOTJIK_DEV_CHECK manually or bypass a failed resource scope.
Watch commands retain the slot until stopped; avoid them for one-shot checks.

## Lint workflow

- `bun run lint` is read-only. Use `bun run lint:fix` only for an intentional, reviewed
  formatting pass; do not make routine lint checks rewrite the repository.
- Biome owns source/configuration and Markdown formatting. Use paragraph-level
  `biome-ignore format` comments to preserve template tokens or Obsidian embeds; do not
  rename ordinary Markdown documents just because they contain these fragments.
- `format:markdown` and `format:markdown:check` also handle `llms.txt` as Markdown; the
  same adapter runs in repository lint and pre-commit checks.
- Pre-commit formats staged Markdown in a temporary index snapshot before validation. It
  preserves unstaged changes, and updates a working file only when it matches the
  original staged content. Other staged files are checked without modification.
- Biome policy/version, package manifest, lockfile, and ignore changes trigger a full
  staged-tree check. Include the required baseline migration in the same reviewed
  change; keep mechanical formatting separate from behavioral changes.

## Test window placement

- Launch all visible testing, browser automation, preview, and demo windows on Hyprland
  workspace **7**, silently, without switching the active workspace or stealing focus.
  This includes child windows and dialogs.
- Set placement before launching (for example, with a narrowly scoped Hyprland launch
  rule using `workspace 7 silent`); do not launch on the current workspace and move the
  window afterwards. Verify placement when a visible window is needed.
- Preserve the user's existing windows, tabs, and activity. Do not move or repurpose an
  existing user window for testing; use a dedicated test window on workspace 7.
- Prefer headless checks when they provide the required evidence. If the tool cannot
  guarantee silent placement on workspace 7, use a headless or isolated alternative
  rather than opening a disruptive window. Only focus or switch to workspace 7 when the
  user explicitly asks.
