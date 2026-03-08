# Resource Refactor Playbook (Bits UI + Remote Functions)

## Goal
- Migrate an admin resource from legacy REST/superforms/DaisyUI to the current app standard:
  - remote functions in `src/lib/api/server/<resource>.remote.ts`
  - Bits UI page composition in `src/routes/admin/<resources>/[resource]/+page.svelte`
  - authz wrappers in `src/lib/api/services/authz/<resource>.ts`
  - db operations in `src/lib/db/services/<resource>.ts`

## Canonical Entry Points
- Server entry point: `src/lib/api/server/<resource>.remote.ts`
  - Export `get<Resource>s`, `get<Resource>`, `<resource>Form`, and command handlers (publish/archive when applicable).
  - Keep this file orchestration-only.
- Page entry point: `src/routes/admin/<resources>/[resource]/+page.svelte`
  - Use `configureForm(...)` for form config.
  - Use `Main.Form` as submit boundary.
  - Keep submit in `onSubmit()` and state toggles in `handle<Resource>StateToggle(...)`.
  - Compose sections with Bits patterns (`FormI18nSection`, `FormUserRolesSection`, `FormOrganisationsSection`, etc).

## Non-Negotiables
- Remote-first: no new REST submit paths.
- Remote-only in admin state: `admin/appCtx` resource loaders and query fns must use Svelte remote functions (`get<Resource>s`, `get<Resource>`) instead of `/api/<resource>` fetch calls.
- Authz-first: authorize before sensitive reads and before writes.
- Profile contract: list/card/detail/admin shaping remains explicit.
- Single mutation path per page.
- Explicit update target: updates require `meta.id` and `meta.updatedAt`; do not recover id from code.

## Server Refactor Pattern

### 1. Query Handlers (`get<Resource>s`, `get<Resource>`)
- Parse/validate params with zod.
- Normalize lookup/list state via `api/services/<resource>.ts`.
- Probe minimal rows via db service when auth context is needed.
- Run authz using descriptive wrappers.
- Load full relation shape via db service.
- Return response via profile shaper.

### 2. Form Handler (`<resource>Form`)
- Required sequence:
  - parse + normalize
  - invariant checks (required arrays, duplicates, etc.)
  - authz checks
  - reserved/unique code checks
  - concurrency guard (`updatedAt`)
  - persist core fields
  - sync related records (i18n, roles, assignments)
- Keep non-form-managed fields out of this mutation path.

### 3. Command Handlers (publish/archive)
- Required sequence:
  - probe (or 404)
  - authz (or 403)
  - persist state via db service
  - return minimal payload `{ id, stateField }`

## Extraction Boundaries

### Authz service (`api/services/authz/<resource>.ts`)
- Provide wrappers with semantic params:
  - `authorize<Resource><Action>ForSubmission({ user, userRoles, resource, submittedData, ... })`
- Centralize scope checks that can drift if copied.
- Build reusable list-scope helpers for role-based conditions.

### Resource API service (`api/services/<resource>.ts`)
- Keep pure normalization utilities:
  - lookup conditions
  - requested list/search state
  - pagination/sort normalization
  - query-condition derivation helpers

### DB service (`db/services/<resource>.ts`)
- Move all SQL primitives here:
  - probes
  - uniqueness checks
  - concurrency-safe updates
  - command updates
  - relation sync
  - reusable SQL conditions (for example search text predicates)

## Schema Lifecycle (Important)
- Do not mass-deprecate all `db/zod/schema/*` resources at once.
- Deprecate schemas per-resource only after that resource has:
  - remote query parity (`get<Resource>s`, `get<Resource>`)
  - remote mutation parity (`<resource>Form`, commands)
  - page wiring migrated to remote/`configureForm(...)`
  - appCtx/adminCtx loaders migrated off `/api/<resource>`
- Keep backwards-compatible exports during transition.

### Recommended Layout During Transition
- Active remote contract file:
  - `src/lib/db/zod/schema/<resource>.ts`
  - Contains remote form/command/profile schemas used by remote handlers and pages.
- Legacy compatibility file:
  - `src/lib/db/zod/schema/deprecated/<resource>.ts`
  - Contains legacy DB/API/base/raw schemas still required by existing consumers.
- Bridge rule:
  - `schema/<resource>.ts` should re-export deprecated schemas until all imports are migrated.

### Exit Criteria To Delete Deprecated Schemas
- `rg "schema/deprecated/<resource>|<LegacySchemaName>" src/lib src/routes src/tests` has no active consumers.
- `src/lib/types.ts` no longer imports deprecated-only schema symbols for that resource.
- `src/lib/db/zod/index.ts` no longer relies on deprecated-only exports for that resource.
- Feature/layer/task or other composed schemas no longer reference that resource's deprecated base/API schemas.
- Remote and page tests pass for that resource without deprecated imports.

## Page Wiring Consistency
- Use `configureForm(...)` with:
  - `schema`
  - `data` from `to<Resource>FormInput(...)`
  - `submitUpdates` built from remote query references
- Keep hidden input generation explicit and aligned with zod form payload shape.
- Facet visibility must not unmount form sections:
  - Do not wrap facet sections in `{#if isFacet}` when those sections contain form inputs.
  - Use `Main.Section isVisible={...}` (or equivalent mounted-visibility container) so inputs remain in the DOM and submit payloads stay complete.
  - Reason: conditional unmounting drops hidden inputs (for example `projectId`, `organisationId`, `i18n`) and causes false validation failures on submit.
- Keep header/status controls wired through page-local handlers only.
- Ensure action button behavior is container-aware:
  - left/right section constraints explicit
  - label hiding does not hide icons unexpectedly

## Naming Conventions
- `probed`: result of lightweight probe lookups.
- `persisted`: required source-of-truth entity after probe/load.
- `result`: operation return value.
- Use shared types from `src/lib/types.ts`; avoid local ad-hoc types in remotes.

## Common Regression Risks
- `admin/appCtx` still calling deleted legacy `/api/<resource>` endpoints, causing runtime fetch failures (`Network response was not ok`).
- Hidden input omissions or boolean serialization mismatch.
- Relation arrays dropped on submit causing unintended clearing.
- Authz wrapper bypassed by inline actor/resource objects.
- Duplicate probe logic split between remote and db service.
- Type erosion (`any`, `unknown as`) instead of proper shared types.
- Responsive header action clipping/overflow in narrow containers.

## Review Gate
- Queries:
  - list/detail authorize and load correctly for allowed and denied actors.
  - admin/appCtx query functions resolve through remote functions only (no `/api/<resource>` dependency).
- Form:
  - create/update happy path.
  - stale write handling.
  - reserved/duplicate code handling.
  - relation sync correctness.
- Commands:
  - publish/archive authz + persist behavior.
- UI:
  - no action overflow/clipping regressions.
  - hidden inputs match submitted state.
- Tests:
  - admin/appCtx coverage for resource list/detail loading via remote functions.
  - authz wrapper coverage.
  - remote handler coverage for invariants + stale writes + relation sync.
  - page-level behavior coverage for critical add/remove/toggle flows.

## Recommended Delivery Order (Fail-Fast)
- Split resource migrations into small, mergeable steps instead of a single large pass.
- Step 1: Server read path parity.
  - Implement `get<Resource>s` + `get<Resource>` with profile shaping, search, filters, sorting, pagination, and authz.
  - Confirm list/get response metadata parity (`totalCount`, `hasMore`, `nextOffset`, `sortBy`, `sortOrder`, `appliedFilters`, `q`).
- Step 2: Admin loader migration.
  - Move `admin/appCtx` query fns to remote functions only.
  - Remove `/api/<resource>` fetch usage for that resource.
- Step 3: Form mutation path.
  - Implement `<resource>Form` invariants, authz, concurrency guard, and relation sync.
- Step 4: Commands.
  - Implement publish/archive probe + authz + persist flow.
- Step 5: UI wiring.
  - Move page to Bits patterns and `configureForm(...)`.
  - Validate hidden-input payload completeness and section-specific controls.
- Step 6: Cleanup.
  - Delete legacy REST endpoints only after Steps 1-5 pass.

## Mandatory Pre-Merge Checks (No Silent Failures)
- Remote parity checklist:
  - `get<Resource>s` supports `conditions`, `prisms`, `pagination`, `sorting`, `q`, `meta.profile`.
  - `get<Resource>` supports `ref`, `refKey`, `meta.profile`.
- Authz checklist:
  - Query handlers authorize before full load.
  - Form handler authorizes before any write.
  - Command handlers authorize after probe and before persist.
- App context checklist:
  - `rg "/api/<resource>" src/lib/context/app.svelte.ts src/lib/context/admin.svelte.ts` returns no active call sites for migrated resources.
  - `remoteMap` entry exists and is used by query fns.
- Contract checklist:
  - Use shared response shapers (`toEntityResponseShape`, `toListResponseShape`) rather than inline return objects.
  - Profile resolution helper exists in `api/services/<resource>.ts` (for example `to<Resource>Profile`).
  - If deprecating schemas for a resource:
    - `schema/<resource>.ts` contains only remote-facing contracts and explicit compatibility re-exports.
    - legacy schemas are moved to `schema/deprecated/<resource>.ts`.
    - no net type break in `src/lib/types.ts`.
- Runtime checklist:
  - Manually load admin list + detail for allowed and denied actors.
  - Confirm no runtime fetch errors (`Network response was not ok`) and no hidden-input runtime crashes.

## Anti-Regression Notes
- Do not delete legacy REST endpoints at the beginning of a migration.
- Delete only after remote queries, appCtx/adminCtx wiring, and page submit path have all been validated.
- If any checklist item is incomplete, keep the migration marked as partial and do not remove old endpoints yet.
