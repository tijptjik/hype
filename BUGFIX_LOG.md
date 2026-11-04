# Codebase bug-fix log

## 2026-11-04 — SQLite missing-schema classification

- Fixed `src/lib/db/services/sqlite.ts` to inspect plain-object D1 wrappers through
  `cause`, `error`, and aggregate `errors`, with cycle protection. Previously the
  staged-schema fallback in `getUserFeaturesByUserId` could miss wrapped missing-table
  failures.
- Restricted relation matching to the missing identifier. Previously
  `userFeatureBackup`, or an unrelated missing table followed by SQL mentioning
  `userFeature`, could trigger the user-feature empty-result fallback and hide a
  different database failure.
- Added regressions in `src/tests/sqlite.services.test.ts`. Both new tests failed before
  the fix and pass after it.
- Verification:
  `bunx vitest run src/tests/sqlite.services.test.ts src/tests/sqlite-read-retry.test.ts src/tests/user.services.test.ts src/tests/user-state-transaction.services.test.ts src/tests/crud-replacement-transaction.test.ts src/tests/task-list-permissions.test.ts src/tests/source-cache.test.ts src/tests/resource-collection-reactivity.test.ts`
  — 8 files, 42 tests passed.
- Scope: local code and tests only; no database mutation, deployment, commit, or
  production verification. Existing worktree changes preserved.

## 2026-11-04 — Related-row ownership with mapped columns

- Fixed `replaceManyRelated` in `src/lib/db/crud.ts`: resolve the TypeScript property
  from the supplied Drizzle column instead of assigning by its physical SQL name. A
  regression using `parentId: text('projectId')` previously inserted a replacement under
  the submitted wrong parent after deleting the intended parent's rows.
- Reject columns from a different table before preparing or executing the replacement,
  including empty replacements. Existing atomic replacement and parameter batching
  remain intact.
- Added real SQLite regressions for mapped ownership and rejection without mutation in
  `src/tests/crud-replacement-transaction.test.ts`.
- Verification:
  `bunx vitest run src/tests/crud-replacement-transaction.test.ts src/tests/project-role-transaction.services.test.ts src/tests/hub-role-transaction.services.test.ts src/tests/authorization.organisation.test.ts src/tests/authorization.project.test.ts src/tests/authorization.hub.test.ts src/tests/authorization.layer.test.ts src/tests/authorization.feature.test.ts src/tests/authorization.task.test.ts`
  — 9 files, 478 tests passed. The mapped-column regression failed before the code fix.

## 2026-11-04 — Location concurrent-rejection regression fixture

- Corrected numbered SQLite bindings in the concurrent rejection fixture in
  `src/tests/location-services.test.ts` to positional placeholders, repeating the review
  ID for the WHERE clause. Node's SQLite adapter previously threw
  `column index out of range` before the acceptance code could test the race.
- The focused `fences a rejection` test now passes and verifies conflict, unchanged
  revision count, no identity-history insertion, and preserved manual state. No
  application guard was weakened.

## 2026-11-04 — Preserve explicit address labels through Location baselines

- Fixed the confirmed loss of explicit formatted-address clearing in
  `readFeatureLocationBaseline`. Effective Location addresses now retain optional
  per-locale `displayOverrides`, distinguishing a complete authored label (including an
  empty string) from fallback text that can be recomposed.
- The address formatter honours this retained intent, with newer Feature corrections
  taking precedence. Structured authored components and canonical evidence are
  preserved; no migration or rewriting of immutable revisions is required. Retained
  authored-address transitions carry the label choices forward.
- Updated the runtime schema, model and domain specification
  (`spec/breadline/proposal/01-places-features.md`, Refs #194 / parent #180). Absent
  metadata remains absent, avoiding spurious whole-location overrides and split-replay
  conflicts.
- Added JSON round-trip and subsequent-edit assertions; expanded the real SQLite
  baseline regression to null, empty-string and custom labels with unchanged
  authored-content assertions.
- Verification:
  `bunx vitest run src/tests/location-services.test.ts src/tests/feature-address.test.ts`
  — 2 files, 168 tests passed.

## 2026-11-04 — Align regression expectations with documented contracts

- Updated the rematch fixture's stale score from 40 to 80: documented exact-name
  evidence contributes 55 and the fixture's distance below 25 m contributes 25. The test
  still requires incomplete evidence, explicit guarded acceptance, and preservation of
  independent Feature values.
- Updated authorized default-layer pagination's expected metadata to assert the retained
  cache scope on page two. The implementation already behaved correctly; removing that
  scope would weaken account/hub/locale isolation.
- Verification:
  `bunx vitest run src/tests/location-rematch.test.ts src/tests/resources.remote.test.ts`
  — 2 files, 31 tests passed.

## 2026-11-04 — Atomic hierarchy publication

- Fixed split commits in organisation, project and layer publication commands. The
  parent publication update, saved descendant publication state, image classification
  and image publication now execute in one D1 batch. Remote handlers forward the
  explicit `publishChildren` choice into that command and no longer perform a separate
  cascade.
- Shared statement builders in `src/lib/db/services/publication.ts` retain the existing
  scope predicates, local-state restoration, draft opt-in, image eligibility and
  attribution behavior. Standalone descendant cascades are also atomic.
- Added `src/tests/publication-transaction.services.test.ts` with real SQLite execution
  of Drizzle's generated statements under D1 batch transaction semantics: success
  with/without draft inclusion, repeated unpublish/restoration, descendant failures
  during publish and unpublish, and failure during final image publication. Rollback
  comparisons include every affected row, timestamps and attribution.
- Updated remote boundary tests to verify a single atomic service call and no subsequent
  cascade. Updated the hierarchy-only mock tests to support batches; separate SQLite
  tests cover image writes.
- Verification: 139 tests passed across publication transactions, image publication,
  publication previews/access, cascade semantics and all three remote authorization
  suites. `bun run check` reported no diagnostics in the changed publication
  implementation; the overall check still fails with 11 errors in
  `messaging-media-picker.test.ts` and `user-search-chronology.test.ts`, plus 19
  warnings. Output: `/tmp/hype-goal-check.log`.

## 2026-11-04 — Historical Place migration fixtures

- Corrected the two Bun migration fixtures to use the historical
  `placeRevision.sequence` and `payload` columns introduced by migration 0102, rather
  than later names `version` and `rawSource`.
- No migration SQL or assertions were weakened. Ownership constraints, immutable
  revision protection, draft/privacy guards, ancestry-change rejection and foreign-key
  checks now execute.
- Verification: `bun test src/lib/locations/location.test.ts` — 16 passed, 0 failed, 50
  assertions.

## 2026-11-04 — Atomic project organisation moves

- `updateProjectByIdWithConcurrency` now observes the current organisation and commits
  changed descendant ancestry with the project core/policy update in one batch. Every
  statement rechecks the project timestamp, prior organisation and optional policy
  revision. Stale requests cannot move descendants, including changes arriving between
  the preliminary read and batch execution.
- Removed the remote handler's separate post-save ancestry cascade. The standalone
  descendant helper also uses an atomic batch. Existing private Location and
  historical-layer trigger restrictions are preserved; rejected parent writes roll back
  preceding descendant writes.
- Added real SQLite tests for successful scoped movement, failures at each of the four
  write stages, timestamp and policy races, and actual migration-defined private
  Location/historical-layer guards. These compare all affected columns, including
  timestamps. The Location-policy-only fixture now retains its real existing
  organisation instead of accidentally exercising a move to a nonexistent one.
- Verification: 189 tests passed across existing Location services, locale settings,
  project remote authorization, media-picker behavior and user chronology; all 9 new
  move transaction tests passed. `git diff --check` passed for this work.
- Boundary: this makes project core/policy and ancestry changes atomic. Related
  map-style, translation, role and property persistence in the enclosing form still has
  separate boundaries and needs further review; no claim of whole-form atomicity.

## 2026-11-04 — Restore clean type checking

- Typed the media-picker transport mocks using the actual transport signatures and
  supplied complete message-content fixtures. Removed the unsupported Testing Library
  role-query `exact` option (string accessible-name matching remains exact by default).
- Made the SQLite chronology adapter's array-mode result assertion explicit;
  `setReturnArrays(true)` controls runtime shape, while the Node type declaration still
  describes record rows.
- Verification: `bun run check` now exits successfully with **0 errors and 19
  warnings**. The remaining warnings are in existing UI/test fixtures. Media-picker and
  chronology tests pass.

## 2026-11-04 — Verify feature-count migrations with FTS5

- The installed CLI lacks FTS5, but Python's SQLite engine reports `ENABLE_FTS5=1`. Ran
  the unchanged count-cache migration tests through a temporary CLI-compatible adapter
  limited to their exact in-memory SQL invocation; it executes the real SQL, including
  triggers, constraints and transactions.
- Verification:
  `PATH="/tmp/hype-fts5-bin:$PATH" bunx vitest run src/tests/feature-count.migration.test.ts`
  — 24 passed, 0 failed. No migration, test assertion, installed CLI or persisted
  database changed. Temporary adapter and output live under `/tmp/hype-fts5-bin` and
  `/tmp/hype-goal-count-fts5.log`.

## 2026-11-04 — Atomic, set-based capability restriction writes

- Replaced organisation capability cascades' per-project/per-role read-modify-write
  loops with two SQL statements that restrict current stored booleans. This removes
  partial cascades, stale snapshot overwrites and unbounded query counts.
- Submitted organisation definitions, project restrictions and role restrictions now
  commit in one revision-guarded transaction in `updateOrganisationByIdWithConcurrency`.
  The remote form no longer runs an independent later cascade. Omitted definitions
  preserve existing permissions; null/empty definitions allow none; restrictions never
  grant a previously disabled capability.
- New shared builder: `src/lib/db/services/capabilityCascade.ts`. Unchanged descendant
  JSON skips writes, preserving project modification tokens and avoiding needless cache
  invalidation. The standalone cascade also uses one atomic batch.
- Added `organisation-capability-transaction.services.test.ts`: scope isolation,
  disabled project permissions, rollback at all three stages, stale parent revisions,
  concurrent role revocation, stable timestamps, strict JSON boolean handling, and
  300-project execution with exactly three statements and at most 100 bound parameters
  per statement.
- Verification: focused 37 tests passed; broader database/authorization gate now passes
  **56 files / 1,049 tests** (`/tmp/hype-goal-db-capability-suite.log`). `bun run check`
  remains successful with **0 errors / 19 warnings**. No persisted databases or
  deployment changed.
- Boundary: organisation core and capability restrictions are atomic; translations,
  membership and properties still use separate form persistence stages and remain under
  review.

## 2026-11-04 — Atomic layer form persistence

- Layer creation and updates now commit core fields, translations and property links
  together. Revision guards fence every replacement statement; explicit empty
  collections clear relations while omitted collections preserve them.
- The shared `prepareGuardedReplacement` helper enforces parent ownership, preserves
  Drizzle defaults and driver encodings, omits generated columns, and counts actual
  bound parameters.
- Real SQLite tests cover late creation failure, rollback at each update stage, stale
  timestamps/policy revisions, missing parents, mapped columns, defaults, nulls and
  booleans.
- Verification: the wider database service and layer remote run passed **46 files / 581
  tests** (`/tmp/hype-db-regression.log`). Corrected the new layer remote fixture to
  supply the required locale/name fields; type checking now passes.

## 2026-11-04 — Atomic project property creation

- Fixed `createProjectProperty` committing the base row before translations, values and
  value translations. A late child failure could leave an incomplete property and
  reserve its key.
- `createBaseProperty` accepts optional relations and saves the complete creation in one
  batch. Value identities are allocated before persistence, parent ownership is
  enforced, and translations stay attached to their corresponding values. Existing
  base-only callers retain their behavior.
- Added real SQLite success/late-failure regressions with 250 values and translations,
  full rollback assertions, one-batch verification, and generated-statement parameter
  checks (at most 100). Added a remote boundary regression proving no subsequent
  independent child writes.
- Verification: property creation/catalog, guarded replacement, layer form and remote
  suites passed **6 files / 86 tests** (`/tmp/hype-property-create-test.log`).
  `bun run check` passed with **0 errors / 19 existing warnings**
  (`/tmp/hype-property-create-check.log`). Scoped `git diff --check` passed.
- Boundary: existing-property value append and enclosing project/organisation/hub form
  stages still require transaction review. No persisted database, deployment or commit
  changed.

## 2026-11-04 — Atomic property-value appends

- Fixed `appendPropertyValues` saving value batches separately from their translations.
  A late insert/translation failure previously left an incomplete append.
- `createPropertyValues` now allocates identities up front, enforces the authorized
  property ID, budgets all value columns, and commits every value chunk and translation
  in one batch. Existing values are retained; the remote handler no longer issues
  separate translation writes.
- Added real SQLite regressions with 250 values: successful translation identity
  mapping, late value failure, late translation failure, and collision with an ID
  belonging to another property. Failure snapshots prove all existing
  values/translations remain unchanged. Every generated statement is checked against the
  100-parameter budget.
- Updated the remote boundary test to prove translations reach the atomic service and no
  subsequent translation write occurs; denial-before-hydration coverage remains passing.
- Verification: property append/create/catalog and remote tests passed **4 files / 53
  tests** (`/tmp/hype-property-append-test.log`). `bun run check` passed with **0 errors
  / 19 existing warnings** (`/tmp/hype-property-append-check.log`). Scoped
  `git diff --check` passed. No persisted database, deployment or commit changed.
- Remaining database work: organisation and hub forms still persist core rows and
  role/related-data stages separately; those enclosing transaction boundaries remain
  under review before the reactivity/cache phase.

## 2026-11-04 — Revision-guarded organisation roles and translations

- Fixed organisation updates committing the core revision before replacing translations
  and organisation role assignments. A later relation failure could leave saved fields
  and permissions out of sync, and a separate relation write did not recheck the
  submitted revision.
- `updateOrganisationByIdWithConcurrency` now accepts optional translations and roles,
  enforcing organisation ownership and the unchanged parent revision on every
  replacement statement. These writes, descendant capability restrictions and the final
  core update share one transaction. Omitted relations remain intact; explicit empty
  collections clear them.
- The remote form now passes the authorized relation payloads into that service and
  performs no subsequent translation/role replacement. Updated the authorization design
  document to state this guarantee and its remaining property-catalog boundary.
- Added real SQLite coverage for 250 roles, parameter limits, scope isolation, late role
  insertion failure, failures in translation/core/descendant stages, stale revisions,
  omitted collections and explicit clears. The remote boundary test verifies one service
  call and no follow-up relation writes.
- Verification: organisation form/capability transactions, remote and authorization
  suites passed **4 files / 109 tests** (`/tmp/hype-organisation-form-test.log`).
  `bun run check` passed with **0 errors / 19 existing warnings**
  (`/tmp/hype-organisation-form-check.log`); scoped `git diff --check` passed.
- Boundary: organisation creation and property-catalog form persistence, plus
  hub/project enclosing form transactions, remain under review. This supersedes the
  earlier organisation-update translation/membership boundary but does not establish
  whole-form atomicity. No persisted database, deployment or commit changed.

## 2026-11-04 — Atomic organisation creation and initial roles

- Fixed organisation creation committing its parent before translations and initial role
  assignments. Failures in those child writes could leave an incomplete organisation or
  omit its submitted owners.
- `createOrganisation` now accepts the authorized relation collections and commits them
  with the parent. Creation and updates share a statement builder that enforces
  organisation ownership and preserves relation defaults/encodings. A conflicting parent
  identity aborts before any relation deletion.
- The remote create flow forwards translations and roles into the atomic service,
  removing independent follow-up writes. Property catalog persistence is still a
  separate stage.
- Added SQLite creation regressions with 250 roles, translation failure, failure in the
  last role chunk, identity collision, preservation of unrelated rows and
  parameter-budget checks. Added a remote regression proving one service call and no
  separate translation/role creation.
- Verification: organisation transaction, capability, remote and authorization suites
  passed **4 files / 114 tests** (`/tmp/hype-organisation-create-test.log`).
  `bun run check` passed with **0 errors / 19 existing warnings**
  (`/tmp/hype-organisation-create-check.log`); scoped `git diff --check` passed. No
  persisted database, deployment or commit changed.

## 2026-11-04 — Atomic hub relations and organisation assignments

- Fixed hub creation/update committing the parent separately from translations, roles,
  organisation assignments and layer defaults. Late failures could leave permissions or
  affiliations partially saved, and assignment writes previously ran after the parent
  revision check had completed.
- Added shared prepared-statement builders and optional relation payloads to hub
  creation/update. All submitted collections commit with core fields; updates recheck
  the unchanged hub token on every mutation and advance it last. Stale requests neither
  detach organisations nor replace roles, even when a submitted organisation has
  disappeared.
- Standalone organisation reassignment retains its atomic behavior using the same
  builder. Missing live targets abort the whole transaction. Omitted collections
  preserve their rows, explicit empty collections clear them, and parent identity
  conflicts abort before relation writes.
- Added real SQLite regressions covering 250 roles, per-statement binding limits, each
  failure stage, organisation scope isolation, missing targets, stale revisions,
  explicit clears, omitted collections, late creation failure and identity collisions.
  Remote tests verify relation payloads reach the atomic service and no independent
  follow-up writes occur.
- Verification: hub form, standalone organisation/role transactions, remote and
  authorization suites passed **5 files / 91 tests** (`/tmp/hype-hub-form-test.log`).
  `bun run check` passed with **0 errors / 19 existing warnings**
  (`/tmp/hype-hub-form-check.log`); scoped `git diff --check` passed.
- Boundary: hub property catalogs remain a separate form stage; external domain
  registration is not part of the D1 transaction. No persisted database, external
  registration, deployment or commit was performed by this review.

## 2026-11-04 — Atomic project translations, roles and parent memberships

- Fixed project creation/update committing translations and role replacements after the
  core save. Role persistence also ensures organisation membership; a later failure
  could previously leave core state, roles and parent memberships inconsistent.
- Project creation/update accept optional relation payloads and prepare those writes
  inside the parent transaction. Updated relation statements recheck the same parent
  timestamp, source organisation and optional Location policy revision as ancestry
  changes. The parent token advances last.
- Required memberships for submitted roles are inserted from one bound JSON list with
  conflict handling that preserves existing organisation privileges. Project role
  replacements enforce the server-owned project ID. Omitted collections remain
  unchanged; explicit empty replacements do not revoke unrelated organisation roles.
- Removed independent translation/role saves from both remote form paths. Map-style and
  property persistence remain separate stages, so this does not claim whole-form
  atomicity.
- Added SQLite regressions for 250 roles, privilege preservation, bounded parameters,
  every relevant failure stage, parent identity collisions, creation rollback, explicit
  clearing, and a revision change between preflight and batch execution. Remote tests
  verify changed roles and translations reach the atomic update.
- Verification: project form/move/role transactions, remote and authorization suites
  passed **5 files / 197 tests** (`/tmp/hype-project-form-test.log`). `bun run check`
  passed with **0 errors / 19 existing warnings** (`/tmp/hype-project-form-check.log`);
  scoped `git diff --check` passed. No persisted database, deployment or commit changed.

## 2026-11-04 — Project map-style assignment joins the form transaction

- Fixed project saves committing core fields, roles and ancestry before a map-style
  failure. Creation and updates now prepare the requested style assignment inside that
  same transaction; unavailable styles roll back every preceding form write.
- The assignment lookup checks visibility at execution time against the destination
  organisation's live hub affiliation and the authorized prospective project code. This
  supports project-restricted styles during creation/renaming while rejecting a
  hub-scoped style after a concurrent destination affiliation change.
- Explicit empty/null style selection clears the assignment; omitted service input
  preserves it. Stale revisions do not delete or insert assignments, including when the
  requested style is unavailable.
- The remote form no longer performs a separate assignment write. A narrow wrapped-error
  classifier preserves `MAP_STYLE_NOT_AVAILABLE` for the required-style constraint while
  letting unrelated failures retain their original errors.
- Added SQLite cases for unavailable-style rollback on create/update, restricted styles
  during create/rename, live hub races, clearing/omission, and stale revisions during
  batch execution. The remote regression verifies the error response and absence of a
  follow-up style write.
- Verification: project form/map-style/move transactions, remote and authorization
  suites passed **5 files / 207 tests** (`/tmp/hype-project-style-test.log`).
  `bun run check` passed with **0 errors / 19 existing warnings**
  (`/tmp/hype-project-style-check.log`); scoped `git diff --check` passed.
- Boundary: this supersedes the earlier separate-map-style boundary. Property
  catalog/inherited-property persistence remains under review before closing the
  database phase. No persisted database, deployment or commit changed.

## 2026-11-04 — Hub and organisation property catalogs join parent form transactions

- Split catalog preparation from execution in `preparePropertyCatalog`. Existing
  standalone catalog services retain their atomic hydrated results, ownership checks,
  schema validation, rank handling and parameter limits. Enclosing forms execute
  prepared writes without an unused hydrated readback.
- Hub and organisation creation/update now commit submitted catalogs, value translations
  and rank links with their parent fields and roles. Removed separate remote catalog
  saves. Late catalog or parent failures roll back the complete database form
  transaction.
- Added `executeRevisionBatch`: an in-batch parent revision check runs before catalog
  mutations. A distinct SQLite JSON-path failure aborts stale batches and maps only that
  internal failure to the existing stale/null result; unrelated database errors remain
  errors. This avoids a stale preflight read granting permission to overwrite a catalog.
- Added real SQLite tests for both scopes: combined parent/role/catalog success, late
  parent failure, late value-translation failure during creation, and parent revision
  changes between preparation and batch execution. Remote boundary tests verify catalog
  forwarding and absence of separate catalog writes.
- Verification: focused combined tests passed **5 files / 114 tests**. Wider
  database/authorization regression passed **61 files / 1,122 tests**
  (`/tmp/hype-catalog-db-regression.log`). `bun run check` passed with **0 errors / 19
  existing warnings** (`/tmp/hype-catalog-form-check.log`). Scoped `git diff --check`
  passed.
- Boundary: this supersedes the earlier separate hub/organisation property-catalog
  boundaries. Hub domain registration remains external to D1. Project
  catalog/inherited-property persistence remains under review. No persisted database,
  external registration, deployment or commit changed.

## 2026-11-04 — Project catalogs, inherited assignments and layer presentation commit together

- Removed the remaining independent project-form catalog, inherited-property,
  default-seeding and layer-presentation writes. Creation now commits catalog/default
  assignments with the parent; updates commit catalog changes, inherited assignments,
  child-layer links and submitted layer presentation with core/role/style/ancestry
  writes.
- Exposed prepared inherited-assignment and default-seeding statements while retaining
  standalone service behavior. The enclosing update checks the parent revision inside
  its transaction before catalog mutations, then resolves inherited scope after the core
  organisation move. Omitted form collections retain their previous semantics.
- Layer presentation updates retain both project and layer predicates and run inside the
  form transaction, replacing the remote handler's separate parallel update stage.
  Existing local-property preservation and rank normalization remain in the authorized
  pre-save shaping step.
- Added SQLite regressions for complete catalog/assignment/core/layer saves, a failure
  in the final layer update, stale revisions after preparation, destination-scope
  inheritance during project moves, and late default-seeding failures during creation.
  Updated remote tests to assert normalized properties and layer flags are passed to the
  atomic save.
- Verification: focused tests passed **3 files / 104 tests**. Wider
  database/authorization regression passed **60 files / 1,120 tests**
  (`/tmp/hype-project-catalog-regression.log`). `bun run check` passed with **0 errors /
  19 existing warnings** (`/tmp/hype-project-catalog-check.log`); scoped
  `git diff --check` passed.
- Boundary: this supersedes the earlier project property transaction boundary. The
  broader database/permission audit and its remaining regression triage still require
  completion before the systematic reactivity/cache phase. No persisted database,
  deployment or commit changed.

## 2026-11-04 — Stable identities for new project-property assignments

- Reproduced new ID-less project properties being inserted into the catalog but omitted
  from assignment synchronization: the catalog allocated identities after the assignment
  payload had already been formed. The regression returned no assignments instead of the
  two submitted ranks/flags.
- `toSubmittedLocalPropertiesWithProjectId` now allocates missing/empty IDs once before
  catalog and assignment payloads diverge. Existing IDs remain intact, non-string IDs
  are rejected, and input objects are not mutated.
- Real SQLite create/update tests verify two newly submitted properties retain their
  nonalphabetical order and enabled/default-enabled flags through the persisted
  assignment join.

## 2026-11-04 — Atomic standalone layer presentation writes

- Replaced independent parallel writes in `syncProjectLayerPresentation` with one batch.
  A later failure now rolls back earlier layer changes. Removed the redundant preflight
  read; each update retains both project and layer predicates at execution time.
- Added SQLite failure and scope-isolation checks, including missing IDs and layers
  owned by another project.
- Verification for both fixes: **4 files / 121 tests passed**
  (`/tmp/hype-property-identity-presentation-test.log`); `bun run check` passed with **0
  errors / 19 existing warnings**
  (`/tmp/hype-property-identity-presentation-check.log`); scoped `git diff --check`
  passed. No persisted database, deployment or commit changed.

## Broad verification and remaining review scope

- Earlier database/authorization gate: all 54 selected service, authorization,
  anonymous-access, task-list-permission and transaction suites passed (**1,014
  tests**). Selection:
  `rg --files src/tests | rg '(services\.test\.ts$|authorization\.|anonymous-authorization|task-list-permissions|crud-replacement|project-move-transaction|publication-transaction|user-state-transaction)'`,
  passed as file arguments to `bunx vitest run`. Output:
  `/tmp/hype-goal-db-auth-suite.log`. This supersedes old failures in those covered
  suites, not the remaining UI/script suites.
- An exploratory `bunx vitest run` completed with 410 passing / 30 failing files and
  3,834 passing / 64 failing tests. This run overlapped the mapped-column regression's
  red/green work; the later focused result above supersedes its CRUD failure. Output:
  `/tmp/hype-goal-vitest.log` (temporary local diagnostic, not a permanent artifact).
- All 24 feature-count migrations tests now pass with an FTS5-capable SQLite engine as
  documented above; the default installed CLI still lacks FTS5.
- The reproduced Location baseline clearing bug and the rematching/resource-pagination
  expectation failures are resolved above.
- Other failing suites require triage, including publication mocks, Location linking,
  account-change initialization, form/navigation and address UI, and script suites
  selected under Vitest. Do not treat the broad failure count as a count of confirmed
  application bugs.
- Hierarchy publication, project ancestry, and organisation capability split commits are
  resolved above. Continue reviewing multi-stage form saves for partial writes and
  concurrency effects before closing the database phase.
- Account-change initialization's existing regression spies on a feature refresh that
  `AdminCtx.init` intentionally no longer performs (the Feature route owns those reads).
  Test a resource that actually awaits initialization when reviewing reactivity.
- The two Bun migration fixture failures are resolved above; the required Location suite
  now passes.

The full database and permission review is ongoing. Continue through service writes,
transaction boundaries, role scoping and remote authorization before the systematic
reactivity/cache review. The selected passing suites above do not establish complete
coverage of those areas. This file records resolved bugs and verification, not Breadline
issue delivery status.

## 2026-11-04 — Restore deterministic Location and account-boundary regressions

- Location remote tests now explicitly select hosted mode and restore environment stubs
  afterward. Their hosted credential and pinned-source assertions no longer depend on
  Vite's development default; endpoint security tests still separately exercise loopback
  restrictions and dummy development credentials.
- Updated two draft relink assertions to require the submitted independent naming
  policy, consistent with the link/relink naming contract in
  `spec/breadline/proposal/01-places-features.md`. Retry and concurrent-association
  fences remain asserted.
- Account-change initialization now suspends an organisation refresh, which
  initialization actually awaits. Feature routes own their reads. The test continues to
  require a superseded attempt to leave initialization incomplete and a subsequent
  attempt to retry successfully.
- Verification: Location/endpoint tests passed **4 files / 90 tests**
  (`/tmp/hype-location-api-fixed.log`); context boundaries passed **1 file / 11 tests**
  (`/tmp/hype-context-boundaries-refresh.log`); scoped `git diff --check` passed. These
  are regression-fixture repairs, not newly discovered runtime defects.
- The completed full refresh before these repairs passed **429 files / 3,984 tests**,
  with **24 failing files / 53 failing tests** (`/tmp/hype-audit-full-refresh.log`).
  Failures include unavailable FTS5, sandbox subprocess restrictions, Bun suites
  collected by Vitest, and remaining assertions requiring investigation. Focused results
  above supersede only the corresponding failures. Database/permission and systematic
  reactivity/cache review remain ongoing.

## 2026-11-04 — Invalidate map thumbnails when rendered content is removed

- Reproduced four missed project-thumbnail refreshes with real SQLite queries: archiving
  a Feature, unpublishing a Feature, archiving a Layer, and turning off a Layer's
  default visibility. Candidate selection filtered out the changed rows after they
  stopped being renderable, leaving the previous thumbnail eligible for retention.
- Incremental project planning now considers changed Layers regardless of their current
  archive/default-visibility state, and changed Features in active default Layers
  regardless of their current publication/archive state. Layer planning also observes
  archived Feature changes. Payload loading still applies the existing visibility rules.
- Extended the SQL fixture with current historical-visibility columns. Added four
  regressions that first establish an unchanged resource produces no incremental job,
  then require removal to produce a project job with a changed hash. Feature-removal
  cases also require a Layer job with a changed hash.
- Verification: all four new regressions failed before the fix
  (`/tmp/hype-map-invalidation-red.log`); related regression tests passed **7 files / 34
  tests** (`/tmp/hype-map-invalidation-regression.log`). `bun run check` passed with **0
  errors / 19 existing warnings** (`/tmp/hype-map-invalidation-check.log`); scoped
  `git diff --check` passed.
- Boundary: query/hash verification, not a rendered-browser or deployed scheduler check.
  No persisted database, deployment or commit changed. The broader database/permissions
  and reactivity/cache audit remains active.

## 2026-11-04 — Fence superseded resource-detail reads

- Reproduced late responses crossing mutation reconciliation within the same account
  generation: an old success could invoke its stale commit, and an old permission denial
  could delete a newly retained detail entry with the same key.
- `CacheCtx.ensureResource` now checks both the account generation and retained entry
  identity before accepting results or applying errors. Superseded reads resolve without
  committing or evicting replacement data. Current permission denials still clear
  retained data and propagate; rejection from the native query promise now uses the same
  handling as rejection from its refresh method.
- Added regressions for success/denial after mutation reconciliation and account reset,
  verifying replacement retention and absence of stale commits. Added a current
  query-promise denial/recovery test. Existing transient-failure retention and scoped
  resource-consumer tests remain passing.
- Verification: both mutation-race regressions failed before the fix
  (`/tmp/hype-cache-superseded-red.log`); focused resource/cache/context tests passed
  **3 files / 38 tests** (`/tmp/hype-cache-superseded-green.log`). `bun run check`
  passed with **0 errors / 19 existing warnings**
  (`/tmp/hype-cache-superseded-check.log`); scoped `git diff --check` passed.
- Boundary: deterministic cache/controller tests, not browser or production
  verification. This closes the observed race, not the broader database/permissions and
  reactivity/cache audit. No persisted database, deployment or commit changed.

## 2026-11-04 — Validate task ancestry inside the creation transaction

- Reproduced a task being inserted under its former scope when its Feature moved after
  the preflight scope query. Read-side quarantine prevented normal reads of that
  inconsistent row but did not prevent its creation.
- `createTask` now evaluates the submitted Feature/project/organisation chain in the
  same D1 batch as insertion, using the existing transactional guard helper. Missing or
  moved targets retain the `400 TASK_FEATURE_SCOPE_MISMATCH` response. Normal database
  errors remain errors.
- Expanded the real SQLite fixture to run D1 batches through Drizzle's actual result
  mapping. Regression coverage changes Feature ancestry or project organisation
  immediately before writes, then requires rejection without inserting a task. Existing
  spoofed-scope and legacy-row isolation assertions remain intact. Updated the
  authorization design specification.
- Verification: the race regression failed before the fix
  (`/tmp/hype-task-scope-race-red.log`); focused task tests passed **4 files / 57
  tests** (`/tmp/hype-task-scope-race-green.log`). Wider database/authorization
  regression passed **62 files / 1,099 tests**
  (`/tmp/hype-task-scope-db-regression.log`). `bun run check` passed with **0 errors /
  19 existing warnings** (`/tmp/hype-task-scope-race-check.log`); scoped
  `git diff --check` passed.
- Remaining boundary: new-contribution Feature creation and subsequent task creation
  still execute separately in `createTaskWithDependencies`; photo upload is an external
  operation. Those enclosing creation/recovery semantics need further review. This fix
  does not claim whole-contribution atomicity. No persisted database, deployment or
  commit changed.

## 2026-11-04 — Commit contribution Features and review tasks together

- Removed separate Feature and task commits for new-feature contributions. Both
  immediate submissions and new draft submissions now use a combined transaction for
  Feature core, translations, properties, property translations and the review task. A
  task insertion failure cannot leave an orphaned Feature.
- Extracted reusable Feature-creation preparation and an in-batch scope assertion
  without changing standalone Feature form semantics. The combined service derives task
  ancestry from the validated Feature, rechecks Layer/project/organisation ancestry
  before writes, and verifies task scope after Feature insertion. Scope failure aborts
  the batch with `TASK_FEATURE_SCOPE_MISMATCH`.
- Translation/validation happens before persistence. Immediate submissions explicitly
  use final stage; new drafts retain draft stage. Session-owned attribution is forwarded
  to both records. External photo uploads still occur after the database commit.
- Added real SQLite coverage for draft/final success, task insertion failure, Feature
  translation failure, property translation failure, parent changes before execution and
  a parent change triggered during Feature insertion. Failure checks cover all inserted
  tables; the triggered parent change also rolls back. Every statement is checked
  against D1's 100-binding limit. Remote/API tests verify combined creation, stage and
  session attribution. Updated the authorization design specification.
- Verification: focused contribution/Feature/Location checks passed **6 files / 217
  tests** before adding the two final rollback cases
  (`/tmp/hype-contribution-atomic-tests.log`). The subsequent broader
  database/authorization run includes those cases and passed **64 files / 1,110 tests**
  (`/tmp/hype-contribution-db-regression.log`). `bun run check` passed with **0 errors /
  19 existing warnings** (`/tmp/hype-contribution-atomic-check.log`); scoped
  `git diff --check` passed.
- Remaining boundaries: updating an existing contribution draft still updates the
  Feature and task separately; external upload failures and retry/recovery semantics
  require further review. No persisted database, deployment or commit changed. The
  broader audit remains active.

## 2026-11-04 — Save contribution drafts and task ancestry atomically

- Replaced the existing-draft handler's separate Feature save and task ancestry update
  with a combined transaction. A late task failure now rolls back Feature core,
  geometry, translations, properties and property translations.
- Extracted unlinked Feature save preparation while preserving standalone save behavior.
  The composed draft save checks the captured task revision, contributor, type, parent
  identities, draft/review state and destination ancestry before writes. The Feature's
  own revision/draft/link guards still apply; an in-batch assertion rejects a skipped
  Feature update. A final task revision assertion also rolls back the Feature if the
  task update is skipped.
- Both revisions advance on success, and contributor attribution stays session-owned.
  Superseded combined saves return `409 STALE_TASK_DRAFT`. Removed the remote handler's
  independent task update; map scheduling happens only after the combined save returns.
- Added SQLite regressions for successful parent movement, late
  task/translation/property failures, skipped task writes, changed task/Feature
  revisions, task submission/review/contributor changes, Feature finalization, initial
  Location linking, and destination movement. Failure snapshots compare all persisted
  Feature/task relation columns and preserve concurrent changes. Remote/API tests verify
  the combined call and stale-conflict mapping. Updated the authorization design
  specification.
- Verification: focused tests passed **6 files / 232 tests**
  (`/tmp/hype-draft-atomic-tests.log`). Wider database/authorization regression passed
  **65 files / 1,124 tests** (`/tmp/hype-draft-db-regression.log`). `bun run check`
  passed with **0 errors / 19 existing warnings** (`/tmp/hype-draft-atomic-check.log`);
  scoped `git diff --check` passed.
- Boundary: this supersedes the prior separate existing-draft database boundary.
  External upload retry/recovery and task finalization still need review; the full audit
  remains active. No persisted database, deployment or commit changed.

## 2026-11-04 — Guard contribution finalization and retained evidence

- Replaced unconditional photo/report task submission with a conditional write that
  rechecks captured task revision, contributor, type, draft/review state and live
  Feature ancestry. Concurrent changes return `409 STALE_TASK_DRAFT` instead of
  submitting the changed task.
- All three contribution types now require at least one linked, existing, non-archived
  image at write time. Removing the last evidence link, deleting its image or archiving
  it after preflight prevents submission.
- New-Feature finalization also requires the Feature to remain a draft at its captured
  revision. An in-batch completion assertion rolls back task submission if the Feature
  update fails or is silently skipped. Feature revision capture now precedes content
  validation so an edit during validation cannot be accepted under a later, unvalidated
  revision.
- Added 31 SQLite scenarios across the three contribution types, covering success,
  task/Feature revision changes, ownership/review/submission changes, ancestry changes,
  evidence removal/archive/deletion, finalized Features, failed writes and skipped
  writes. Remote tests verify guarded photo/report submission and conflict handling.
  Updated the authorization design specification.
- Verification: focused finalization/review/remote tests passed **3 files / 49 tests**
  (`/tmp/hype-finalization-tests.log`). Wider database/authorization regression passed
  **66 files / 1,127 tests** (`/tmp/hype-finalization-db-regression.log`).
  `bun run check` passed with **0 errors / 19 existing warnings**
  (`/tmp/hype-finalization-check.log`); scoped `git diff --check` passed.
- Boundary: deterministic database and remote-handler tests; external upload
  retry/recovery still requires review. No persisted database, deployment or commit
  changed. The broader audit remains active.

## 2026-11-04 — Drain active upload work before exposing retry

- Reproduced early rejection in all three task-photo stages: upload authorization,
  object PUT and metadata finalization. A failed sibling caused the submission promise
  to reject while another operation was still pending, releasing the UI submission lock
  and permitting overlapping retry work.
- Each stage now waits for started operations to settle before returning the original
  error. The bounded metadata workers stop taking additional queued images after a
  failure while draining workers already in progress. Successful finalization remains
  limited to two workers and submits the task only after every image completes.
- Added deferred-operation client tests covering all three failure stages, preservation
  of the original error, absence of later-stage/task submission after failure, stopping
  untouched queued images, and the successful two-worker limit. Corrected the test
  fixture to use real timers instead of the repository's default fake timers.
- Verification: all three initial regression cases failed with the prior `Promise.all`
  behavior (`/tmp/hype-upload-drain-red.log`); the fixed client and related task tests
  passed **4 files / 36 tests** (`/tmp/hype-upload-drain-green.log`). `bun run check`
  passed with **0 errors / 19 existing warnings** (`/tmp/hype-upload-drain-check.log`);
  scoped `git diff --check` passed.
- Remaining boundary: this prevents overlapping attempts, but does not yet retain task
  IDs/prepared upload identities across retries. Photo/report draft recreation and
  duplicate uploads on retry still need review. No browser/R2 operation, persisted
  database, deployment or commit changed. The broader audit remains active.

## 2026-11-04 — Retain scoped contribution retry identities and completed upload stages

- Added form-owned retry retention to all three contribution actions. An unchanged
  request reuses its acknowledged draft, prepared upload identities, successful object
  PUTs and finalized images; only failed steps run again. A lost task-submission
  response retries finalization with the same task ID instead of recreating/updating a
  potentially submitted draft.
- Retention is bounded to the current account revision, surface scope, serialized
  contribution fields and exact ordered File identities. Scope/content/file changes
  replace the attempt, and late results from an invalidated attempt cannot start
  subsequent steps. Components clear retention after success and on destruction.
  Concurrent requests for the same step share its pending promise.
- Server-issued upload expiry bounds unfinished credential-dependent retention. An
  expired unfinished attempt starts fresh authorization on the next invocation; already
  acknowledged image finalizations remain reusable without their expired upload
  credentials. This avoids indefinitely replaying an expired token.
- Added client tests for failures in each upload stage and final submission,
  photo/report/new-Feature acknowledgment recovery, scope/content/file/disposal
  isolation, pending-step deduplication, account changes during requests, and expired
  unfinished versus completed credentials.
- Verification: disabling cross-invocation retention reproduced all six integration
  failures (`/tmp/hype-retry-red.log`). Fixed retry/task/resource/context tests passed
  **6 files / 68 tests** (`/tmp/hype-retry-final-tests.log`). `bun run check` passed
  with **0 errors / 19 existing warnings** (`/tmp/hype-retry-final-check.log`); scoped
  `git diff --check` passed.
- Boundary: in-memory recovery within the live form, verified with deferred/mocked
  remote operations and component type checking, not a browser/R2 run. Draft creation
  whose response was never acknowledged, reloads, and ambiguous image finalization after
  token expiry still lack durable server reconciliation and can leave orphaned
  drafts/duplicate uploads. No persisted database, external upload, deployment or commit
  changed. The broader audit remains active.

## 2026-11-04 — Hide retained resource details after background denial

- Confirmed from the installed SvelteKit query implementation that failed refreshes
  retain `current` while setting the shared reactive `error`. Reproduced active
  ResourceDetail consumers continuing to expose the retained private payload after
  background 401, 403 and 404 responses; removing the cache entry alone did not
  invalidate those handles.
- ResourceDetail now checks both its local error and the native query's shared error
  before exposing data. Its load return value uses the same guarded getter. All
  consumers of the shared query hide denied/deleted data; successful recovery restores
  it, while transient errors such as 503 retain the compatible snapshot.
- Added three denial/recovery regressions, a transient-error retention test and a Svelte
  reactive observer test for a sibling consumer. The reactive test uses the client/jsdom
  environment; ordinary controller tests remain in Node.
- Verification: the three denial regressions failed before the fix
  (`/tmp/hype-detail-denial-red.log`). Fixed resource/cache/context/reactivity tests
  passed **5 files / 45 tests** (`/tmp/hype-detail-denial-green.log`). `bun run check`
  passed with **0 errors / 19 existing warnings**
  (`/tmp/hype-detail-denial-final-check.log`); scoped `git diff --check` passed.
- Boundary: native-runtime source inspection plus deterministic controller/Svelte
  reactivity tests, not live browser or production authorization verification. No
  persisted database, deployment or commit changed. The broader audit remains active.

## 2026-11-04 — Hide denied resource-list pages and fallback snapshots

- Reproduced five failures covering shared native 401/403/404 errors, owned refresh
  denial and pagination denial: retained private rows remained visible despite access
  failure.
- ResourceList now hides rows and pagination cursors on local or shared native denial.
  Owned denial clears traversal/history retention; fresh-query and history shortcuts no
  longer prevent recovery requests. Focus revalidation also bypasses freshness after
  denial.
- Latched rows retain their native provenance, so a sibling refresh denial hides the old
  snapshot while a replacement search is loading. Successful replacement clears fallback
  retention. Transient 503 errors still preserve compatible rows.
- Verification: five regressions failed before implementation
  (`/tmp/hype-list-denial-red.log`). Resource list/detail/reactivity tests passed **3
  files / 31 tests** (`/tmp/hype-list-denial-green.log`), including fallback provenance
  and transient failure cases. `bun run check` passed with **0 errors / 19 existing
  warnings** (`/tmp/hype-list-denial-final-check.log`). Scoped `git diff --check`
  passed.
- Boundary: deterministic controller tests; no live browser or production authorization
  check. FeatureQuery/map retention and broader audit failures remain under review. No
  persisted database, deployment or commit changed.

## 2026-11-04 — Hide denied feature lists, previews and map snapshots

- Reproduced nine regressions where shared native 401/403/404 errors left feature rows,
  totals, facets, pagination cursors or map snapshots visible, and denied inactive pages
  could return through history or entity previews.
- FeatureQuery now checks native and local errors before exposing active data. Preview
  rows check their native provenance both when selected and when displayed. Denied
  history cannot bypass refresh; recovery discards denied traversal state and map
  exclusion IDs before refetching. Transient shared failures preserve compatible rows
  and aggregates.
- Added controller cases for all three denial statuses, active and inactive
  previews/history, map return visits and immediate recovery. Added Svelte/jsdom
  observers verifying active list/map rows and retained previews react to sibling native
  errors.
- Verification: nine new cases failed before the fix
  (`/tmp/hype-feature-denial-red.log`). Feature
  list/map/integration/saved-panel/reactivity suite passed **5 files / 80 tests**
  (`/tmp/hype-feature-denial-green.log`). `bun run check` passed with **0 errors / 19
  existing warnings** (`/tmp/hype-feature-denial-final-check.log`); scoped
  `git diff --check` passed.
- Boundary: installed native-runtime inspection, controller tests and reactive
  observers, not live browser or production authorization verification. The broader
  audit remains active; no persisted database, deployment or commit changed.

## 2026-11-04 — Deduplicate detail refreshes and account for native in-flight reads

- Reproduced six regressions: concurrent detail consumers each refreshed the same query,
  a forced first load refreshed twice, stale background reads duplicated work, initial
  native transport was restarted, and shared denial could remain behind a fresh-cache
  shortcut.
- Cache entries now own one in-flight operation and its current consumer reconciliation
  callbacks. Initial or already-running native requests are awaited; explicit refresh
  uses the same cache path and updates freshness. Denial bypasses retained freshness,
  all waiting consumers receive shared failures, and obsolete operations still cannot
  commit or evict replacement entries.
- Added coverage for concurrent initial/background/forced reads, every consumer
  callback, shared denial and recovery, already-running native refresh, and freshness
  after an explicit refresh.
- Verification: all six initial regressions failed before the fix
  (`/tmp/hype-detail-refresh-red.log`). Combined resource/feature/map/cache/reactivity
  suite passed **10 files / 142 tests** (`/tmp/hype-cache-audit-regression.log`),
  including the existing superseded-operation checks. `bun run check` passed with **0
  errors / 19 existing warnings** (`/tmp/hype-detail-refresh-check.log`).
- Boundary: deferred native-query simulations and installed-runtime inspection; no live
  network/browser timing claim. No persisted database, deployment or commit changed.

## 2026-11-04 — Reconcile retained feature membership with native refreshes

- Reproduced retained previews and map markers surviving a successful native response
  that removed their row. Cached previews also kept old payloads after the native owner
  returned updated fields.
- Retained previews now resolve each identity against its native owner's current payload
  and recheck active selectors. Map snapshots track their latest owner within the
  existing bounded native-page set, removing missing identities while preserving marker
  order and native rollback. An older overlapping page cannot revive a row removed by
  its newer owner.
- Verification: the initial two membership regressions failed before the fix
  (`/tmp/hype-feature-membership-red.log`). Combined cache suite passed **10 files / 142
  tests** (`/tmp/hype-cache-audit-regression.log`), including active selector changes,
  overlapping native ownership and rollback. Scoped `git diff --check` passed.
  `bun run check` passed with **0 errors / 19 existing warnings**
  (`/tmp/hype-cache-audit-final-check.log`). Full-suite refresh is still running; its
  result is not yet evidence of completion.
- Boundary: deterministic controllers/reactive observers; the broader audit remains
  active. No persisted database, deployment or commit changed.

## 2026-11-04 — Restore portable database and full-suite validation

- Refreshed the entire Vitest suite after the cache fixes: **443 files passed / 19
  failed; 4,086 tests passed / 46 failed** (`/tmp/hype-audit-full-current.log`). The run
  completed; it was not interrupted or restarted while live.
- Routed all script tests to their required Bun runtime with `test:scripts`, included in
  every full-run package command, and excluded them from Vitest. All 19 script test
  files currently import Bun APIs; this repairs collection rather than omitting their
  coverage.
- Replaced the feature-count migration suite's external SQLite CLI with the same
  FTS5-capable Node SQLite used by other migration tests. SQLite itself parses the test
  statements, including CTEs; all migrations, transactions, FK cascades and rollup
  comparisons remain real in-memory SQLite. Count/search migration tests passed **2
  files / 30 tests** (`/tmp/hype-count-native-sqlite.log`).
- Framework compatibility probes now execute native data-URL modules outside Vite
  transforms instead of attempting a blocked child Node executable. Both framework
  assertions pass (`/tmp/hype-framework-native-probe.log`).
- Repaired the application-restoration fixture to create its own organisation/project
  instead of updating historic seeds removed by migration 0099. Added a
  project-restoration assertion and a 20-second budget for building two fully migrated
  databases and running the restore subprocess. Both tests passed with **13 assertions**
  (`/tmp/hype-local-application-test.log`); account/session/user preservation checks
  remain intact.
- Updated stale UI/controller fixtures to exercise current contracts:
  navigation-snapshot invalidation on save; canonical translation tags and remote
  translation race protection; deferred address-reference normalization and inferred
  types; accessible non-cloned member names; delegated tooltip metadata; and the current
  Location/Updates navigation. Focused runs passed **10 navigation tests**, **13
  presentation tests**, and **8 editor/translation tests**
  (`/tmp/hype-navigation-harness.log`, `/tmp/hype-presentation-contracts.log`,
  `/tmp/hype-editor-contracts.log`).
- Deployment tests now mock configuration/domain inventory and both database consumers
  before the app, verify preserved routes and temporary-config cleanup, and assert that
  failed inventory prevents any deployment call. No external commands, account writes or
  deployments were performed by those tests.

## 2026-11-04 — Normalize geocoded components before introducing abbreviations

- Fixed uppercase provider addresses skipping casing normalization because abbreviating
  `ROAD` to `Rd` first made the assembled label appear intentionally mixed-case.
  Normalize each English source component before abbreviating the street, preserving
  intentional branding and Roman numerals.
- The original uppercase regression now passes; added a mixed-brand/uppercase-component
  case that also proves the provider payload and retained raw source evidence are
  unchanged.
- Verification: geocoding, address-formatting and mocked deployment tests passed **3
  files / 26 tests** (`/tmp/hype-geocoding-deploy-tests.log`). Full Vitest, Bun
  script/location suites and type checking are running; final results will be recorded
  when available.
- Boundary: local deterministic tests and disposable fixture databases only. The broader
  database/authorization/reactivity audit remains active; no persisted application
  database, commit or deployment changed.

## 2026-11-04 — Full validation baseline restored

- Full Vitest run completed successfully: **454 files / 4,134 tests passed**
  (`/tmp/hype-audit-full-repaired.log`, 126.30 seconds). This supersedes the prior
  19-file / 46-test failure report for the tested current implementation.
- Full Bun script suite completed successfully: **19 files / 90 tests / 574 assertions
  passed** (`/tmp/hype-script-tests-final.log`). The real-migration/Python import cases
  now have explicit 20-second test limits; a loaded run exceeded the former five-second
  default at 5.20 seconds without a failed rollback assertion. The actual import,
  rollback and identity assertions were preserved.
- Required Bun Location suite passed: **16 tests / 50 assertions**
  (`/tmp/hype-location-bun-final.log`). Combined runtime totals: **4,240 passing
  tests**.
- `bun run check` passed with **0 errors / 19 existing warnings in 4 files**
  (`/tmp/hype-audit-repaired-check.log`). Scoped whitespace validation passed.
- Completion boundary: these are repository test and type-check results, not evidence
  that every database/permission path or real browser/network failure has been audited.
  Remaining upload-reconciliation boundaries documented above and further service/cache
  review remain open. No application database migration, external upload, commit or
  deployment was performed.

## 2026-11-04 — Atomic Feature-upload confirmation with live task guards

- Found direct-upload confirmation checking task permissions before storage
  verification, then separately inserting an image, Feature assignment and task links.
  Task submission/review, ownership changes or reparenting during that gap could
  invalidate the earlier authorization; later link failure could leave partial database
  writes.
- Added a D1 transaction for Feature uploads that validates the live Feature/parent
  chain and every requested task before writes. Tasks must remain unreviewed and in the
  same canonical Feature scope; contributor-only access additionally requires an owned
  draft. Image, Feature assignment and all task links commit together, with completion
  checks that also reject silently skipped writes. A changed context returns
  `409 STALE_IMAGE_UPLOAD_CONTEXT` before scheduling metadata sidecars or derived-asset
  warmup.
- Reused the existing deterministic upload identity. Retries preserve stored image
  versions and moderation decisions, reject archived/reassigned contributor images, and
  deduplicate links. A single JSON-bound task list keeps every statement within the D1
  binding budget, verified with 250 attachments.
- New evidence links now advance the task revision monotonically in that transaction,
  invalidating pending review snapshots that used an older evidence set. Replaying an
  existing link does not advance the revision. This closes an additional race discovered
  while checking the review boundary.
- Added 20 real-SQLite scenarios covering current and stale state, ancestry/ownership
  drift, failed and skipped writes, canonical-slot conflicts, replay preservation, admin
  attachment, revision monotonicity and binding counts. Added remote stale-context
  coverage and updated the authorization design specification.
- Verification: disabling the initial/final guards caused **12 regressions to fail**
  (`/tmp/hype-image-upload-guards-disabled.log`); the revision regression also failed
  before revision advancement (`/tmp/hype-image-evidence-revision-red.log`). Restored
  focused upload/task/auth tests passed **7 files / 98 tests**
  (`/tmp/hype-image-upload-green.log`). The final database/authorization gate passed
  **67 files / 1,147 tests** (`/tmp/hype-upload-db-auth-final.log`). `bun run check`
  passed with **0 errors / 19 existing warnings**
  (`/tmp/hype-image-upload-final-check.log`); scoped `git diff --check` passed.
- Boundary: database atomicity and mocked remote/storage checks, not an actual R2
  upload. Object storage remains outside the D1 transaction. Project/organisation/hub
  image-pointer writes, replacement uploads and durable recovery after
  unacknowledged/expired requests remain separate review boundaries. No persisted
  application database, external upload, commit or deployment changed.

## 2026-11-04 — Preserve referenced images during detached-upload cleanup

- Found background single-resource upload cleanup deleting the previous image
  unconditionally, even when a project, organisation, hub, Feature or task still
  referenced it at cleanup time.
- Added `deleteDetachedImage`: all five reference checks run inside one conditional
  DELETE. Cleanup removes storage assets only if that statement returns a deleted row;
  missing/already-cleaned and currently referenced images skip asset deletion. Database
  failures continue to preserve storage.
- Verification: real SQLite coverage checks each reference type, subsequent detachment,
  repeat cleanup and preservation of unrelated rows. Remote coverage checks that a
  skipped deletion retains storage assets. Focused upload/cleanup tests passed **3 files
  / 71 tests** (`/tmp/hype-image-cleanup-tests.log`). `bun run check` passed with **0
  errors / 19 existing warnings** (`/tmp/hype-image-cleanup-check.log`); scoped
  whitespace validation passed.
- Boundary: database and mocked storage verification only. Single-resource upload
  pointer retries, replacement writes and storage identity reuse across separate image
  rows remain open audit boundaries. Object storage is outside the database transaction.
  No persisted application database, external upload, commit or deployment changed.

## 2026-11-04 — Atomic resource image confirmation and stale-retry rejection

- Found project, organisation and hub upload confirmations inserting an image and
  overwriting the resource pointer separately. Replaying an older upload could replace a
  newer selection; checking for an existing upload row alone would not prevent
  resurrection after detached-image cleanup.
- New single-resource upload grants now sign the original image pointer, resource
  revision and parent scope, captured before authorization. Added validated snapshot
  claims and an atomic confirmation service that accepts only an unchanged new-upload
  target or a still-selected replay in the same scope. Image insertion and pointer
  updates roll back together on errors or skipped writes. New selection advances the
  revision monotonically; replay preserves the stored image and resource revision.
- Confirmation rejects stale or snapshot-less single-resource grants with
  `409 STALE_IMAGE_UPLOAD_CONTEXT`, without scheduling sidecars, cleanup or derived
  assets. Previously issued single-resource grants without snapshots must be renewed.
  Feature and explicit replacement grants retain their separate paths. Updated the
  authorization design specification.
- Verification: **28 real-SQLite cases** cover all three resource types, competing
  grants, replay, cleanup followed by retry, missing/reparented targets, revision
  changes, archived/altered images, failed/skipped pointer updates and skipped image
  insertion. Disabling the initial transaction guard caused **9 failures**
  (`/tmp/hype-resource-upload-initial-guard-disabled.log`); restored focused
  service/remote/token/route/cleanup tests passed **6 files / 143 tests**
  (`/tmp/hype-resource-upload-tests.log`). Remote tests exercise success, conflicts,
  missing claims and cleanup for each resource type; token tests validate signed
  snapshots.
- The broader database/authorization gate passed **69 files / 1,177 tests**
  (`/tmp/hype-resource-upload-db-auth.log`); the three additional skipped-image tests
  subsequently passed in the focused gate. `bun run check` passed with **0 errors / 19
  existing warnings** (`/tmp/hype-resource-upload-check.log`); scoped whitespace
  validation passed.
- Boundary: disposable SQLite and mocked remote/storage evidence, not a live R2 upload.
  Request authorization remains required; scope guards are not a claim of transactional
  role revalidation. Explicit replacement uploads, legacy non-direct creation, durable
  recovery after expiration and storage identity reuse across separate image rows remain
  audit boundaries. No persisted application database, external upload, commit or
  deployment changed.

## 2026-11-04 — Atomic image metadata and Feature-assignment edits

- Reproduced canonical promotion being silently skipped after the previous canonical
  image had already been demoted. Added an in-transaction final-value assertion;
  missing, failed and skipped assignment writes now preserve the previous canonical
  selection.
- Found the shared image-edit service saving core metadata before its Feature assignment
  in a separate transaction. Added a composed operation that guards both targets, writes
  image/assignment changes together and verifies submitted values before commit.
  Canonical demotion participates in the same batch. Assignment-only edits no longer
  rewrite the image timestamp merely because the payload contains its ID.
- Preserved the caller's supplied image identity during authorization instead of
  overwriting it with the route identity. Mismatched core/assignment identities are
  rejected. Malformed assignment fields, including missing Feature identity, now produce
  a 400 response before writes instead of silently turning a compound edit into an
  image-only save.
- Verification: the skipped-promotion regression failed before the fix
  (`/tmp/hype-canonical-skipped-red.log`). Restoring separate image/assignment writes
  made the API rollback regression fail
  (`/tmp/hype-image-edit-separate-writes-red.log`), and the missing-assignment
  regression failed before strict validation
  (`/tmp/hype-image-edit-missing-assignment-red.log`). Restored focused checks passed
  **7 files / 162 tests** (`/tmp/hype-image-edit-tests.log`), including 16 new
  real-SQLite/service-orchestration cases and the canonical regression. The
  database/authorization gate passed **71 files / 1,208 tests** before the final
  missing-assignment test was added (`/tmp/hype-image-edit-db-auth.log`); that
  additional case passed in the focused run. Scoped whitespace validation passed.
  `bun run check` passed with **0 errors / 19 existing warnings**
  (`/tmp/hype-image-edit-final-check.log`).
- Updated the authorization design specification. The revision-batch helper accepts
  statement arrays because it always prepends its own required guard statement;
  atomicity is unchanged.
- Boundary: request authorization precedes the transaction; these checks prove
  target/value atomicity, not complete transactional permission revalidation.
  Replacement object-key reuse, image edits invalidating pending task-review snapshots,
  and context/ancestry drift between authorization and mutation remain open review
  items. No persisted application database, external upload, commit or deployment
  changed.

## 2026-11-04 — Invalidate pending task reviews when image evidence changes

- Reproduced a pending photo review committing after its attached image had been
  replaced. Image edits changed evidence without advancing the task revision used by
  review guards; explicit deletion similarly removed evidence links without invalidating
  the snapshot.
- Added a shared, monotonic pending-task revision operation inside image-edit,
  assignment-edit, Feature-upload and explicit-deletion transactions. Core-image changes
  invalidate all pending/draft tasks using that image. Assignment changes are scoped to
  the task's Feature and also invalidate tasks using a demoted canonical image.
  Reviewed/unrelated tasks and no-op edits keep their revisions; no-op core edits also
  avoid rewriting the image timestamp.
- The revision update and adjacent `changes()` assertion execute before evidence
  mutations. A skipped revision update aborts the whole batch. Explicit image deletion
  now also verifies that the image and both link types were removed before commit,
  preserving revisions/links and avoiding storage cleanup on skipped deletions.
- Verification: both initial stale-review/revision regressions failed before the fix
  (`/tmp/hype-image-evidence-edit-red.log`). Focused SQLite, service, remote, upload and
  task-review checks passed **7 files / 162 tests**
  (`/tmp/hype-image-evidence-tests.log`), including actual stale review attempts after
  edits and deletion, canonical demotion, scope isolation, no-op replay,
  future-timestamp monotonicity, skipped revisions, failed/skipped image writes and
  skipped deletion. The existing 250-link upload/binding-budget check also passes with
  the shared revision operation.
- Broader database/authorization gate passed **71 files / 1,220 tests**
  (`/tmp/hype-image-evidence-db-auth.log`). `bun run check` passed with **0 errors / 19
  existing warnings** (`/tmp/hype-image-evidence-final-check.log`); scoped whitespace
  validation passed. Updated the authorization design specification.
- Boundary: real disposable SQLite and mocked remote/storage behavior. This does not
  establish transactional role/context revalidation or make R2 writes atomic with D1.
  Replacement/rotation object-key reuse, remaining legacy mutation paths and durable
  upload recovery remain audit boundaries. No persisted application database, external
  upload, commit or deployment changed.

## 2026-11-04 — Preserve authorized image scope through edit and deletion transactions

- Found image-edit/deletion transactions checking target existence without preserving
  the resource membership and parent chain used during authorization. A detached image
  or reparented Feature/project/task could therefore be mutated after its earlier
  authorization check.
- Added pre-authorization snapshots of the complete persisted image state and canonical
  resource scope for Feature, project, organisation, hub and task contexts.
  Edit/deletion transactions require the captured state and scope before any image, link
  or task-revision writes; edits also recheck scope before commit. Image state uses all
  persisted columns, catching changes even when the timestamp remains the same.
- Wired snapshots through shared image edits and explicit deletion. Scope/state
  conflicts return `409 STALE_IMAGE_UPDATE` or `409 STALE_IMAGE_DELETE`; deletion
  conflicts schedule no storage cleanup. Normal request authorization remains in place.
- Verification: **19 new real-SQLite/service-orchestration cases** cover all five
  contexts, image changes with unchanged timestamps, detached pointers/links, valid
  reparenting, missing ancestry, changed task Feature/organisation, drift during
  authorization/attribution lookup under a project-maintainer account, and full rollback
  when a write removes its authorized association. Disabling the edit transaction scope
  guards caused **all 19 to fail** (`/tmp/hype-image-scope-guards-disabled.log`).
  Restored focused checks passed **6 files / 166 tests**
  (`/tmp/hype-image-scope-tests.log`), including remote deletion conflict/no-cleanup
  coverage.
- Broader database/authorization gate passed **71 files / 1,239 tests**
  (`/tmp/hype-image-scope-db-auth.log`). `bun run check` passed with **0 errors / 19
  existing warnings** (`/tmp/hype-image-scope-final-check.log`); scoped whitespace
  validation passed. Updated the authorization design specification.
- Boundary: these checks preserve the scope authorized for the request; they do not
  re-read persisted role grants inside the transaction. Replacement/rotation writes to
  reused storage keys, other legacy mutation paths and durable upload recovery remain
  audit boundaries. Evidence is disposable SQLite and mocked remote/storage behavior. No
  persisted application database, external upload, commit or deployment changed.

## 2026-11-04 — Isolate replacement uploads and reject competing confirmation grants

- Found explicit replacements uploading over the currently selected object key before
  confirmation. Separate replacement grants now receive distinct storage keys and signed
  snapshots of the original image, resource scope, Feature-assignment state and source
  object namespace/version. Legacy or same-object replacement tokens fail closed.
- Confirmation applies the signed pre-upload state, rather than treating the state
  observed after upload as permission to overwrite it. Competing/superseded grants
  reject without database changes or sidecar scheduling. Confirmed retries reuse the
  still-current replacement identity and preserve stored version, moderation (including
  later archival), metadata and task revisions. Fresh image/assignment writes remain
  atomic, with skipped-write checks before committing.
- Added assignment state to mutation snapshots after identifying publication changes
  that leave the image row unchanged. A pending replacement cannot restore pre-review
  publication settings; an already-committed replay remains read-only and preserves
  later moderation.
- Consolidated replacement sidecar persistence with the upload retry path. Existing
  sidecars are retained; missing sidecars use the committed version/timestamp and the
  signed original source for recovery. New metadata records the retained source
  key/environment/version. Replacement does not delete the old source assets. Client
  replacement-result handling already adopts the returned image/publicId; no client
  change was required.
- Verification: seven real-SQLite/service scenarios cover all four upload contexts,
  competing/superseded grants, replay after moderation/archival, failed/skipped writes,
  task revision preservation and publication changes during upload. Nine remote
  scenarios cover fresh keys, signed source propagation, source-stage reads,
  stale/missing claims, retry preservation and sidecar recovery without old-key writes.
  Token coverage rejects missing/mismatched snapshots and same-object replacement
  claims. Disabling the signed-state guard reproduced **four competing-replacement
  failures** (`/tmp/hype-replacement-snapshot-disabled.log`). Restored focused checks
  passed **7 files / 221 tests** (`/tmp/hype-replacement-tests.log`).
- Broader database/authorization gate passed **71 files / 1,246 tests**
  (`/tmp/hype-replacement-db-auth.log`). `bun run check` passed with **0 errors / 19
  existing warnings** (`/tmp/hype-replacement-final-check.log`); scoped whitespace
  validation passed. Updated the authorization design specification.
- Boundary: distinct replacement grants are isolated; this does not make an individual
  signed PUT URL write-once. Repeated PUTs using one still-valid URL, concurrent sidecar
  persistence for the same grant, rotation storage writes, retained/orphan object
  lifecycle and durable recovery after token expiration remain open audit items.
  Verification used disposable SQLite and mocked storage, not live R2. No persisted
  application database, external upload, commit or deployment changed.

## 2026-11-04 — Prevent repeated upload requests from overwriting occupied originals

- Confirmed direct upload URLs permitted repeated PUTs for their full validity,
  including after confirmation. New URLs cryptographically bind `If-None-Match: *`;
  authorization returns the required header. Updated the managed raw-bucket CORS policy
  and rollout documentation to allow that header before application rollout. Existing
  issued URLs are not revoked.
- Closed the equivalent proxy upload path: reserve the original with R2's atomic
  create-only condition before creating sidecars, and apply the condition to every
  sidecar. Collisions return 412. Removed snapshot/restore rollback, which could
  overwrite another writer or delete an original already referenced by concurrent
  confirmation. Partial objects now remain on failure; retry requires a fresh grant and
  retained-object lifecycle remains separate work.
- Client explicitly rejects 412 and asks for a new upload. A collision is not accepted
  as successful recovery because size/type alone cannot establish matching bytes after a
  lost response.
- Verification: real aws4fetch signatures change when the condition is removed or
  altered. Conditional storage simulations cover concurrent requests, repeated requests,
  replacements, occupied sidecars and partial failure without deletion. Removing the
  proxy condition reproduced three failures (`/tmp/hype-create-only-disabled.log`).
  Restored focused tests passed **6 files / 123 tests**
  (`/tmp/hype-create-only-final-tests.log`). `bun run check` passed with **0 errors / 19
  existing warnings** (`/tmp/hype-create-only-final-check.log`); scoped whitespace
  validation passed.
- API behavior was checked against current public R2 S3 compatibility and Workers API
  documentation (local captures `/tmp/hype-r2-s3-api.html` and
  `/tmp/hype-r2-workers-api.html`). Tests use the real signer and mocked storage, not
  live bucket requests. Live CORS configuration was not applied. No persisted
  application database, external upload, commit or deployment changed. Concurrent
  confirmation sidecars, rotation writes, deletion/recreation of keys, content-verified
  recovery and orphan lifecycle remain audit boundaries; the broader audit is
  incomplete.

## 2026-11-04 — Isolate rotation assets until guarded database selection

- Found rotation overwriting the active original and metadata before the database
  update. Failed database writes, stale authorization scope and competing rotations
  could therefore change displayed bytes without a corresponding committed image/task
  revision.
- Rotation now captures the image/scope/assignment snapshot before authorization and
  checks that it matches the loaded source. It prepares rotated bytes and all sidecars
  under a fresh random key, then uses the shared replacement transaction to select that
  key only while the captured state remains valid. The transaction invalidates affected
  pending task reviews. Warmup is scheduled only after successful selection. Old sources
  and unsuccessful prepared assets are retained.
- Verified the existing client rotation flow reloads image state after success and
  invalidates the relevant Feature cache, so it follows the new public ID without a
  client change. This is source inspection, not rendered browser verification.
- Added remote cases for stale database state, database failure and source drift before
  authorization; updated successful and direct-R2-fallback rotation checks to require
  isolated keys. Reintroducing active-key writes reproduced **four failures**
  (`/tmp/hype-rotation-isolation-disabled.log`). Restored focused remote, service and
  real-SQLite transaction checks passed **4 files / 145 tests**
  (`/tmp/hype-rotation-restored-tests.log`), including existing competing-replacement,
  rollback, moderation and review-revision coverage. `bun run check` passed with **0
  errors / 19 existing warnings** (`/tmp/hype-rotation-final-check.log`); scoped
  whitespace validation passed.
- Boundary: no live R2 request, application database mutation, commit or deployment.
  Same-grant concurrent confirmation sidecars, retained-object lifecycle, legacy image
  creation paths and final rendered cache/reactivity verification remain open audit
  work. The overall audit remains incomplete.

## 2026-11-04 — Preserve canonical upload metadata across concurrent confirmations

- Found concurrent confirmations could both observe missing metadata and overwrite one
  another's sidecars. Retries also skipped all persistence when an existing versioned
  document was found, leaving a missing mirror or manifest unrepaired after partial
  persistence.
- Versioned metadata now uses an atomic create-only write. A collision reads the exact
  existing versioned document and publishes its content to the unversioned mirror;
  missing/conflicting canonical versions stop persistence. Every successful confirmation
  schedules mirror/manifest repair, including retries with existing metadata. Rotation
  uses the same persistence helper on its isolated key.
- Extended direct R2 PUT support with a signed create-only condition and a distinct
  collision result, preserving the condition when binding writes fall back to the API.
  Other failed writes still throw.
- Verification: stateful storage simulations cover competing confirmations with
  different credits and recovery when only canonical metadata survives. Real signer
  coverage verifies the fallback condition and collision behavior. Removing the
  condition reproduced **two failures** (`/tmp/hype-sidecar-condition-disabled.log`).
  Restored focused tests passed **4 files / 141 tests**
  (`/tmp/hype-sidecar-restored-tests.log`). `bun run check` passed with **0 errors / 19
  existing warnings** (`/tmp/hype-sidecar-final-check.log`); scoped whitespace
  validation passed.
- Boundary: first successful metadata persistence elects the canonical document; this
  does not make metadata and D1 one transaction or establish content-hash verification.
  Tests use mocked R2 storage and real signing, not live uploads. Retained-object
  lifecycle, legacy creation paths, durable recovery after grant expiration and rendered
  cache/reactivity verification remain open. No application database mutation, external
  upload, commit or deployment occurred; the overall audit remains incomplete.

## 2026-11-04 — Make legacy image creation and association atomic

- Found the legacy `createImage` remote still inserting images separately from Feature
  assignments and project/organisation/hub pointer updates. Failed or skipped
  association writes could leave orphan images; resource pointer updates did not
  preserve the state observed before authorization.
- Routed legacy creation through the existing guarded Feature and single-image-resource
  batches. Legacy creates supply fresh server-generated IDs, preserving their prior
  fresh-row semantics instead of adopting upload identity replay.
  Project/organisation/hub state is captured before authorization and must still match
  at commit. Missing or stale contexts return 409 without partial persistence.
- Added eight real-SQLite cases covering distinct legacy IDs, competing pointers,
  skipped pointer writes and skipped Feature assignment writes. Added four remote cases
  verifying pre-authorization snapshots, guarded service routing and missing-resource
  rejection. Existing upload replay behavior remains covered.
- Verification: focused checks passed **3 files / 141 tests**
  (`/tmp/hype-legacy-create-restored-tests.log`). Broader database/authorization gate
  passed **71 files / 1,254 tests** (`/tmp/hype-legacy-create-db-auth.log`).
  `bun run check` passed with **0 errors / 19 existing warnings**
  (`/tmp/hype-legacy-create-final-check.log`); scoped whitespace validation passed.
  Updated the authorization design specification.
- Boundary: these transactions do not re-read role grants. Feature creation still
  warrants a separate audit of parent-scope drift between authorization and insertion.
  Content identity verification, retained-object lifecycle, durable recovery and
  rendered cache/reactivity verification remain open. No persisted application database,
  external upload, commit or deployment changed; the overall audit remains incomplete.

## 2026-11-04 — Preserve authorized Feature ancestry through image creation

- Found Feature image creation guarding target existence without preserving the parent
  identities used during authorization. Moving a Feature to a different project, moving
  its project to another organisation, or changing its organisation's hub during
  authorization could therefore carry earlier permissions into the new scope.
- Added a canonical Feature creation snapshot containing project, organisation and
  nullable hub identities. Both legacy creation and new-upload confirmation capture it
  before their current authorization check and pass it to the atomic insertion batch.
  Missing ancestry rejects. The batch checks those identities before writes and before
  commit, rolling back image/assignment writes and any in-transaction scope change on
  conflict. Replacements continue using their existing image/scope snapshots.
- Verification: six real-SQLite cases cover three kinds of parent drift, in-transaction
  drift with full rollback, and successful unchanged scopes with and without a hub.
  Remote checks verify capture-before-authorization, propagation and missing-scope
  rejection. Disabling ancestry conditions reproduced **four failures**
  (`/tmp/hype-feature-scope-disabled.log`). Restored focused checks passed **2 files /
  115 tests** (`/tmp/hype-feature-scope-final-tests.log`). `bun run check` passed with
  **0 errors / 19 existing warnings** (`/tmp/hype-feature-scope-final-check.log`);
  scoped whitespace validation passed. Updated the authorization design specification.
- Boundary: snapshots preserve the scope authorized by the current request; they do not
  re-read role grants inside the transaction. Retained-object lifecycle, content
  identity verification, durable recovery and rendered cache/reactivity verification
  remain open audit work. No persisted application database, external upload, commit or
  deployment changed; the overall audit remains incomplete.

## 2026-11-04 — Revalidate the full suite and public rendered interactions

- Full current-tree Vitest run passed **459 files / 4,307 tests**
  (`/tmp/hype-audit-full-current.log`, 121.94 seconds). Bun script checks passed **19
  files / 90 tests / 574 assertions** (`/tmp/hype-audit-scripts-current.log`), and
  Location checks passed **16 tests / 50 assertions**
  (`/tmp/hype-audit-location-current.log`). Combined total: **4,413 passing tests**.
- Used installed Playwright Chromium with the repository's local map launch option for a
  read-only public UI check. Verified hydration, Maps and Filters panel opening,
  division search narrowed to Kowloon results, and clearing search restored Wan Chai and
  other divisions. No page errors were observed. Inspected captures
  `/tmp/hype-audit-public.png` and `/tmp/hype-audit-public-filters.png`.
- The initial text locator targeted a responsive hidden label; the accessibility tree
  identified the actual named button, and role-based interaction succeeded. This was a
  test locator issue, not a reproduced application defect.
- Browser connection inventory reported an unavailable host, so the user's authenticated
  session could not be inspected. A fresh public browser check does not prove anything
  about available admin authentication. The captured map showed markers over a black
  basemap; tile delivery is not verified by this pass.
- The required development port was already owned by an existing checkout server (PID
  4166100); our attempted startup exited on the occupied port, and the existing server
  was left untouched. All browser instances and owned test processes completed. No
  application data was saved, deployed, committed or uploaded.
- Completion boundary: full automated validation and these public rendered interactions
  are now current evidence. Authenticated cache refresh/denial behavior, basemap
  delivery, retained-object lifecycle, content identity and durable upload recovery
  remain open audit work. The overall goal remains active.

## 2026-11-04 — Refresh shared Feature queries after image actions

- Traced the public black basemap to a browser-observed **401** response from
  `https://tiles.saanseoi.hk/hongkong-latest.json`. The local map source supports an
  optional configured public key; external access policy was not changed. Markers
  render, but this environment's basemap access remains unresolved.
- Found rotation, publication toggles and image-intent changes clearing only cached
  Feature image arrays and refreshing their own viewer. Active native Feature queries
  and accumulated map rows could retain the previous canonical asset or publication
  state because these commands do not use native `.updates(...)` refreshes.
- Added shared-query reconciliation after these successful mutations. Feature/task/hub
  image actions invalidate and refresh active Feature consumers; project/organisation
  portraits also refresh their hierarchy pages. The originating viewer still respects
  its captured context and does not refresh a newly selected resource. Metadata edits
  retain their existing native-update path.
- Verification: four ownership regressions failed before the fix. Added an active
  map-query case that observes the old asset key changing to the new key after rotation.
  Removing shared reconciliation caused **five failures**
  (`/tmp/hype-image-shared-refresh-disabled.log`). Restored focused checks passed **4
  files / 78 tests** (`/tmp/hype-image-query-refresh-restored.log`). `bun run check`
  passed with **0 errors / 19 existing warnings**
  (`/tmp/hype-image-query-refresh-final-check.log`); scoped whitespace validation
  passed.
- Boundary: mutation behavior is verified with controller/native-query simulations, not
  a persisted image edit in the user's authenticated browser. No application database
  mutation, credential change, external upload, commit or deployment occurred. The
  broader audit remains active.

## 2026-11-04 — Reconcile uploads and deletions without crossing viewer contexts

- Found image uploads and deletions updating viewer state without refreshing shared
  Feature/hierarchy queries. Added post-commit shared reconciliation for direct uploads,
  completed upload batches and deletions. Batch completion deduplicates refresh work by
  resource identity.
- Kept reconciliation outside mutation retry/rollback handling: a failed refresh after
  successful deletion cannot restore the deleted image locally, and a successful direct
  upload is not marked as failed because its later refresh rejects.
- Found queued upload completion sorting/selecting and invalidating whichever context
  was active when it finished. Completion now captures its original context, changes
  local selection only while that viewer remains active, and awaits targeted
  invalidation for the original resource. Updated obsolete replacement-key comments to
  match isolated storage writes.
- Verification: new tests cover successful deletion, refresh failures after committed
  upload/deletion, navigation during direct and queued uploads, and exactly one shared
  refresh for two committed uploads to one resource. Removing post-commit refreshes
  reproduced **five failures** (`/tmp/hype-upload-delete-refresh-disabled.log`).
  Restored focused checks passed **4 files / 84 tests**
  (`/tmp/hype-upload-delete-cache-restored.log`). `bun run check` passed with **0 errors
  / 19 existing warnings** (`/tmp/hype-upload-delete-cache-verified-check.log`); scoped
  whitespace validation passed.
- Boundary: controlled controller/native-query tests, not persisted mutations in the
  authenticated browser. No application database mutation, external upload, credential
  change, commit or deployment occurred. The overall audit remains active.

## 2026-11-04 — Keep upload completion errors separate from persistence failures

- Reproduced a successful upload being marked failed when its consumer's `onSuccess`
  callback threw. The callback ran inside the persistence catch block, making a
  committed image look retryable. An `onError` callback could also abort
  preparation/finalization of otherwise healthy batch entries.
- Separated persistence failure handling from local completion callbacks. Callback
  errors are collected while remaining entries finish, shared queries reconcile once per
  committed resource, and an aggregate completion error is returned afterward. Committed
  upload statuses remain successful. Direct uploads also apply their local result
  outside persistence failure handling and reconcile in `finally`.
- Verification: the success-callback regression failed before the fix
  (`/tmp/hype-upload-completion-red.log`). Cases now cover successful callbacks, thrown
  success callbacks, thrown error callbacks during preparation and finalization,
  continued processing and preserved queue statuses. Focused checks passed **4 files /
  87 tests** (`/tmp/hype-upload-completion-final-tests.log`). `bun run check` passed
  with **0 errors / 19 existing warnings**
  (`/tmp/hype-upload-completion-final-check.log`); scoped whitespace validation passed.
- Boundary: local controller/native-query tests only; no persisted application database,
  external upload, credential change, commit or deployment. The broader audit remains
  active.

## 2026-11-04 — Keep asynchronous file previews in their originating viewer

- Found file preview generation appending upload/staging entries after navigation into
  the newly active viewer. File selection could then authorize and upload the old file
  under the new resource context. Staged selection could likewise install old preview
  images, and an old staged-upload completion could clear the new viewer's staging
  queue.
- Upload and staging preparation now capture the viewer context and discard late results
  on context change, revoking their newly created blob URLs. File selection stops before
  starting uploads when its preparation has become stale. Staged selection checks
  ownership before inserting/activating previews, and staged-upload completion clears
  only its own viewer's queue.
- Verification: five deferred-operation cases cover direct upload queue preparation,
  staging queue preparation, file selection, staged selection and staged-upload
  completion after navigation. Removing ownership checks reproduced **five failures**
  (`/tmp/hype-preview-context-disabled.log`). Restored focused checks passed **4 files /
  92 tests** (`/tmp/hype-preview-context-restored.log`). `bun run check` passed with **0
  errors / 19 existing warnings** (`/tmp/hype-preview-context-final-check.log`); scoped
  whitespace validation passed.
- Boundary: deterministic local file/controller tests, not a persisted browser upload.
  No application database mutation, external upload, credential change, commit or
  deployment occurred. The broader audit remains active.

## 2026-11-04 — Prevent duplicate processing of in-flight upload entries

- Reproduced overlapping file selections preparing and finalizing the first queued file
  twice while its original preparation was still pending. Repeated retry clicks could
  also start concurrent direct uploads for one queue entry.
- Added per-entry in-flight ownership shared by batch and direct processing. Batches
  claim eligible entries synchronously before awaiting preparation; retries skip active
  entries. Ownership releases in `finally` after success or failure, including
  completion/refresh errors. Separate entries may still prepare concurrently.
- Added a monotonic per-viewer identity suffix to upload/staging entries and staged
  images. The same file selected twice within one timestamp now has distinct identities
  and is not incorrectly suppressed by in-flight tracking.
- Verification: the overlapping-selection regression failed before the fix
  (`/tmp/hype-upload-overlap-red.log`). Added successful/failed retry-release cases and
  same-timestamp identity coverage. Focused checks passed **4 files / 96 tests**
  (`/tmp/hype-upload-overlap-verified-tests.log`). `bun run check` passed with **0
  errors / 19 existing warnings** (`/tmp/hype-upload-overlap-final-check.log`); scoped
  whitespace validation passed.
- Boundary: deterministic controller tests; no live upload, persisted application
  database mutation, credential change, commit or deployment. The broader audit remains
  active.

## 2026-11-04 — Limit deletion rollback to its own changes

- Reproduced a failed deletion restoring the whole old image snapshot after another
  deletion succeeded and a new image arrived. It resurrected the successfully deleted
  image, removed the new image and reset newer selection. Repeated requests for one
  image also issued duplicate remote deletions.
- Deletions now share an in-flight promise by context and image identity. Rollback
  restores only the failed image and its removed saved-upload entries, retains other
  current state, and restores selection only when it still matches this deletion's
  optimistic selection. Restored images use the normal sorter.
- Resource-portrait rollback now checks that its own optimistic cache object is still
  current, preserving newer portraits/resource edits and preventing resurrection after a
  cache clear. Removed upload previews are revoked only after successful deletion, so
  failed operations retain usable rollback previews.
- Verification: both original regressions failed before the fix
  (`/tmp/hype-image-delete-overlap-red.log`). Additional tests cover newer/cleared
  resource caches and preview lifetime on success/failure. Focused checks passed **4
  files / 102 tests** (`/tmp/hype-delete-rollback-verified-tests.log`). `bun run check`
  passed with **0 errors / 19 existing warnings**
  (`/tmp/hype-delete-rollback-verified-check.log`); scoped whitespace validation passed.
- Boundary: deterministic controller tests, not persisted authenticated-browser
  deletions. The earlier full-suite failures in the historical broad-review section are
  superseded by the recorded 4,413-test green baseline; subsequent fixes have focused
  gates. Authenticated browser validation and documented recovery boundaries remain
  unresolved, so the overall goal is not complete. No application database mutation,
  external upload, credential change, commit or deployment occurred.

## 2026-11-04 — Reacquire panel pins after account cache resets

- Reproduced a reactive panel selection retaining its old native query handle after
  `CacheCtx.clear()`: the plain pin map was emptied, but unchanged selection/access
  inputs did not invalidate the consuming derivation.
- Pin lookup now observes the cache generation so existing consumers reacquire their
  native query after a reset, even when resource ID and scope strings remain unchanged.
- Verification: the regression failed before the change because the provider was called
  only once (`/tmp/hype-pin-generation-red.log`). Focused checks passed **4 files / 43
  tests** (`/tmp/hype-pin-generation-tests.log`). `bun run check` passed with **0 errors
  / 19 existing warnings** (`/tmp/hype-pin-generation-check.log`); scoped whitespace
  validation passed.
- Boundary: this proves reactive handle reacquisition with a controlled native provider,
  not server-side authorization or native transport cache freshness. Pin
  retention/consumer cleanup and authenticated browser validation remain pending. The
  overall audit is incomplete. No application database mutation, external upload, commit
  or deployment occurred.

## 2026-11-04 — Bound inactive panel pin retention

- Panel selections retained native queries in the root cache indefinitely: visiting a
  new resource added a pin without any selection-change or teardown release. Optimistic
  resource updates also traversed that ever-growing map.
- Added reference-counted pin ownership, wired to the panel's reactive selection effect
  and its cleanup. Retain all active selections and at most 128 inactive queries after
  release. Pruning is coalesced into a microtask so same-flush consumer handoffs can
  reacquire ownership before eviction. Live ownership survives cache resets while query
  data is cleared, and release callbacks are idempotent.
- Verification: focused checks passed **4 files / 45 tests** before adding a same-flush
  handoff regression (`/tmp/hype-pin-retention-tests.log`). Cases cover shared owners,
  idempotent release, bounded history, surviving account-cache resets and panel
  teardown. `bun run check` passed with **0 errors / 19 existing warnings**
  (`/tmp/hype-pin-retention-check.log`); scoped whitespace validation passed. Broader
  verification follows below when complete.
- Boundary: deterministic controller/component tests; authenticated browser verification
  remains outstanding. No application database mutation, external upload, commit or
  deployment. The broader audit remains active.
- Completed broad verification after the handoff regression: **459 Vitest files / 4,336
  tests** passed (`/tmp/hype-cache-audit-full-tests.log`, 119.25s), plus **19 script
  files / 90 tests / 574 assertions** (`/tmp/hype-cache-audit-scripts.log`) and **16
  location tests / 50 assertions** (`/tmp/hype-cache-audit-locations.log`). Total:
  **4,442 passing tests**. These gates include the recent upload/deletion fixes and both
  panel pin fixes; they do not replace authenticated browser or production evidence.

## 2026-11-04 — Respect access denials when merging panel selections

- Reproduced retained pin payloads staying visible after native 401, 403 and 404 refresh
  failures. Skipping only a pin would still allow an overlapping paged row to restore
  the denied identity, so the panel now removes both sources for that identity.
  Transient errors retain their previews, and cleared denial restores the current
  result.
- Reproduced a denied collection being repopulated from older selection queries. Exposed
  the traversal denial state through the scoped `ResourceCollection` facade and made the
  panel respect it before merging rows. The state includes a displayed fallback whose
  native owner loses access during replacement loading; a successful replacement clears
  that condition.
- Verification: three pin regressions failed before the fix
  (`/tmp/hype-pin-denial-red.log`), as did collection merging
  (`/tmp/hype-panel-collection-denial-red.log`) and fallback denial propagation
  (`/tmp/hype-panel-fallback-denial-red.log`). Final focused checks passed **5 files /
  69 tests** (`/tmp/hype-panel-denial-verified-tests.log`), including actual
  collection-facade propagation, recovery and transient errors. Scoped whitespace
  validation passed. Final typecheck result follows below.
- Boundary: deterministic native-query and component tests, not authenticated-browser or
  server-authorization proof. The preceding 4,442-test full-suite baseline predates
  these changes. No application database mutation, external upload, commit or
  deployment; the broader audit remains active.
- Final `bun run check` passed with **0 errors / 19 existing warnings**
  (`/tmp/hype-panel-denial-final-check.log`).

## 2026-11-04 — Refresh selected panel queries and expose their retry state

- Reproduced off-page selected resources staying denied after retry, window focus and
  return-to-visible events. Those paths refreshed only the paged collection, leaving
  independently fetched selection queries stale.
- Refresh now includes the panel's current selection queries alongside its traversal. It
  does not traverse inactive pin history. The installed SvelteKit batched-query
  transport deduplicates repeated identical payloads within a batch. Refresh failures
  settle locally while native query errors remain observable; hidden tabs and destroyed
  panels do not trigger focus refreshes.
- Also reproduced pin-only errors not exposing the panel's retry control. The adapter
  now receives the combined collection/pin error state, which clears after a successful
  pin refresh.
- Verification: all three refresh-trigger regressions failed before the fix
  (`/tmp/hype-panel-pin-refresh-red.log`); all three retry-state cases failed before
  error propagation (`/tmp/hype-panel-pin-error-red.log`). Final focused checks passed
  **5 files / 64 tests** (`/tmp/hype-panel-pin-refresh-final-tests.log`), including
  hidden/teardown behavior, denied-pin recovery, rejected refresh handling and preserved
  transient previews. Scoped whitespace validation passed. Final typecheck result
  follows below.
- Boundary: deterministic component/native-query tests; no authenticated browser
  mutation, application database mutation, external upload, commit or deployment. The
  broader audit remains active.
- Final `bun run check` passed with **0 errors / 19 existing warnings**
  (`/tmp/hype-panel-pin-refresh-final-check.log`).

## 2026-11-04 — Preserve publication preview intent in collection requests

- Reproduced `ResourceClient.createCollection()` dropping `publicationPreview` while
  rebuilding query metadata. Detail providers already used the complete metadata getter,
  but collection requests silently became ordinary public reads, making
  publication-preview lists disagree with preview details.
- Collection construction now uses `queryMeta`, preserving client-owned scope, admin
  intent and publication-preview settings consistently. Exiting preview hides the
  previous scope's rows and revalidates without preview metadata.
- Verification: the metadata regression failed before the change
  (`/tmp/hype-collection-preview-red.log`). Focused checks passed **4 files / 58 tests**
  (`/tmp/hype-collection-preview-tests.log`). `bun run check` passed with **0 errors /
  19 existing warnings** (`/tmp/hype-collection-preview-check.log`), and scoped
  whitespace validation passed. Full-suite result follows when complete.
- Boundary: metadata propagation does not grant authorization; server preview
  authorization remains authoritative. No live application database mutation, external
  upload, commit or deployment. The broader audit remains active.
- Completed full Vitest verification: **459 files / 4,348 tests passed**
  (`/tmp/hype-preview-cache-full-tests.log`, 118.78s), covering this metadata fix and
  the preceding panel denial/refresh changes. The separately recorded 90 script tests
  and 16 location tests were not rerun in this turn.

## 2026-11-04 — Clear captured preview intent in detail metadata

- Reproduced a captured caller `publicationPreview` surviving a merge with current
  client metadata after preview ended. The getter omitted the field outside preview, so
  spreading it over older detail metadata did not clear that older intent.
- Client metadata now explicitly supplies `publicationPreview: undefined` outside
  preview and reads the preview getter once. This overrides captured intent while
  preserving caller profile settings and surface-owned admin intent.
- Verification: the metadata regression failed before the change
  (`/tmp/hype-preview-clear-red.log`). Added tests through all three real hierarchy
  detail providers with controlled remote queries, checking preview entry, scope-change
  hiding and reload after exit. Focused results and final typecheck are recorded below.
- Boundary: client metadata consistency, not a server permission bypass. Server
  authorization remains authoritative; no application database mutation, external
  upload, commit or deployment. The broader audit remains active.
- Final focused checks passed **6 files / 50 tests**
  (`/tmp/hype-preview-clear-final-tests.log`). `bun run check` passed with **0 errors /
  19 existing warnings** (`/tmp/hype-preview-clear-final-check.log`); scoped whitespace
  validation passed. The preceding full Vitest baseline predates this fix.

## 2026-11-04 — Keep collection status within its access scope

- Reproduced collections exposing the previous scope's 403 error and in-flight loading
  flag after their access scope changed. Rows, initialization and denial were already
  scope-gated, but error/loading status was not, producing inconsistent UI state during
  account or preview transitions.
- Applied the same scope check to error and loading getters. Old errors become null and
  old requests no longer represent current loading; a new-scope refresh exposes its own
  status normally.
- Verification: both regressions failed before the fix
  (`/tmp/hype-collection-scope-status-red.log`). Focused checks cover stale errors,
  pending old requests, new-scope recovery, first-render reactivity and panel behavior.
  Final test/typecheck results follow below.
- Boundary: collection status consistency, not server authorization proof. No
  application database mutation, external upload, commit or deployment; the broader
  audit remains active.
- Final focused checks passed **4 files / 60 tests**
  (`/tmp/hype-collection-scope-status-tests.log`). `bun run check` passed with **0
  errors / 19 existing warnings** (`/tmp/hype-collection-scope-status-check.log`);
  scoped whitespace validation passed.

## 2026-11-04 — Await active collection refreshes for matching loads

- Reproduced a matching `load()` completing while its first-page refresh was still
  pending, both for success and authorization failure. The freshness shortcut could
  return immediately, and the loading branch awaited the native query's older resolved
  payload rather than the controller's refresh operation.
- Track the active first-page operation by complete query identity and join it before
  applying freshness shortcuts. Joined callers receive completion after state
  reconciliation, including the refresh failure. Explicit forced refreshes remain
  independent; clear/release detaches the old operation, and obsolete completion cannot
  detach a newer one.
- Verification: both original regressions failed before the fix
  (`/tmp/hype-list-join-red.log`). Final focused checks passed **4 files / 63 tests**
  (`/tmp/hype-list-join-final-tests.log`), including clear/reload overlap.
  `bun run check` passed with **0 errors / 19 existing warnings**
  (`/tmp/hype-list-join-check.log`); scoped whitespace validation passed.
- Boundary: deterministic controller/component validation. No application database
  mutation, external upload, commit or deployment. The broader audit remains active.

## 2026-11-04 — Recover collection state when native query construction fails

- Reproduced a throwing replacement query factory leaving old private page handles under
  the newly assigned access scope. It also bypassed error assignment and loading
  cleanup; superseding a pending request could leave loading stuck permanently.
- Retire old active page handles and freshness before constructing a replacement, and
  perform construction inside the existing error/finally boundary. Compatible same-scope
  previews remain available after transient failure, but cannot satisfy the new query's
  freshness shortcut. Cross-scope previews remain empty, and retries construct the
  intended query.
- Verification: both initial regressions failed before the fix
  (`/tmp/hype-list-factory-red.log`). Final focused checks passed **4 files / 66 tests**
  (`/tmp/hype-list-factory-tests.log`), including same-scope preview/retry recovery.
  `bun run check` passed with **0 errors / 19 existing warnings**
  (`/tmp/hype-list-factory-check.log`); scoped whitespace validation passed.
- Boundary: deterministic native-factory/controller validation, not server authorization
  proof. No application database mutation, external upload, commit or deployment. The
  broader audit remains active.

## 2026-11-04 — Revalidate retained next-page queries before appending

- Reproduced pagination appending an already-resolved cursor query's stale payload
  without refreshing it. Unlike the first-page path, `next()` only awaited the old
  native promise, so a revoked page could also bypass refresh denial handling.
- Pagination now refreshes ready native handles before appending them; unresolved
  handles retain their normal initial await. Existing generation guards discard
  completion after a view change, and denial uses the existing traversal-clearing path.
- Verification: stale-payload and denied-refresh regressions failed before the fix
  (`/tmp/hype-next-page-refresh-red.log`). Final focused checks passed **4 files / 69
  tests** (`/tmp/hype-next-page-refresh-tests.log`), including a retained next-page
  refresh completing after navigation. `bun run check` passed with **0 errors / 19
  existing warnings** (`/tmp/hype-next-page-refresh-check.log`); scoped whitespace
  validation passed.
- Boundary: deterministic native-query/controller validation, not authenticated-browser
  or server-authorization proof. No application database mutation, external upload,
  commit or deployment. The broader audit remains active.

## 2026-11-04 — Release superseded collection preview owners

- Reproduced a denial from an unrelated previously visited page hiding the current
  preview after cached back-navigation. Restoring a retained view did not clear the
  previous fallback snapshot/owners, so later pending navigation accumulated unrelated
  native owners in its denial checks.
- Cached-view restoration now clears superseded fallback rows and owners, matching
  normal first-page success. Successful pagination also releases its pre-request
  fallback snapshot instead of retaining it after completion.
- Verification: the unrelated-owner regression failed before the fix
  (`/tmp/hype-fallback-owner-red.log`). Full automated verification is running; final
  results are recorded below when terminal. Scoped whitespace validation passed.
- Boundary: native-query/controller ownership, not authenticated-browser or
  server-authorization proof. No live application database mutation, external upload,
  commit or deployment. The broader audit remains active.
- Completed verification: **460 Vitest files / 4,364 tests** passed
  (`/tmp/hype-collection-lifecycle-full-tests.log`, 120.17s), **19 script files / 90
  tests / 574 assertions** passed (`/tmp/hype-collection-lifecycle-scripts.log`), and
  **16 location tests / 50 assertions** passed
  (`/tmp/hype-collection-lifecycle-locations.log`): **4,470 passing tests** total.
  `bun run check` passed with **0 errors / 19 existing warnings**
  (`/tmp/hype-fallback-owner-check.log`). This full baseline includes the recent preview
  metadata, collection status, load-joining, factory failure and pagination refresh
  fixes.

## 2026-11-04 — Keep displayed collection previews attached to native payloads

- Reproduced a pending-search preview freezing old row objects after its native owner
  changed an item or removed another. The snapshot preserved display order but also
  incorrectly preserved stale payloads.
- Capture ordered identities with their native owners, then resolve visible preview rows
  from those owners' current payloads. Edits, removals and rollback now propagate while
  the replacement query is pending. Ownership is cleared with other preview state; page
  indexes avoid repeated per-row scans.
- Verification: the edit/removal regression failed before the change
  (`/tmp/hype-fallback-live-red.log`). Focused checks passed **4 files / 87 tests**
  (`/tmp/hype-fallback-live-tests.log`), including pending-search rollback and existing
  denial/ownership cases. Scoped whitespace validation passed. Final typecheck follows
  below.
- Boundary: deterministic native-query/controller tests. No live application database
  mutation, external upload, commit or deployment. The broader audit remains active.
- Final `bun run check` passed with **0 errors / 19 existing warnings**
  (`/tmp/hype-fallback-live-verified-check.log`). The preceding full-suite baseline
  predates this change.

## 2026-11-04 — Verify reactive collection preview updates

- Extended the preceding fallback fix's evidence from synchronous getter reads to a
  Svelte `$effect` observer using reactive native page payloads. During a pending
  search, removal empties the observed rows, native rollback restores them, and a
  completed empty replacement settles initialization correctly.
- No production change was needed. The initial fixture omitted native `current` updates
  on promise completion; corrected that fixture before interpreting the result.
- Verification: **2 files / 31 tests passed** (`/tmp/hype-fallback-rendered-tests.log`);
  `bun run check` passed with **0 errors / 19 existing warnings**
  (`/tmp/hype-fallback-rendered-check.log`). Scoped whitespace validation passed.
- Boundary: Svelte observer integration in jsdom, not a browser-rendered authenticated
  workflow. The broader audit remains active; no application database mutation, external
  upload, commit or deployment.

## 2026-11-04 — Preserve rollback identities across pending search handoffs

- Reproduced an optimistic removal disappearing permanently from the preview when a
  second search superseded the first before native rollback. Recapturing only currently
  visible rows dropped the temporarily absent identity and its owner.
- Compatible overlapping searches now retain the existing fallback identity/owner set
  while it supplies the preview. Native removal still hides the row immediately,
  rollback restores it, and a successful replacement ends the preview. Centralized the
  shared fallback-state predicate used for ownership, denial and row projection.
- Verification: the overlapping-search rollback regression failed before the fix
  (`/tmp/hype-fallback-handoff-red.log`). Focused checks passed **3 files / 50 tests**
  (`/tmp/hype-fallback-handoff-tests.log`); `bun run check` passed with **0 errors / 19
  existing warnings** (`/tmp/hype-fallback-handoff-check.log`). Scoped whitespace
  validation passed.
- Boundary: deterministic controller and Svelte-observer tests. No application database
  mutation, external upload, commit or deployment. The broader audit remains active.

## 2026-11-04 — Include displayed preview owners in mutation retention

- Reproduced history invalidation removing a still-displayed fallback query from
  `retainedPages`. Image mutation projection enumerates that collection, so it could
  miss the native query currently supplying visible preview rows.
- Include fallback query owners in the deduplicated retained-page enumeration.
  Completion/release still clears obsolete fallback ownership through the existing
  lifecycle.
- Verification: the retention regression failed before the fix
  (`/tmp/hype-preview-retention-red.log`). Added an integration case invoking
  `CacheCtx.beginMutation()` and verifying the image transform reaches the fallback
  after invalidation. Focused checks passed **3 files / 52 tests**
  (`/tmp/hype-preview-retention-tests.log`). Final typecheck follows below.
- Boundary: deterministic native-query/controller and mutation projection tests, not
  authenticated browser mutation. No application database mutation, external upload,
  commit or deployment. The broader audit remains active.
- Final `bun run check` passed with **0 errors / 19 existing warnings**
  (`/tmp/hype-preview-retention-final-check.log`); scoped whitespace validation passed.

## 2026-11-04 — Expire active freshness on collection invalidation

- Reproduced `invalidate()` clearing history but leaving the active one-minute freshness
  shortcut valid. Both matching loads and focus revalidation could skip the expected
  refresh after invalidation.
- Invalidation now expires active freshness without removing visible rows. An
  invalidation revision also prevents first-page or pagination operations begun before
  invalidation from restoring freshness/history when they finish.
- Verification: both active-read regressions failed before the change
  (`/tmp/hype-active-invalidation-red.log`), followed by an in-flight completion
  regression (`/tmp/hype-inflight-invalidation-red.log`). Final focused checks and
  typecheck are recorded below.
- Boundary: controller/cache freshness, not automatic cancellation of native requests or
  server transaction isolation. No application database mutation, external upload,
  commit or deployment; the broader audit remains active.
- Final focused checks passed **3 files / 72 tests**
  (`/tmp/hype-active-invalidation-tests.log`). `bun run check` passed with **0 errors /
  19 existing warnings** (`/tmp/hype-invalidation-final-check.log`); scoped whitespace
  validation passed.

## 2026-11-04 — Recheck cleanup integrity and outstanding verification boundaries

- Rechecked declared image foreign keys against detached-image cleanup: project,
  organisation, hub, Feature assignments and task evidence are all covered by the
  conditional DELETE. Explicit deletion uses the evidence revision transaction and
  schedules asset cleanup only after successful deletion. No new defect was established
  in those inspected paths.
- Current focused database verification passed **5 files / 133 tests**
  (`/tmp/hype-cleanup-boundary-tests.log`): detached cleanup, image edit/delete
  transactions and scope guards, resource uploads, Feature uploads and task image-review
  transactions. These use disposable SQLite and controlled storage, not live R2.
- Rechecked authenticated browser availability: `cua.getState()` returned no browsers
  and `The browser access host is unavailable`. This is an unavailable connection, not
  evidence that the user lacks an authenticated session.
- Outstanding boundaries remain explicit: cleanup is best-effort with logged storage
  failures, not a durable deletion queue; retained replacement/rotation assets have no
  verified reclamation lifecycle here; content identity and recovery after grant
  expiration still require review. The external basemap 401 was not re-tested in this
  turn. Authenticated mutation/denial/refresh browser verification remains unavailable.
- The full audit is not complete. No application database mutation, external upload,
  storage deletion, commit or deployment occurred.

## 2026-11-04 — Replay image confirmations after transient network failures

- Reproduced finalization surfacing a transient fetch failure immediately even though
  the existing signed confirmation supports replay. A lost response can follow a
  committed upload; obtaining a fresh grant is not the appropriate first recovery
  attempt.
- Extend the existing bounded confirmation retry loop to recognized fetch/network
  TypeErrors. Every attempt reuses the same token, metadata, persistence intent and
  access intent. Permission/conflict responses and unrelated TypeErrors are not retried;
  repeated network failure stops after four attempts and preserves the last error.
- Verification: the lost-response regression failed before the fix
  (`/tmp/hype-confirm-retry-red.log`). Focused checks passed **4 files / 78 tests**
  (`/tmp/hype-confirm-retry-tests.log`), covering bounded retries, identical requests,
  non-retryable errors, upload transactions and task recovery. `bun run check` passed
  with **0 errors / 19 existing warnings** (`/tmp/hype-confirm-retry-check.log`); scoped
  whitespace validation passed.
- Boundary: transient replay within one live finalization call, not durable recovery
  across reload/token expiration or byte-identity proof. No external upload, application
  database mutation, commit or deployment. The broader audit remains active.

## 2026-11-04 — Verify transport retry boundaries and refresh the broad baseline

- Inspected the installed SvelteKit `remote_request`: fetch rejections propagate before
  HTTP error handling, matching the confirmation retry classification. HTTP errors
  remain distinct and are not added to the network retry category.
- Confirmed upload grants carry a five-minute expiry and verification rejects
  `exp <= Date.now()`. Existing token/transaction tests cover expiry, same-identity
  replay and scope-change rejection. This does not provide recovery after expiry or
  prove live storage behavior.
- Running the full Vitest, script and location suites against the recent preview
  ownership, invalidation and confirmation retry changes. Final terminal results follow
  below. No production source changes were needed in this verification turn; scoped
  whitespace validation passed.
- Completed verification: **461 Vitest files / 4,377 tests** passed
  (`/tmp/hype-audit-current-full-tests.log`, 119.43s), **19 script files / 90 tests /
  574 assertions** passed (`/tmp/hype-audit-current-script-tests.log`), and **16
  location tests / 50 assertions** passed
  (`/tmp/hype-audit-current-location-tests.log`). Total: **4,483 passing tests**. Latest
  unchanged-source typecheck remains **0 errors / 19 existing warnings**
  (`/tmp/hype-confirm-retry-check.log`).
- Completion remains unproven: authenticated browser access is unavailable, and durable
  upload/storage lifecycle boundaries remain open. No application database mutation,
  external upload, storage deletion, commit or deployment occurred.

## 2026-11-04 — Replay confirmations after incomplete JSON responses

- The installed remote transport parses successful HTTP bodies before returning the
  command result. Reproduced confirmation failure when that parsing throws
  `Unexpected end of JSON input`, which can obscure a server-side commit just as a lost
  fetch response can.
- The existing bounded retry loop now recognizes that incomplete-JSON SyntaxError and
  replays the unchanged signed confirmation. Other SyntaxErrors remain non-retryable; no
  new upload authorization or PUT is issued by this recovery path.
- Verification: the incomplete-response regression failed before the fix
  (`/tmp/hype-confirm-truncated-red.log`). Focused checks passed **3 files / 70 tests**
  (`/tmp/hype-confirm-truncated-tests.log`). `bun run check` passed with **0 errors / 19
  existing warnings** (`/tmp/hype-confirm-truncated-check.log`); scoped whitespace
  validation passed.
- Boundary: controlled transport-error simulation, not live packet truncation or durable
  recovery after expiration/reload. No application database mutation, external upload,
  commit or deployment. The broader audit remains active.

## 2026-11-04 — Preserve in-flight task attempts across credential expiry

- Reproduced an overlapping submission replacing its matching retry attempt when a
  credential expired during finalization. The old operation could still commit, but its
  result was then rejected as belonging to a replaced attempt, allowing fresh work to
  duplicate it.
- Matching attempts remain reusable while any step is pending. Once operations settle,
  normal expiry rules apply: successful finalization remains acknowledged; a failed
  expired attempt can be renewed. Content/account/file changes still replace attempts
  through the existing identity checks.
- Verification: both successful/failed completion regressions failed before the fix
  (`/tmp/hype-task-expiry-overlap-red.log`). Focused checks passed **3 files / 26
  tests** (`/tmp/hype-task-expiry-overlap-tests.log`), including existing account-scope
  and upload retry cases. Final typecheck follows below.
- Boundary: in-memory operation ownership, not durable recovery after reload, lost
  acknowledgments or server credential expiry. No application database mutation,
  external upload, commit or deployment; the broader audit remains active.
- Final `bun run check` passed with **0 errors / 19 existing warnings**
  (`/tmp/hype-task-expiry-overlap-check.log`); scoped whitespace validation passed.

## 2026-11-04 — Verify submission ownership across account round trips

- Traced all three contribution actions: retry scope includes both account revision and
  resource scope. Added an integration test using the real `AccountState` and a pending
  `TaskSubmissionAttempt`, signing out and back into the same identity before
  completion.
- Verified the old completion is rejected, later steps cannot start, and a new
  submission receives a distinct attempt. No production change was needed for this
  invariant. The actions' earlier asynchronous hierarchy lookup occurs before attempt
  establishment and remains the next scope-ownership check.
- Focused checks passed **3 files / 27 tests**
  (`/tmp/hype-task-account-cycle-tests.log`), covering task retry/recovery and account
  state. Final typecheck follows below.
- Boundary: local account/controller integration, not a live authenticated browser
  transition. No application database mutation, external upload, commit or deployment;
  the broader audit remains active.
- Final `bun run check` passed with **0 errors / 19 existing warnings**
  (`/tmp/hype-task-account-cycle-check.log`); scoped whitespace validation passed.

## 2026-11-04 — Fence contribution hierarchy preflight against scope changes

- Photo and missing-report actions awaited hierarchy before establishing retry
  ownership, then read the current feature/account. A changed account, feature or
  unmounted action could therefore start a new submission from obsolete user intent.
- Capture account revision, resource scope and feature identity before the await; return
  before submission if any changes or the action unmounts. Disposal also clears retry
  retention. Existing validation/comments remain intact.
- Verification: six component cases cover both actions under account change, feature
  change and unmount. Temporarily disabling the guards caused **6 failures**
  (`/tmp/hype-contribution-preflight-disabled.log`); restored focused checks passed **3
  files / 26 tests** (`/tmp/hype-contribution-preflight-final-tests.log`). Initial
  fixture timeouts used fake timers and were corrected before interpreting regression
  results. Final typecheck follows below.
- Boundary: pre-submission ownership only. Post-submission UI cleanup and new-Feature
  completion remain separate async boundaries to inspect. Tests mount the actions in
  jsdom, not the user's authenticated browser. No application database mutation,
  external upload, commit or deployment; the broader audit remains active.
- Final `bun run check` passed with **0 errors / 19 existing warnings**
  (`/tmp/hype-contribution-preflight-final-check.log`); scoped whitespace validation
  passed.

## 2026-11-04 — Keep contribution completion in its originating form

- Reproduced delayed photo/missing-report success resetting a newer feature's mode and
  staged images. Delayed failure also overwrote the newer form's validation state and
  cleared its submitting flag.
- Reuse the captured account/resource/feature ownership check for status callbacks,
  submission completion, catch and finally. Recheck after tick and image refresh before
  cleanup. Move the mode transition after image cleanup so successful completion does
  not destroy its own action before cleanup finishes.
- Verification: four success/failure regressions failed before the fix
  (`/tmp/hype-contribution-completion-red.log`). Added navigation during image-refresh
  coverage for both actions. Final focused checks passed **3 files / 32 tests**
  (`/tmp/hype-contribution-completion-final-tests.log`); `bun run check` passed with **0
  errors / 19 existing warnings** (`/tmp/hype-contribution-completion-check.log`).
  Scoped whitespace validation passed.
- Boundary: component tests in jsdom, not live authenticated submissions. New-Feature
  completion and distinguishing post-commit refresh failures from persistence failure
  remain to inspect. No application database mutation, external upload, commit or
  deployment; the broader audit remains active.

## 2026-11-04 — Keep new-Feature completion attached to its draft

- Reproduced late new-Feature success resetting newer draft/images and closing the
  panel, plus late failure overwriting a newer form's error/busy state after draft
  replacement, account change or unmount.
- Capture draft identity, account revision and resource scope; fence status callbacks,
  completion, catch and finally with that ownership and component lifetime. Successful
  current completion releases busy state before its own draft reset/close invalidates
  ownership.
- Verification: six stale success/failure cases failed before the fix
  (`/tmp/hype-new-feature-completion-red.log`). Focused checks passed **3 files / 40
  tests** (`/tmp/hype-new-feature-completion-tests.log`), also covering valid current
  success/failure and the earlier photo/report guards. Final typecheck follows below.
- Boundary: jsdom action tests, not live authenticated submissions. Post-commit refresh
  failure handling remains to inspect for the photo/report actions. No application
  database mutation, external upload, commit or deployment; the broader audit remains
  active.
- Final `bun run check` passed with **0 errors / 19 existing warnings**
  (`/tmp/hype-new-feature-completion-check.log`); scoped whitespace validation passed.

## 2026-11-04 — Keep committed contributions successful after refresh failure

- Reproduced photo and missing-report actions reporting submission failure and retaining
  staged inputs when their post-commit image refresh rejected. Retry retention had
  already been cleared, so leaving the submission form active could encourage duplicate
  submissions.
- Isolate the image read in its own catch after persistence succeeds. Log the refresh
  failure and complete successful cleanup/mode transition, subject to the existing
  ownership checks. Persistence failures still use the submission error path.
- Verification: both component regressions failed before the fix
  (`/tmp/hype-contribution-refresh-red.log`). Focused checks passed **3 files / 42
  tests** (`/tmp/hype-contribution-refresh-tests.log`), including navigation and
  stale-completion protections. Final typecheck follows below.
- Boundary: stale gallery data may remain until a later successful refresh; this does
  not claim the read succeeded. Component tests use controlled services, not live
  uploads. No application database mutation, external upload, commit or deployment; the
  broader audit remains active.
- Final `bun run check` passed with **0 errors / 19 existing warnings**
  (`/tmp/hype-contribution-refresh-check.log`); scoped whitespace validation passed.

## 2026-11-04 — Verify the contribution ownership and retry changes together

- Full verification completed with terminal exit 0: **462 Vitest files / 4,404 tests**
  (`/tmp/hype-contribution-audit-full-tests.log`, 119.68s), **19 script files / 90 tests
  / 574 assertions** (`/tmp/hype-contribution-audit-scripts.log`), and **16 location
  tests / 50 assertions** (`/tmp/hype-contribution-audit-locations.log`). Total: **4,510
  passing tests**.
- Latest source typecheck remains **0 errors / 19 existing warnings**
  (`/tmp/hype-contribution-refresh-check.log`). No production source changed during this
  verification pass.
- Follow-up inspection confirmed the submit button disables itself using shared
  `CardCtx.isSubmitting`; the new-Feature cancel action also disables during submission.
  Shared busy-state lifetime across account/navigation changes still needs an integrated
  lifecycle check; these observations do not establish a new resolved defect.
- The broader audit remains active. Authenticated browser verification and durable
  upload/storage recovery remain unresolved. No application database mutation, external
  upload, commit or deployment occurred.

## 2026-11-04 — Release contribution busy state independently of stale form writes

- The feature route retains its shared `CardCtx` across selected-feature changes. All
  three contribution actions skipped their busy-state cleanup when account, feature,
  draft or component ownership changed, leaving `isSubmitting` true after the original
  operation settled. Disposal also left that state behind.
- Added a per-card submission ownership token with idempotent release. Each action
  releases on settlement and unmount even when its form is stale; an older release
  cannot clear a newer submission's busy flag or progress label. Existing guards still
  prevent stale completions from changing inputs, errors, images or mode.
- Verification: updated lifecycle expectations reproduced **18 failures** before the fix
  (`/tmp/hype-contribution-busy-red.log`). Final focused checks passed **3 files / 48
  tests** (`/tmp/hype-contribution-busy-final-tests.log`), including newer-owner
  preservation during success, failure and refresh, immediate release on unmount, and
  idempotent new-Feature completion. `bun run check` passed with **0 errors / 19
  existing warnings** (`/tmp/hype-contribution-busy-check.log`); scoped whitespace
  validation passed.
- Boundary: mounted action tests use controlled contexts in jsdom. A mounted stale
  action retains busy state until its pending operation settles; this change does not
  cancel server work or provide durable recovery. Authenticated browser checks and the
  broader audit remain incomplete. No application database mutation, external upload,
  commit or deployment occurred.

## 2026-11-04 — Fence saved-feature completions by account revision

- Wishlist and visit actions checked only user identity before applying successful
  membership responses or failure rollbacks. A sign-out/sign-in round trip to the same
  identity, or a role change, advances `AccountState.revision` while leaving that
  identity unchanged; delayed responses could repopulate the reset account collection.
- Both actions now capture and check account revision alongside user ID in success and
  error paths. Same-account feature navigation still reconciles the original feature.
  Updated the component fixture's cache reconciliation stub so that valid completion no
  longer falls into catch due to an absent mock method.
- Verification: same-identity/new-revision success and failure cases produced **4
  failures** before the fix (`/tmp/hype-saved-feature-revision-red.log`). Focused checks
  passed **3 files / 20 tests** (`/tmp/hype-saved-feature-revision-tests.log`), covering
  action ownership, account state and shared membership projections. `bun run check`
  passed with **0 errors / 19 existing warnings**
  (`/tmp/hype-saved-feature-revision-check.log`); scoped whitespace validation passed.
- Boundary: controlled component/account tests, not authenticated browser session
  changes. Concurrent wishlist/visit writes and membership override retention remain
  further audit targets. No application database mutation, external upload, commit or
  deployment occurred; the broader audit remains active.

## 2026-11-04 — Preserve independent saved-list edits during completion and rollback

- Mounted wishlist and visit actions against the real shared membership collection and
  overlapped their requests. Full-row application of one response or rollback could
  erase the other action's pending or completed membership. Initial addition cases
  reproduced **3 failures** (`/tmp/hype-saved-feature-concurrency-red.log`).
- Added `UserFeatureCollections.applyList` and routed both actions' optimistic,
  confirmed and rollback updates through it. Each action owns only its list flag; visit
  edits also own the visit timestamp. The other list's current membership is preserved,
  including explicit removals.
- Verification: expanded mounted-component cases cover additions/removals, both
  completion orders and failure rollback. Focused checks passed **3 files / 21 tests**
  (`/tmp/hype-saved-feature-concurrency-final-tests.log`). `bun run check` passed with
  **0 errors / 19 existing warnings** (`/tmp/hype-saved-feature-concurrency-check.log`);
  scoped whitespace validation passed.
- Boundary: shared membership reconciliation with controlled remote responses, not live
  server concurrency. Overlapping edits to the same list, native query override
  composition and expired override retention remain audit targets. No application
  database mutation, external upload, commit or deployment occurred; the broader audit
  remains active.

## 2026-11-04 — Compose saved-feature query overrides with current membership

- Wishlist and visit native query overrides still replayed a captured whole-row
  snapshot. Re-evaluating either callback against a newer query payload could overwrite
  the other list's membership or visit timestamp, despite the shared membership store's
  separate fix.
- Each callback now reads the current query row and changes only its owned membership
  fields. Wishlist overrides preserve the current visit flag/timestamp; visit overrides
  preserve the current wishlist flag. Existing row metadata and unrelated rows remain
  available.
- Confirmed the installed SvelteKit query implementation reduces override callbacks over
  its current raw payload (`remote-functions/query/instance.svelte.js`). Two callback
  regressions failed before the fix (`/tmp/hype-saved-feature-override-red.log`).
  Expanded addition/removal checks passed **3 files / 25 tests**
  (`/tmp/hype-saved-feature-override-final-tests.log`). `bun run check` passed with **0
  errors / 19 existing warnings** (`/tmp/hype-saved-feature-override-check.log`); scoped
  whitespace validation passed.
- Boundary: captured callbacks from mounted actions and installed transport-source
  inspection, not live authenticated remote commands. Same-list overlapping edits and
  expired override retention still require review. No application database mutation,
  external upload, commit or deployment occurred; the broader audit remains active.

## 2026-11-04 — Reclaim expired membership override snapshots

- Membership overrides stopped winning over reads after 60 seconds but remained in their
  reactive map until an account reset. Long-lived accounts therefore retained every
  edited feature's obsolete snapshot or removal marker, and full refreshes kept
  traversing those expired entries.
- Added expiration cleanup to local edits, accepted full-list responses and page merges.
  Cleanup leaves current membership rows intact, preserves recent overrides and avoids
  mutations inside reactive read getters.
- Verification: retention checks for all three write paths failed before the fix (**3
  failures**, `/tmp/hype-membership-retention-red.log`). Focused checks passed **3 files
  / 28 tests** (`/tmp/hype-membership-retention-tests.log`), including acceptance of
  fresh remote rows after the expiry boundary and protection of recent removals.
  `bun run check` passed with **0 errors / 19 existing warnings**
  (`/tmp/hype-membership-retention-check.log`); scoped whitespace validation passed.
- Boundary: lazy reclamation on the next write, not a timer or a hard cap on edits
  within the 60-second window. Same-list overlapping operations remain an audit target.
  No application database mutation, external upload, commit or deployment occurred; the
  broader audit remains active.

## 2026-11-04 — Own saved-list writes across mounted cards

- Separate instances of the same action could issue conflicting writes for one
  account/feature/list while the first request remained pending, including after its
  card unmounted. Component-local submitting flags could not protect the shared
  membership state.
- Added account-owned pending-edit claims, keyed by feature and list. Both actions claim
  before optimistic mutation and release in `finally`; unmount does not release a
  still-running server operation. Account reset clears claims, and identity-checked
  release cannot unlock a newer account's operation. Different features and different
  lists remain independent.
- Verification: four mounted two-card cases failed before the fix
  (`/tmp/hype-saved-list-ownership-red.log`). Focused checks passed **3 files / 33
  tests** (`/tmp/hype-saved-list-ownership-final-tests.log`), covering success/failure
  release, unmount, account reset and idempotent releases alongside the previous
  list-composition cases. `bun run check` passed with **0 errors / 19 existing
  warnings** (`/tmp/hype-saved-list-ownership-check.log`); scoped whitespace validation
  passed.
- Inspected the server path: list additions preserve omitted flags in SQL, and removals
  update only the target flag then delete empty rows in an atomic batch. No further
  server change was needed for this client ownership fix.
- Full Vitest verification is running (`/tmp/hype-saved-membership-full-tests.log`); no
  terminal result is claimed yet. Boundary: same-runtime account coordination, not
  cross-browser serialization or cancellation of server work. No application database
  mutation, external upload, commit or deployment occurred; the broader audit remains
  active.

## 2026-11-04 — Preserve pending membership edits beyond override expiry

- Reproduced both full-list and page refreshes replacing an optimistic removal while its
  command remained pending beyond 60 seconds. Expiring a completed edit is reasonable;
  expiring an actively owned edit lets background reads undo its visible state before
  settlement.
- Override validity and pruning now retain snapshots while either list edit owns that
  feature. Pending ownership is reactive so release participates in dependent
  projections. The action's settled update receives the normal 60-second lifetime;
  account reset still clears both ownership and overrides.
- Verification: both expiry regressions failed before the fix
  (`/tmp/hype-pending-membership-expiry-red.log`). The previously running full suite
  picked up those new tests and ended with **462 files passing / 1 failing; 4,434 tests
  passing / 2 failing**, both failures being these new cases
  (`/tmp/hype-saved-membership-full-tests.log`, 120.76s). This was not a clean
  full-suite baseline.
- After the fix, focused checks passed **3 files / 35 tests**
  (`/tmp/hype-pending-membership-expiry-tests.log`). `bun run check` passed with **0
  errors / 19 existing warnings** (`/tmp/hype-pending-membership-expiry-check.log`);
  scoped whitespace validation passed. A fresh full Vitest run is active
  (`/tmp/hype-pending-membership-full-tests.log`); its terminal result remains pending.
- Boundary: in-memory pending-command ownership, not durable or cross-browser
  coordination. No application database mutation, external upload, commit or deployment
  occurred; the broader audit remains active.

## 2026-11-04 — Verify the complete saved-membership changes together

- The fresh full Vitest run completed with terminal exit 0: **463 files / 4,436 tests
  passed** (`/tmp/hype-pending-membership-full-tests.log`, 120.45s). Production source
  and tests remained unchanged during this run. This supersedes the preceding run's two
  pending-expiry regression failures.
- Latest typecheck remains **0 errors / 19 existing warnings**
  (`/tmp/hype-pending-membership-expiry-check.log`). Script and Location suites were not
  rerun in this pass; their prior results are recorded separately.
- Rechecked browser access: `cua.getState()` again returned empty inventories with
  `The browser access host is unavailable`. Authenticated mutation/denial/refresh
  verification remains unavailable; this does not imply the user lacks a session.
- Reviewed the outstanding evidence boundaries against the current service/API
  inventory. Green automated tests do not establish complete database/permission
  coverage or resolve durable upload recovery, retained-object cleanup, content
  identity, or transaction-time role revalidation. Those remain review work, not
  completed deliverables. No application database mutation, external upload, commit or
  deployment occurred; the broader audit remains active.

## 2026-11-04 — Apply the metadata lookup deadline to DNS resolution

- Link-title retrieval created a six-second abort signal, but awaited both DNS resolvers
  before checking it. A resolver that never settled could hold the lookup indefinitely
  despite the documented shared deadline.
- DNS resolution now observes that signal while awaiting both address families. Listener
  cleanup runs when resolution settles, and an aborted lookup cannot proceed to HTTP
  retrieval. Destination validation and redirect checks remain in the request path.
- Verification: stalled IPv4 and IPv6 cases both failed before the fix
  (`/tmp/hype-link-dns-timeout-red.log`). Focused link-title and
  translation-authorization checks passed **2 files / 11 tests**
  (`/tmp/hype-link-dns-timeout-tests.log`). `bun run check` passed with **0 errors / 19
  existing warnings** (`/tmp/hype-link-dns-timeout-check.log`); scoped whitespace
  validation passed.
- Boundary: mocked resolvers and controlled abort, with no external network requests.
  The caller stops waiting on expiry; this does not cancel an underlying runtime DNS
  operation. No application database mutation, external upload, commit or deployment
  occurred; the broader audit remains active.

## 2026-11-04 — Preserve committed mutation outcomes when refresh registration fails

- `withRequestedRefreshes` awaited refresh setup in `finally` after a successful handler
  or redirect. A setup rejection could replace that outcome with an error, encouraging
  the client to retry a write that had already completed.
- Await all registered refresh families with independent failure reporting; log
  initialization errors separately. Refresh setup still finishes before returning, while
  failures no longer replace the committed result or redirect. Rejected
  validation/authorization still skips refresh setup.
- Verification: successful command, successful form and redirect cases all failed under
  injected refresh rejection before the fix (**3 failures**,
  `/tmp/hype-post-commit-refresh-red.log`). Focused checks passed **3 files / 28 tests**
  (`/tmp/hype-post-commit-refresh-final-tests.log`), including waiting for a slow
  refresh family when another fails. `bun run check` passed with **0 errors / 19
  existing warnings** (`/tmp/hype-post-commit-refresh-check.log`); scoped whitespace
  validation passed.
- Inspected the installed requested-query implementation: query refresh registration and
  query-result delivery are separate. This fix isolates registration failures; it does
  not claim failed queries refreshed successfully or recover writes that failed before
  the handler returned. No application database mutation, external upload, commit or
  deployment occurred; the broader audit remains active.

## 2026-11-04 — Verify appearance and messaging preference boundaries

- Traced appearance preferences from the remote account-ID check through the atomic JSON
  theme patch and the account-lifetime synchronization controller. Own-account guest
  writes are intentional; different-account reads/writes are rejected even for
  super-admins. The SQL patch preserves unrelated preferences, while the controller
  serializes explicit edits and drops queued work/late reads after disposal. No new
  defect was established in these inspected paths.
- Appearance verification passed **4 files / 34 tests**
  (`/tmp/hype-theme-boundary-audit-tests.log`), covering disposable SQLite persistence,
  malformed legacy JSON, cross-account rejection, read/write failures, pending-read
  edits and map-theme synchronization.
- Inspected messaging preference/identity authorization: ordinary users can manage only
  their own active, non-guest profile; self-entered identities remain unverified, and
  verification requires global-administrator authority plus an unchanged expected claim.
  Selected integration checks passed **4 tests / 34 skipped**
  (`/tmp/hype-messaging-preference-audit-tests.log`), covering self-entry restrictions,
  default preferences and competing organisation-account identity claims. This is a
  selected check, not a full messaging audit.
- No production source changed in this pass. Tests use disposable SQLite and mocked
  messaging bridges; no messages, external provider calls, application database writes,
  uploads, commits or deployments occurred. Authenticated rendered verification and the
  broader audit remain incomplete.

## 2026-11-04 — Keep accessibility saves successful after refresh failure

- The accessibility mutation awaited a separate query refresh after persisting its
  revision. A refresh rejection escaped the handler, making a completed revision appear
  to have failed; a refresh error named `ACCESSIBILITY_CHANGED` could also be
  misreported as a save conflict.
- Isolated post-save refresh errors and retained the committed revision ID. Actual
  persistence conflicts still return 409, and authorization checks still precede saving.
  Refresh failures are logged without claiming the query is current.
- Verification: the regression failed before the fix
  (`/tmp/hype-accessibility-refresh-red.log`). Final focused checks passed **4 files /
  41 tests** (`/tmp/hype-accessibility-refresh-final-tests.log`), covering both
  refresh-error forms, save conflicts, contributor authorization, service transactions
  and common remote guards. `bun run check` passed with **0 errors / 19 existing
  warnings** (`/tmp/hype-accessibility-refresh-check.log`); scoped whitespace validation
  passed.
- Boundary: controlled remote refresh failures, not live authenticated saves. Four
  explicit fire-and-forget requested refresh calls in `user.remote.ts` remain to inspect
  for registration-order behavior. No application database mutation, external upload,
  commit or deployment occurred; the broader audit remains active.

## 2026-11-04 — Await user-mutation query registration before returning

- Profile updates, layer defaults, saved-feature additions and removals discarded the
  promise from `requested(..., 1).refreshAll()`. Controlled delayed registration showed
  all four mutations returning early. Installed SvelteKit consumes requested payloads
  before awaiting validation, so the outer guard cannot reliably recover an
  already-consumed request.
- All four paths now await a shared local helper that preserves their existing one-query
  bound. It catches/logs post-commit registration errors, preserving successful mutation
  results while ensuring registration settles before response collection.
- Verification: four ordering regressions failed before the fix
  (`/tmp/hype-user-refresh-order-red.log`). Final focused checks passed **3 files / 58
  tests** (`/tmp/hype-user-refresh-order-final-tests.log`), including delayed successful
  and failed registration for every affected mutation, common guard behavior and
  saved-feature result shaping. `bun run check` passed with **0 errors / 19 existing
  warnings** (`/tmp/hype-user-refresh-order-check.log`); scoped whitespace validation
  passed.
- Boundary: controlled registration promises and installed transport-source inspection,
  not live authenticated command delivery. Query read errors remain distinct from
  mutation persistence errors. No application database mutation, external upload, commit
  or deployment occurred; the broader audit remains active.

## 2026-11-04 — Verify post-commit refresh fixes across all automated suites

- Full verification completed with terminal exit 0: **463 Vitest files / 4,452 tests**
  (`/tmp/hype-refresh-boundary-full-tests.log`, 118.91s), **19 script files / 90 tests /
  574 assertions** (`/tmp/hype-refresh-boundary-script-tests.log`), and **16 Location
  tests / 50 assertions** (`/tmp/hype-refresh-boundary-location-tests.log`). Total:
  **4,558 passing tests**. Production source and tests remained unchanged during these
  runs.
- Latest unchanged-source typecheck remains **0 errors / 19 existing warnings**
  (`/tmp/hype-user-refresh-order-check.log`). The full run includes the link DNS
  deadline, common post-commit refresh handling, accessibility revision outcome and four
  user-mutation ordering fixes.
- Rechecked the upload recovery boundary in current source: confirmation validates token
  expiry before persisted-image lookup, while transient retries replay the existing
  token. Ordinary upload orchestration creates a prepared grant for each invocation.
  These facts do not establish recovery after expiry/reload; extending grant validity
  alone would not be an adequate recovery design.
- No new production changes were made during this verification pass. Authenticated
  browser verification and the broader database/permission and storage-lifecycle audit
  remain incomplete. No application database mutation, external upload, commit or
  deployment occurred.

## 2026-11-04 — Keep upload status and retry changes on their queue entry

- While tracing ordinary upload retries, found status lookup falling back to File
  identity and retry/error updates matching every entry with that File. The queue
  already assigns distinct identities to repeated selections, so these updates could
  change a different entry or several entries at once.
- Status, retry count and failure updates now match only `optimisticKey`, consistent
  with successful-upload reconciliation and active-upload ownership. File-based removal
  remains a separate explicit operation.
- Verification: status, retry and error cases sharing one File produced **3 failures**
  before the fix (`/tmp/hype-queue-entry-status-red.log`). Focused checks passed **3
  files / 60 tests** (`/tmp/hype-queue-entry-status-tests.log`), including existing
  queue ownership and confirmation recovery checks. `bun run check` passed with **0
  errors / 19 existing warnings** (`/tmp/hype-queue-entry-status-check.log`); scoped
  whitespace validation passed.
- Boundary: this fixes queue state identity, not lost-acknowledgment recovery. Ordinary
  retry still calls upload orchestration with a new prepared grant; prepared
  confirmation retention across that retry remains unresolved. No application database
  mutation, external upload, commit or deployment occurred; the broader audit remains
  active.

## 2026-11-04 — Replay prepared confirmations on ordinary viewer retry

- Reproduced a failed batch confirmation followed by a user retry calling fresh upload
  orchestration. If the first confirmation committed but its response was lost, a fresh
  grant could create a duplicate instead of recovering the original image identity.
- The viewer now retains the prepared confirmation after a successful PUT, for both
  batch and single-upload paths. A compatible retry replays confirmation without another
  grant or PUT. Ownership includes queue key, File identity, resource/account scope,
  destination ancestry/target and explicit Feature options. Cosmetic resource metadata
  does not change that identity. Explicit options survive the retry button's invocation;
  changed inputs invalidate retention.
- Successful confirmation and queue removal/reset release retained credentials and file
  references. Pending uploads cannot restore retention into a removed queue entry.
  Expired retained grants are replayed for the server to reject; expiry never silently
  generates a replacement grant.
- Verification: the batch-to-user-retry regression failed before the fix
  (`/tmp/hype-viewer-confirmation-retention-red.log`). Final focused checks passed **4
  files / 87 tests** (`/tmp/hype-viewer-confirmation-retention-verified-tests.log`),
  covering batch replay, single-upload reuse, scope/file/removal/options invalidation,
  success release, task recovery and token validation. Initial typecheck caught a test
  mock typing error, which was corrected. Final `bun run check` passed with **0 errors /
  19 existing warnings** (`/tmp/hype-viewer-confirmation-retention-final-check.log`);
  scoped whitespace validation passed.
- Boundary: in-memory recovery after acknowledged object upload, not durable recovery
  after reload or token expiry, nor recovery from an ambiguous failed PUT. No external
  upload or application database mutation occurred; tests use controlled transport. No
  commit or deployment occurred; the broader audit remains active.

## 2026-11-04 — Verify retained confirmation expiry and removal lifecycles

- Added controlled lifecycle checks showing repeated server rejection of an expired
  retained grant never issues fresh upload orchestration, and removing an entry during
  its pending PUT does not restore retained credentials or queue state afterward. No
  production change was needed for these invariants.
- Focused lifecycle/token verification passed **2 files / 72 tests**
  (`/tmp/hype-retained-upload-lifecycle-tests.log`). Typecheck passed with **0 errors /
  19 existing warnings** (`/tmp/hype-retained-upload-lifecycle-check.log`); scoped
  whitespace validation passed.
- Full Vitest verification then passed **463 files / 4,463 tests**
  (`/tmp/hype-retained-upload-full-tests.log`, 129.59s), with production source and
  tests unchanged during the run. Script and Location suites were not rerun here; their
  latest results are recorded above.
- Boundary: lifecycle tests use controlled PUT/confirmation promises, and token expiry
  is covered separately by token-validation tests. This is not live R2 or
  authenticated-browser proof, nor durable recovery after reload/ambiguous PUT. No
  application database mutation, external upload, commit or deployment occurred; the
  broader audit remains active.

## 2026-11-04 — Preserve first-page freshness across pagination

- Reproduced hierarchy traversal history treating a newly appended page as validation of
  the entire list. A first page loaded at 1 second, extended at 55 seconds, then
  revisited at 62 seconds skipped its overdue refresh and retained old rows.
- Pagination now records the existing first-page validation timestamp when retaining the
  expanded traversal. Returning after the original one-minute freshness window refreshes
  the first page; fetching another page cannot extend that window. The separate Feature
  query implementation already preserves this invariant.
- Verification: the new controlled-clock regression failed before the fix
  (`/tmp/hype-pagination-freshness-red.log`). Focused list, panel, client, collection
  reactivity and optimism checks passed **5 files / 97 tests**
  (`/tmp/hype-pagination-freshness-tests.log`). `bun run check` passed with **0 errors /
  19 existing warnings** (`/tmp/hype-pagination-freshness-check.log`); scoped whitespace
  validation passed.
- Boundary: controlled native-query lifecycle evidence, not authenticated-browser
  verification. No database mutation, external upload, commit or deployment occurred;
  the broader audit remains active.

## 2026-11-04 — Retire stale history before a replacement list read

- Reproduced a forced hierarchy-list refresh failing transiently, followed by an
  ordinary load restoring its still-fresh historical entry. This cleared the error and
  skipped a recovery request even though the explicit replacement had failed.
- Starting a replacement now removes the prior history entry for that query before
  constructing its native handle. Compatible rows remain available as previews, but only
  a successful replacement can restore retained freshness. Feature query first-page
  replacement already follows this rule.
- Verification: the new recovery regression failed before the fix
  (`/tmp/hype-failed-refresh-history-red.log`). Focused list, panel, client, collection
  reactivity and optimism checks passed **5 files / 98 tests**
  (`/tmp/hype-failed-refresh-history-tests.log`). Typecheck passed with **0 errors / 19
  existing warnings** (`/tmp/hype-failed-refresh-history-check.log`); scoped whitespace
  validation passed.
- Boundary: controlled native-query tests, not authenticated-browser proof. No database
  mutation, external upload, commit or deployment occurred; the broader audit remains
  active.

## 2026-11-04 — Revalidate resolved Feature cursor queries

- Found Feature pagination awaiting already-resolved native cursor handles without
  refreshing them, unlike hierarchy pagination. This could append old rows after a
  mutation or reuse rows whose current request would be denied.
- Resolved cursor handles now refresh before their rows enter the active traversal or
  shared retention. New pending handles still await their initial request. Existing
  generation checks reject obsolete completions, and access failures clear
  traversal/retention through the existing denial path.
- Verification: fresh-result and 403 regressions both failed before the fix
  (`/tmp/hype-feature-cursor-refresh-red.log`). Focused Feature query, reactivity,
  integration, saved-panel and optimism checks passed **5 files / 86 tests**
  (`/tmp/hype-feature-cursor-refresh-tests.log`). Typecheck passed with **0 errors / 19
  existing warnings** (`/tmp/hype-feature-cursor-refresh-check.log`); scoped whitespace
  validation passed.
- Boundary: controlled query refresh/denial evidence, not live permission revocation or
  authenticated-browser verification. No database mutation, external upload, commit or
  deployment occurred; the broader audit remains active.

## 2026-11-04 — Verify pagination and refresh recovery together

- Full Vitest verification passed **463 files / 4,467 tests**
  (`/tmp/hype-pagination-recovery-full-tests.log`, 112.29s). Source and tests remained
  unchanged during the run. This includes hierarchy pagination freshness, failed
  replacement history recovery and resolved Feature cursor revalidation.
- Latest typecheck remains **0 errors / 19 existing warnings**
  (`/tmp/hype-feature-cursor-refresh-check.log`). Script and Location Bun suites were
  not rerun in this pass; earlier results remain separately recorded.
- Automated success does not establish complete database/permission review or
  authenticated-browser verification. Those broader audit requirements remain open. No
  application database mutation, external upload, commit or deployment occurred.

## 2026-11-04 — Recover Feature views from query construction failure

- Reproduced Feature first-page query construction throwing outside its guarded
  lifecycle. The error was not exposed, old native handles remained attached under the
  new scope, and an older pending request could leave loading stuck because its
  completion was already superseded.
- Query construction now runs inside the existing error/finally boundary. Obsolete
  pending/page handles are retired before construction; compatible saved-list previews
  retain their existing same-scope behavior. Failure settles loading, exposes the error
  and allows the next load to retry.
- Verification: completed-old-read and pending-old-read regressions both failed before
  the fix (`/tmp/hype-feature-construction-red.log`). They now verify empty cross-scope
  rows, ignored old completion and successful recovery. Focused Feature, reactivity,
  integration, saved-panel and optimism checks passed **5 files / 88 tests**
  (`/tmp/hype-feature-construction-tests.log`). Typecheck passed with **0 errors / 19
  existing warnings** (`/tmp/hype-feature-construction-check.log`); scoped whitespace
  validation passed.
- Boundary: controller tests inject a synchronous construction failure; this does not
  establish an observed live account-data exposure. No database mutation, external
  upload, commit or deployment occurred; the broader audit remains active.

## 2026-11-04 — Expire map freshness when starting a replacement read

- Reproduced a failed forced map refresh retaining the previous successful validation
  timestamp. An ordinary load inside that old one-minute window returned without
  retrying, leaving the failure and old markers in place.
- Starting a map replacement now clears active freshness before awaiting native queries.
  Successful completion establishes a new timestamp; transient failure keeps compatible
  markers visible without marking them fresh.
- Verification: the immediate-retry regression failed before the fix
  (`/tmp/hype-map-refresh-freshness-red.log`). Focused map, Feature, reactivity,
  integration and optimism checks passed **5 files / 98 tests**
  (`/tmp/hype-map-refresh-freshness-tests.log`). Typecheck passed with **0 errors / 19
  existing warnings** (`/tmp/hype-map-refresh-freshness-check.log`); scoped whitespace
  validation passed.
- Boundary: controlled map query lifecycle evidence, not rendered-map or
  authenticated-browser verification. No database mutation, external upload, commit or
  deployment occurred; the broader audit remains active.

## 2026-11-04 — Join complete Feature refresh operations

- Reproduced an ordinary load joining a pending forced Feature refresh by awaiting an
  already-resolved native handle. The joining caller returned early and missed the
  refresh's eventual error.
- Matching non-forced loads now share the active controller operation through
  reactive-state reconciliation and failure propagation. Explicit forced loads still
  supersede earlier work. Clear and invalidation detach the active operation, and owner
  checks prevent an obsolete completion from detaching its replacement.
- Verification: delayed-success and delayed-403 regressions both failed before the fix
  (`/tmp/hype-feature-refresh-join-red.log`). Focused Feature, map, reactivity,
  integration, saved-panel and optimism checks passed **6 files / 110 tests**
  (`/tmp/hype-feature-refresh-join-tests.log`). Typecheck passed with **0 errors / 19
  existing warnings** (`/tmp/hype-feature-refresh-join-check.log`); scoped whitespace
  validation passed.
- Boundary: shared first-page/controller load operations; this does not claim
  cross-browser request serialization. No database mutation, external upload, commit or
  deployment occurred; the broader audit remains active.

## 2026-11-04 — Verify shared Feature operation teardown

- Added four controlled lifecycle checks for clear/invalidation during a pending read,
  covering ordinary lists and bounded map queries. Each proves a replacement starts
  immediately, the obsolete completion cannot detach it, a matching caller remains
  pending until the replacement settles, and only current rows remain.
- No production change was needed. Focused Feature, map, reactivity, integration,
  saved-panel and optimism checks passed **6 files / 114 tests**
  (`/tmp/hype-feature-operation-lifecycle-tests.log`). Typecheck passed with **0 errors
  / 19 existing warnings** (`/tmp/hype-feature-operation-lifecycle-check.log`); scoped
  whitespace validation passed.
- Boundary: controller operation ownership under controlled promises, not
  authenticated-browser account switching. The broader database/permission and
  reactivity audit remains active; no database mutation, external upload, commit or
  deployment occurred.

## 2026-11-04 — Bind map-style reads to their authorized project scope

- Found the project map-style picker authorizing an ID-first/code-fallback project
  probe, then passing the original reference to a service that independently selects by
  `id OR code`. These lookup rules need not identify the same project when identifiers
  overlap.
- The picker now passes the exact authorized project ID, organisation and hub to the
  scoped catalog reader. It no longer resolves the raw project reference again after
  authorization. Existing missing-scope, dual-scope and denial handling remains in
  place.
- Verification: the scope-binding regression failed before the fix
  (`/tmp/hype-map-style-authorized-scope-red.log`). Project remote, map-style and
  map-style transaction suites passed **3 files / 71 tests**
  (`/tmp/hype-map-style-authorized-scope-final-tests.log`). Typecheck passed with **0
  errors / 19 existing warnings** (`/tmp/hype-map-style-authorized-scope-check.log`);
  scoped whitespace validation passed.
- Boundary: static lookup evidence and controlled remote/service tests, not a
  demonstrated live identifier collision. Scope binding does not make role/ancestry
  reads transactional. No database mutation, external upload, commit or deployment
  occurred; the broader audit remains active.

## 2026-11-04 — Verify map-style denial paths precede catalog work

- Added focused remote checks for conflicting project/organisation scope identifiers, an
  unresolved project, and denied project access. Each verifies that catalog
  synchronization and both project/scoped catalog readers remain untouched; the
  missing-project case returns an empty result while invalid/denied requests retain
  their 400/403 outcomes.
- No production change was needed. Project remote, map-style and map-style transaction
  suites passed **3 files / 74 tests** (`/tmp/hype-map-style-denial-tests.log`).
  Typecheck passed with **0 errors / 19 existing warnings**
  (`/tmp/hype-map-style-denial-check.log`); scoped whitespace validation passed.
- Boundary: remote control-flow tests with controlled authorization decisions, not live
  role assignment or an exhaustive permission audit. No database mutation, external
  upload, commit or deployment occurred; the broader audit remains active.

## 2026-11-04 — Keep unresolved catalog hub ownership restricted

- Catalog sync writes null hub ownership when a declared hub code is absent. Previously,
  catalog visibility treated that persisted null as global, allowing a hub-restricted
  style to appear in unrelated scopes.
- The shared visibility predicate now also resolves each catalog-declared hub owner
  inside SQL and requires the request's hub to match. Missing owners, unrelated hubs and
  null/core scope fail closed even for previously persisted null ownership. The owning
  hub remains eligible. These predicates use the small fixed catalog and are shared by
  reads and guarded project style assignments.
- Verification: a real SQLite null-owner regression failed before the fix
  (`/tmp/hype-catalog-hub-scope-red.log`). It verifies missing/foreign/core denial,
  owning-hub access and relational picker exclusion. Initial broader verification
  exposed a missing hub table in the project-form SQLite fixture; the fixture now
  includes the schema-shaped table. Final project map-style transaction, project form
  transaction, project remote and map-style checks passed **4 files / 90 tests**
  (`/tmp/hype-catalog-hub-scope-final-tests.log`). Typecheck passed with **0 errors / 19
  existing warnings** (`/tmp/hype-catalog-hub-scope-final-check.log`); scoped whitespace
  validation passed.
- Boundary: disposable SQLite and mocked remote verification, not live catalog repair or
  authenticated-browser testing. No application database mutation, external upload,
  commit or deployment occurred; the broader audit remains active.

## 2026-11-04 — Verify catalog hub restrictions during assignment

- Added disposable SQLite assignment checks for missing and unrelated catalog owner
  hubs, owner-code change after preflight but before the transaction, and successful
  assignment by the owning hub when persisted style ownership is null.
- Unavailable preflight scopes perform no batch. A write-time owner-code change aborts
  the two-statement replacement and preserves the prior assignment and timestamps. The
  owning hub succeeds. No additional production change was needed.
- Verification: project map-style transaction, project form transaction and project
  remote suites passed **3 files / 77 tests** (`/tmp/hype-catalog-hub-write-tests.log`).
  Typecheck passed with **0 errors / 19 existing warnings**
  (`/tmp/hype-catalog-hub-write-check.log`); scoped whitespace validation passed.
- Boundary: disposable SQLite transaction evidence, not live role revocation or
  deployment verification. No application database mutation, external upload, commit or
  deployment occurred; the broader audit remains active.

## 2026-11-04 — Verify query lifecycle and catalog scope fixes across all suites

- Full Vitest verification passed **463 files / 4,485 tests**
  (`/tmp/hype-query-catalog-full-tests.log`, 112.19s). The separate script suite passed
  **19 files / 90 tests / 574 assertions** (`/tmp/hype-query-catalog-script-tests.log`),
  and Location passed **16 tests / 50 assertions**
  (`/tmp/hype-query-catalog-location-tests.log`). Combined: **4,591 passing tests**.
  Source and tests remained unchanged during these runs.
- This verifies the recent Feature construction/recovery/shared-operation work and
  map-style authorized scope/catalog hub restrictions together. Latest typecheck remains
  **0 errors / 19 existing warnings** (`/tmp/hype-catalog-hub-write-check.log`).
- These automated results do not establish exhaustive database/permission coverage or
  authenticated-browser behavior. The broader audit remains active. No application
  database mutation, external upload, commit or deployment occurred.

## 2026-11-04 — Verify analytics scope cannot widen through prefixes or empty ownership

- Traced asset analytics from the guarded remote through role-derived scope resolution
  and outbound filters. Added checks proving caller prefixes are removed for a project
  owner, and no-role/empty-hub actors are denied rather than forwarding empty filters to
  the global downstream dataset.
- No production defect was established in these paths. An initial parameterized test
  fixture passed role entries instead of arrays; corrected the fixture before final
  verification. Final authorization, platform analytics and asset analytics service
  checks passed **3 files / 20 tests**
  (`/tmp/hype-analytics-scope-audit-final-tests.log`). Typecheck passed with **0 errors
  / 19 existing warnings** (`/tmp/hype-analytics-scope-audit-final-check.log`); scoped
  whitespace validation passed.
- Boundary: controlled scope resolution and service tests, not live analytics
  credentials, external requests or a complete analytics authorization audit. No
  application database mutation, external upload, commit or deployment occurred; the
  broader audit remains active.

## 2026-11-04 — Refresh the native Assets analytics query explicitly

- The Assets header refresh action previously awaited the same cached native query
  without calling its refresh method, unlike platform analytics facets. Reproduced the
  missing refresh through the real page's header action in a jsdom component test.
- Explicit Assets refresh now awaits the native query refresh before reading its result.
  Initial loading continues through the ordinary query path, and existing
  request-version handling still gates publication.
- Verification: the page-action regression failed before the fix
  (`/tmp/hype-analytics-page-refresh-red.log`). The first test setup had a circular
  barrel/skeleton mock import and was stopped; replacing dashboard presentation with a
  small fixture and providing jsdom's missing animation stub produced the clean
  regression. Page action, asset dashboard and analytics service tests passed **3 files
  / 15 tests** (`/tmp/hype-analytics-page-refresh-tests.log`). Typecheck passed with **0
  errors / 19 existing warnings** (`/tmp/hype-analytics-page-refresh-check.log`); scoped
  whitespace validation passed.
- Boundary: real page/controller interaction with controlled remote queries and display
  fixture, not authenticated-browser verification. Analytics account/role-change cache
  handling remains under review. No application database mutation, external upload,
  commit or deployment occurred; the broader audit remains active.

## 2026-11-04 — Scope analytics snapshots to account and role identity

- The admin analytics page can remain mounted across account changes, but its reload
  signature and native query arguments previously depended only on
  facet/prisms/hostname. Reproduced an identity transition failing to start a new query
  while an old account request remained pending.
- Both analytics remote payloads now accept cache-only scope metadata. The page keys
  queries and reloads by account revision plus the existing resource role/hub/locale
  scope, clears snapshots/previews/hostname on identity change, and checks captured
  identity as well as request version before publishing success or failure. Server
  authorization remains based exclusively on guarded identity and persisted resources.
- Verification: the mounted-page identity regression failed before the fix
  (`/tmp/hype-analytics-identity-red.log`). It now verifies a distinct query cache key
  and rejects a delayed old-account completion. Page refresh, analytics authorization,
  platform analytics and asset dashboard checks passed **4 files / 22 tests**
  (`/tmp/hype-analytics-identity-tests.log`). Typecheck passed with **0 errors / 19
  existing warnings** (`/tmp/hype-analytics-identity-check.log`); scoped whitespace
  validation passed.
- Boundary: real page controller in jsdom with controlled queries/display fixture, not a
  live authenticated-session switch. No application database mutation, external upload,
  commit or deployment occurred; the broader audit remains active.

## 2026-11-04 — Verify analytics identity changes across all facets

- Expanded the mounted-page checks to account revision changes with the same resource
  role scope, covering Assets, Views, Audience and Data. Each proves a new native query
  identity is requested and delayed old results cannot replace the current facet result.
- No additional production change was needed. Page lifecycle, analytics authorization,
  platform analytics and asset dashboard checks passed **4 files / 26 tests**
  (`/tmp/hype-analytics-identity-lifecycle-tests.log`). Typecheck passed with **0 errors
  / 19 existing warnings** (`/tmp/hype-analytics-identity-lifecycle-check.log`); scoped
  whitespace validation passed.
- Boundary: controlled page lifecycle tests, not browser-session authentication. No
  application database mutation, external upload, commit or deployment occurred; the
  broader audit remains active.

## 2026-11-04 — Exercise translation schema limits before provider calls

- Translation commands require non-anonymous accounts and bound request volume, but
  their remote test harness previously bypassed schema parsing. The harness now applies
  each real schema before executing its handler.
- Added empty-batch, batch-count, individual-text, aggregate-volume and
  single-field-size rejection checks; all verify no provider adapter call occurs. No
  production change was needed.
- Verification: translation remote, profile translation and Location-name translation
  checks passed **3 files / 25 tests** (`/tmp/hype-translation-boundary-tests.log`).
  Typecheck passed with **0 errors / 19 existing warnings**
  (`/tmp/hype-translation-boundary-check.log`); scoped whitespace validation passed.
- Boundary: authentication and per-request validation evidence. No translation-specific
  rate limiter was found in the inspected request path; these tests do not establish
  aggregate quota enforcement. No external provider request, application database
  mutation, commit or deployment occurred; the broader audit remains active.

## 2026-11-04 — Ignore delayed link autofill after teardown or read-only transition

- Reproduced title lookup and label translation invoking the link field's `onChange`
  after unmount or after the field became read-only. Existing text/URL guards did not
  cover these editor lifecycle states.
- The field now rejects autofill initiation and completion when detached or
  non-editable. Delayed title errors also avoid updating status in those states.
  Existing guards for changed URLs, source text and target text remain intact.
- Verification: all four title/translation × unmount/read-only regressions failed before
  the fix (`/tmp/hype-link-field-lifecycle-red.log`). Link field, link-title and profile
  translation checks passed **3 files / 30 tests**
  (`/tmp/hype-link-field-lifecycle-tests.log`). Typecheck passed with **0 errors / 19
  existing warnings** (`/tmp/hype-link-field-lifecycle-check.log`); scoped whitespace
  validation passed.
- Boundary: component lifecycle tests with controlled responses; this does not establish
  identity guards for a reused editor whose record changes without unmounting. No
  application database mutation, external provider request, commit or deployment
  occurred; the broader audit remains active.

## 2026-11-04 — Bind feature field editor lifetimes to the selected Feature

- Traced the link editor's only field-collection route: property rows are keyed by
  property ID, allowing the component to survive navigation between Features sharing the
  same property. Matching copied link IDs/text could therefore satisfy field-local
  guards after record replacement.
- The admin Feature route now keys the field collection by the current Feature ID.
  Feature navigation tears down the old collection, making the verified link-editor
  unmount guard apply even when property and link identities match. Ordinary updates to
  the same Feature retain the collection.
- Verification: existing link-field teardown, profile translation and Feature
  creation/navigation suites passed **3 files / 34 tests**
  (`/tmp/hype-feature-field-lifetime-tests.log`). Typecheck passed with **0 errors / 19
  existing warnings** (`/tmp/hype-feature-field-lifetime-check.log`); scoped whitespace
  validation passed.
- Boundary: static route/composition tracing plus component teardown tests; no rendered
  authenticated route-navigation check was available. No application database mutation,
  external provider request, commit or deployment occurred; the broader audit remains
  active.

## 2026-11-04 — Retire link autofill across editing sessions

- Extended the link lifecycle regression to close and reopen editing before
  title/translation completion. Both old results could previously regain permission
  because the editor was editable again at settlement.
- Requests now capture an edit generation. Becoming read-only advances the generation,
  clears title lookup deduplication/status, and prevents prior-session title/translation
  results or title errors from applying after reopening.
- Verification: both reopened-editor cases failed before the fix
  (`/tmp/hype-link-edit-generation-red.log`). Link field, profile translation and
  link-title checks passed **3 files / 32 tests**
  (`/tmp/hype-link-edit-generation-tests.log`). Typecheck passed with **0 errors / 19
  existing warnings** (`/tmp/hype-link-edit-generation-check.log`); scoped whitespace
  validation passed.
- Boundary: mounted component lifecycle tests with controlled responses, not live
  provider or browser-session verification. No application database mutation, external
  provider request, commit or deployment occurred; the broader audit remains active.

## 2026-11-04 — Verify analytics and field lifecycle changes together

- Full Vitest verification passed **464 files / 4,505 tests**
  (`/tmp/hype-analytics-link-lifecycle-full-tests.log`, 111.88s). Source and tests
  remained unchanged during the run. This includes analytics refresh/account identity,
  translation validation and link-editor teardown/reopened-edit protections.
- Latest typecheck remains **0 errors / 19 existing warnings**
  (`/tmp/hype-link-edit-generation-check.log`). Script and Location suites were not
  rerun here; their latest successful results remain separately recorded.
- Automated success does not establish exhaustive database/permission review or
  authenticated-browser navigation. The broader audit remains active. No application
  database mutation, external provider request, commit or deployment occurred.

## 2026-11-04 — Fence delayed address-part translations

- Street/building-name and unit-portion translation callbacks checked text but not
  editor lifetime, editing state or address identity. Reproduced street-name callbacks
  applying after unmount, becoming read-only, and replacement with another address
  object containing identical source text.
- Both address-part translation handlers now capture the address object and edit
  generation and require the component to remain active/editable at settlement. Ending
  editing retires earlier generations, and existing source/target text checks remain
  intact.
- Verification: the three lifecycle cases failed before the fix
  (`/tmp/hype-address-part-translation-red.log`). The test fixture isolates address-name
  loading and targets the correct part control. Location-name translation, address
  controls and street-number editor checks passed **3 files / 40 tests**
  (`/tmp/hype-address-part-translation-tests.log`). Typecheck passed with **0 errors /
  19 existing warnings** (`/tmp/hype-address-part-translation-check.log`); scoped
  whitespace validation passed.
- Boundary: component callbacks with controlled translation responses; no authenticated
  route navigation or live translation-provider verification. No application database
  mutation, commit or deployment occurred; the broader audit remains active.

## 2026-11-04 — Preserve display-translation target and editing lifetime

- Reproduced a formatted-address translation requested for Simplified Chinese applying
  to Traditional Chinese after the component's locale prop changed. Also reproduced an
  old result applying after editing closed and reopened.
- The handler now captures its target locale and edit generation. It rejects completion
  when either changes and writes only using the captured locale, alongside existing
  address-identity and teardown guards.
- Verification: locale-change and reopened-edit regressions both failed before the fix
  (`/tmp/hype-display-translation-locale-red.log`). Location translation, address
  controls and street-number checks passed **3 files / 42 tests**
  (`/tmp/hype-display-translation-locale-tests.log`). Typecheck passed with **0 errors /
  19 existing warnings** (`/tmp/hype-display-translation-locale-check.log`); scoped
  whitespace validation passed.
- Boundary: controlled component prop/lifecycle changes, not authenticated browser or
  live provider verification. No application database mutation, external translation
  request, commit or deployment occurred; the broader audit remains active.

## 2026-11-04 — Preserve storage objects still owned by another image row

- Image environment/public ID is not unique across database rows, but post-delete
  cleanup previously removed that namespace without checking other rows. Reproduced
  storage deletion despite another persisted owner in project, organisation and hub
  replacement cleanup.
- Shared asset cleanup now checks for any remaining image row with the same
  environment/public ID before resolving buckets or deleting originals/sidecars/derived
  assets. Both detached-resource cleanup and explicit image deletion use this guard.
  Database lookup failure prevents storage deletion.
- Verification: three shared-owner remote regressions failed before the fix
  (`/tmp/hype-shared-image-storage-red.log`). Disposable SQLite checks cover same-key
  ownership, other-environment/key isolation and deletion of the last owner. Remote,
  cleanup and resource upload checks passed **3 files / 129 tests**
  (`/tmp/hype-shared-image-storage-tests.log`). Typecheck passed with **0 errors / 19
  existing warnings** (`/tmp/hype-shared-image-storage-check.log`); scoped whitespace
  validation passed.
- Boundary: protects references present at cleanup's database read. It does not
  atomically serialize later attachment with R2 deletion, supply a durable cleanup queue
  or solve orphan recovery. No application database mutation, live bucket deletion,
  commit or deployment occurred; the broader audit remains active.

## 2026-11-04 — Verify image reference lookup failures preserve storage

- Added project/organisation/hub cleanup cases where the post-delete storage-reference
  query fails. Each verifies the exact environment/public ID lookup happens after row
  deletion, no storage delete is called and the cleanup failure is logged.
- No production change was needed. Image remote, cleanup and resource upload checks
  passed **3 files / 132 tests** (`/tmp/hype-image-cleanup-lookup-failure-tests.log`).
  Typecheck passed with **0 errors / 19 existing warnings**
  (`/tmp/hype-image-cleanup-lookup-failure-check.log`); scoped whitespace validation
  passed.
- Boundary: fail-closed behavior preserves assets after lookup failure, but cleanup
  remains best-effort logging without durable retry and does not serialize future
  attachments with R2. No application database mutation, live storage deletion, commit
  or deployment occurred; the broader audit remains active.

## 2026-11-04 — Verify address and image cleanup fixes together; assess maintenance recovery

- Full Vitest verification passed **464 files / 4,517 tests**
  (`/tmp/hype-cleanup-maintenance-full-tests.log`, 112.63s), including the latest
  address translation and shared-image storage protections. No production code changed
  in this pass. Typecheck and separate Bun suites were not rerun.
- Inspected the maintenance scheduler, maintenance route, image schema and cleanup
  helpers. The scheduler dispatches guest-account cleanup and map-render refresh; no
  durable image-cleanup queue was found in these paths. Storage deletion/list helpers
  catch and log failures, so retry orchestration would also require explicit failure
  outcomes.
- Unresolved: durable cleanup needs persisted ownership/retirement coordination with
  image creation or reattachment, plus observable retry outcomes. Adding a scheduled
  retry alone would not close the database-reference-check/R2-delete race. No retry
  worker, migration or storage mutation was introduced.
- Boundary: automated regression evidence and static maintenance tracing, not
  authenticated browser verification or exhaustive database/permission coverage. The
  broader audit remains active; no commit or deployment occurred.

## 2026-11-04 — Reject resource refreshes after query selection changes

- Organisation, project, layer, property, task and hub refreshes checked request serials
  but could still publish obsolete rows if filters/sorting changed before the next
  request started. Reproduced all six paths retaining obsolete rows, including a
  selection array mutated in place (`/tmp/hype-resource-query-identity-red.log`).
- These refreshes now capture serialized query identity before loading and compare it
  with the live query identity as well as the request serial before publishing rows,
  retaining entities or continuing hierarchy reconciliation. Existing account
  invalidation and explicit role-scope guards remain intact.
- Verification: app user-state, resource-scope and resource-list suites passed **3 files
  / 64 tests** (`/tmp/hype-resource-query-identity-tests.log`). Typecheck passed with
  **0 errors / 19 existing warnings** (`/tmp/hype-resource-query-identity-check.log`);
  scoped whitespace validation passed.
- Boundary: controlled coordinator response ordering, not authenticated browser
  interaction. The separately maintained admin task/hub metadata writes occur inside
  query functions and require further review; this change guards coordinator row
  publication. No application database mutation, commit or deployment occurred; the
  broader audit remains active.

## 2026-11-04 — Keep admin task and hub metadata owned by their request

- Reproduced task and hub responses writing old totals under a newly selected sort
  identity, and older same-query reads overwriting newer metadata. All four regressions
  failed before the fix (`/tmp/hype-admin-metadata-red.log`). Coordinator row guards
  could not prevent these writes because they occur inside the query functions.
- Metadata writes now require the latest per-resource read serial, unchanged serialized
  filter/sort identity, unchanged access scope and unchanged cache generation. Task
  forbidden-response fallback uses the same guard. Added explicit return types and
  helper/API documentation.
- Verification: task-prism/metadata and app user-state suites passed **2 files / 32
  tests** (`/tmp/hype-admin-metadata-tests.log`), including surface disposal and an
  obsolete task 403 finishing after a successful newer read. Typecheck passed with **0
  errors / 19 existing warnings** (`/tmp/hype-admin-metadata-check.log`); scoped
  whitespace validation passed.
- Boundary: controlled remote promises and real context metadata storage, not
  authenticated browser verification. No application database mutation, external
  request, commit or deployment occurred; the broader audit remains active.

## 2026-11-04 — Scope retained list metadata and clear it with view lifetimes

- Reproduced task and hub metadata remaining addressable under a different account, plus
  metadata surviving account reconciliation, explicit cache reset and surface disposal.
  All five regressions failed before the fix (`/tmp/hype-metadata-lifetime-red.log`).
  Retained completeness flags feed the admin local-sort shortcut, so stale metadata must
  not outlive its row cache.
- Task/hub query identities now include the resource client's access scope. Account
  reconciliation, cache reset and disposal clear the view's metadata map along with
  retained data.
- Verification: admin metadata/task prisms, app user-state and scoped Feature index
  suites passed **3 files / 40 tests** (`/tmp/hype-metadata-lifetime-tests.log`).
  Typecheck passed with **0 errors / 19 existing warnings**
  (`/tmp/hype-metadata-lifetime-check.log`); scoped whitespace validation passed.
- Boundary: verifies retained metadata removal and account-key separation. In-flight
  Feature-index publication after an explicit cache reset remains a separate review
  item. No application database mutation, external request, commit or deployment
  occurred; the broader audit remains active.

## 2026-11-04 — Retire Feature index and navigation requests across cache reset

- Reproduced four explicit-reset failures: replacement first-page reads joined obsolete
  work, late first pages restored metadata, a previously ready index skipped reload, and
  late continuation pages restored cleared records
  (`/tmp/hype-feature-index-reset-red.log`). Two further regressions reproduced pending
  navigation IDs and remembered navigation order surviving reset
  (`/tmp/hype-feature-navigation-reset-red.log`).
- Feature page identity now includes access scope and cache generation alongside
  hierarchy/sorting. First-page deduplication, ready-state reuse, continuation
  acceptance and native-collection reconciliation use this identity. Navigation identity
  incorporates it too, retiring both pending traversal and remembered order after reset.
- Verification: scoped Feature index, Feature navigation, admin metadata/task prism and
  app user-state checks passed **4 files / 60 tests**
  (`/tmp/hype-feature-reset-final-tests.log`). Typecheck passed with **0 errors / 19
  existing warnings** (`/tmp/hype-feature-reset-final-check.log`); scoped whitespace
  validation passed.
- Boundary: real context lifecycle with controlled remote responses, not authenticated
  browser interaction. This does not establish exhaustive database/permission or cache
  coverage. No application database mutation, external request, commit or deployment
  occurred; the broader audit remains active.

## 2026-11-04 — Notify reactive list-count consumers on metadata changes

- The Feature index header reads list metadata reactively, but the metadata store was a
  plain Map. A mounted fixture using the same accessor retained its initial unknown
  total after metadata insertion (`/tmp/hype-list-metadata-reactivity-red.log`).
- Switched the metadata store to SvelteMap and updated obsolete query-cache ownership
  comments. Counts now notify consumers independently of row changes, including
  replacements and cache clearing.
- Verification: rendered metadata, scoped Feature index, admin metadata/task prisms and
  Feature navigation checks passed **4 files / 37 tests**
  (`/tmp/hype-list-metadata-reactivity-tests.log`). Typecheck passed with **0 errors /
  19 existing warnings** (`/tmp/hype-list-metadata-reactivity-check.log`). Full Vitest
  verification passed **465 files / 4,542 tests**
  (`/tmp/hype-admin-cache-lifecycle-full-tests.log`, 113.40s), covering the recent
  resource-query identity, metadata lifecycle and Feature reset fixes together. Scoped
  whitespace validation passed; separate Bun suites were not rerun.
- Boundary: mounted jsdom fixture with the real view metadata store, not authenticated
  browser/header interaction. No application database mutation, external request, commit
  or deployment occurred; the broader audit remains active.

## 2026-11-04 — Verify messaging delivery and partial replay recovery

- Returned to database/permission coverage and inspected organisation/account
  authorization, recipient ownership, immutable send attribution and replay cursor
  ordering. Added two disposable-SQLite regressions for previously untested failure
  interleavings; no production change was needed.
- A confirmed outbox projection survives a later failure of the still-pending send call
  and an older uncertain replay. Repeating the same intent returns the confirmed result
  without another bridge send.
- A synthetic failure on the second projected message leaves the first committed but the
  account cursor unchanged; readers cannot advance through that unacknowledged partial
  replay. Retrying after removing the fault projects both messages exactly once and
  retains the latest conversation timestamp.
- Verification: the complete messaging integration file passed **40 tests**
  (`/tmp/hype-messaging-recovery-audit-tests.log`), including existing organisation
  isolation and verified-recipient boundaries. Typecheck passed with **0 errors / 19
  existing warnings** (`/tmp/hype-messaging-recovery-audit-check.log`); scoped
  whitespace validation passed.
- Boundary: disposable SQLite plus mocked bridges, not live provider behavior or
  exhaustive messaging review. No messages were sent externally, and no application
  database mutation, commit or deployment occurred; the broader audit remains active.

## 2026-11-04 — Verify inactive messaging ownership boundaries

- Added five disposable-SQLite authorization cases: archived organisations reject both
  ordinary members and superadmins; archived users, guest recipients and verified
  telephone-derived identities whose source phone changed reject recipient actions.
- Tests exercise remote handlers and real account/recipient SQL checks, asserting denial
  before send, history, media and profile bridge calls and before send-intent insertion.
  Existing production guards satisfied these cases without changes.
- Verification: complete messaging integration suite passed **45 tests**
  (`/tmp/hype-messaging-inactive-boundaries-tests.log`). Typecheck passed with **0
  errors / 19 existing warnings** (`/tmp/hype-messaging-inactive-boundaries-check.log`);
  scoped whitespace validation passed.
- Boundary: archived/identity state is changed before authorization. This does not
  establish transactional reauthorization of role or recipient changes during external
  I/O. No external messages, provider calls, application database mutations, commits or
  deployments occurred; the broader audit remains active.

## 2026-11-04 — Report accessibility subject transitions as save conflicts

- The accessibility service preflight allowed only shared live physical subjects, but
  its INSERT SELECT rechecked the source revision without rechecking Location state or
  kind. A concurrent transition to private/manual storage reached the database trigger
  and surfaced as a raw database error instead of the documented ACCESSIBILITY_CHANGED
  conflict. The trigger already prevented an invalid write; this was an error-contract
  gap, not a demonstrated unauthorized insertion.
- The atomic insert predicate now repeats the live-state and supported-kind conditions.
  A changed subject produces no inserted row and follows the existing conflict response
  path. Regression coverage changes state to manual or kind to natural after the subject
  read, retaining the same immutable revision, and asserts the conflict plus zero
  inserted observations.
- Verification: the private-state case reproduced the raw-error mismatch in
  `/tmp/hype-accessibility-subject-race-red.log`. That exploratory log also contains an
  invalid redirect setup rejected by existing redirect safeguards; the final fixture
  omits that case. Final service, remote and draft-accessibility suites passed **3 files
  / 18 tests** (`/tmp/hype-accessibility-subject-race-final-tests.log`). Typecheck
  passed with **0 errors / 19 existing warnings**
  (`/tmp/hype-accessibility-subject-race-check.log`); scoped whitespace validation
  passed.
- Boundary: deterministic disposable-SQLite interleaving, not live concurrent requests.
  No application database mutation, commit or deployment occurred; the broader audit
  remains active.

## 2026-11-04 — Verify relationship endpoint constraints at insertion time

- Traced relationship predecessor/root uniqueness, endpoint visibility and endpoint-kind
  triggers plus transition participant batch insertion. Existing tests cover conflicting
  successors, private endpoints and atomic rollback when a transition participant is
  unavailable.
- Added deterministic occupancy interleavings that change the container after canonical
  endpoint resolution but before the insert executes. Private/manual and
  unsupported-kind transitions are rejected by their exact database trigger errors, with
  zero occupancy rows inserted. No production change was needed.
- Verification: relationship service suite passed **10 tests**
  (`/tmp/hype-relationship-write-boundaries-tests.log`). Typecheck passed with **0
  errors / 19 existing warnings** (`/tmp/hype-relationship-write-boundaries-check.log`);
  scoped whitespace validation passed.
- Boundary: disposable-SQLite write-time endpoint checks, not transactional
  reauthorization of actor roles or a complete evidence-reference audit. No application
  database mutation, external request, commit or deployment occurred; the broader audit
  remains active.

## 2026-11-04 — Verify scoped relationship evidence and catalogue redaction

- Inspected evidence type validation and relationship catalogue shaping. Added shared,
  unrelated-Organisation and owning-Organisation cases for an assertion citing a private
  occupancy revision. Shared and unrelated scopes reject before insertion; the owning
  scope succeeds.
- The successful owning-scope catalogue response is also checked to omit evidence,
  actorId and provenance. No production change was needed for these cases.
- Verification: relationship service suite passed **13 tests**
  (`/tmp/hype-relationship-evidence-scope-tests.log`). Typecheck passed with **0 errors
  / 19 existing warnings** (`/tmp/hype-relationship-evidence-scope-check.log`); scoped
  whitespace validation passed.
- Boundary: tests immutable relationship evidence scope at authoring and catalogue
  redaction. Lineage reads return evidence and require separate review of source
  visibility after lifecycle transitions; this pass does not establish that boundary. No
  application database mutation, external request, commit or deployment occurred; the
  broader audit remains active.

## 2026-11-04 — Verify lineage visibility after participant privacy changes

- Traced lineage evidence shaping: responses include the assertion's retained
  quotation/reference but do not dereference or load the cited source record. No
  explicit policy requiring retrospective removal of an independently authored quotation
  was found in the inspected design text, so no new redaction policy was inferred.
- Added current/history regressions where one participant becomes private after a shared
  event was authored. Shared and unrelated scopes return no event and no continuation
  cursor; the owning Organisation retains the complete event. Actor/provenance fields
  remain omitted.
- Verification: lineage/review, relationship services and remote authorization suites
  passed **3 files / 29 tests** (`/tmp/hype-lineage-visibility-audit-tests.log`).
  Typecheck passed with **0 errors / 19 existing warnings**
  (`/tmp/hype-lineage-visibility-audit-check.log`); scoped whitespace validation passed.
  No production change was needed.
- Boundary: proves current participant visibility and response shaping, not
  authorization for separately dereferencing a retained evidence link. No application
  database mutation, external request, commit or deployment occurred; the broader audit
  remains active.

## 2026-11-04 — Recheck address-order scope inside the transaction

- Reproduced a Location becoming private after reorder preflight but before its batch:
  an empty reorder still inserted an operation receipt and reported success; a nonempty
  reorder reached an endpoint trigger and threw instead of returning the service's
  conflict result. Both regressions failed before the fix
  (`/tmp/hype-address-order-scope-race-red.log`).
- Reused one subject-visibility predicate at preflight and in the guarded transaction
  receipt insertion. If scope is no longer valid, neither the receipt nor any successor
  inserts execute, and the service returns `{ status: 'conflict', ids: [] }`.
- Verification: relationship review, service and remote suites passed **3 files / 31
  tests** (`/tmp/hype-address-order-scope-race-tests.log`), including exact replay and
  later-statement rollback coverage. Typecheck passed with **0 errors / 19 existing
  warnings** (`/tmp/hype-address-order-scope-race-check.log`); scoped whitespace
  validation passed.
- Boundary: deterministic disposable-SQLite preflight/batch interleaving. This rechecks
  resource visibility, not actor role changes during the operation. No application
  database mutation, external request, commit or deployment occurred; the broader audit
  remains active.

## 2026-11-04 — Verify request-local persisted role snapshots

- Compared guarded request setup with the authorization design. `setupRequestHandler`
  reloads persisted roles on every non-guest invocation; guarded remote context does not
  authorize from session-carried role arrays. The design explicitly documents that image
  transactions fence resource ancestry without rereading role grants at commit; that
  limitation is not evidence of a missing feature in the stated current image contract.
- Added tests showing retained session owner roles are ignored in favor of current
  member roles, a subsequent request observes removal, guests skip role loading and
  receive an empty role set, and a failed role lookup aborts setup rather than falling
  back to retained claims. No production change was needed.
- Verification: API session context, remote guards and guest authorization suites passed
  **3 files / 35 tests** (`/tmp/hype-request-role-snapshot-tests.log`). Typecheck passed
  with **0 errors / 19 existing warnings**
  (`/tmp/hype-request-role-snapshot-check.log`); scoped whitespace validation passed.
- Boundary: tests the real setup function with mocked role/database providers. It does
  not prove atomic role reads across the underlying role tables or commit-time
  revocation handling. No application database mutation, external request, commit or
  deployment occurred; the broader audit remains active.

## 2026-11-04 — Verify the recent database and cache audit changes together

- Full Vitest verification passed **465 files / 4,563 tests**
  (`/tmp/hype-db-cache-audit-full-tests.log`, 113.51s), covering the recent
  accessibility/address-order scope fixes, request role-snapshot checks, messaging
  recovery/visibility and relationship lifecycle regressions alongside the earlier cache
  changes.
- Separate Bun script verification passed **19 files / 90 tests / 574 assertions**
  (`/tmp/hype-db-cache-audit-script-tests.log`). Separate Location verification passed
  **16 tests / 50 assertions** (`/tmp/hype-db-cache-audit-location-tests.log`). These
  are new runs, not restatements of previous receipts.
- No implementation changed during this pass. Latest unchanged-source typecheck remains
  **0 errors / 19 existing warnings** (`/tmp/hype-request-role-snapshot-check.log`).
- Boundary: automated verification does not establish complete service/permission
  coverage, live D1/provider behavior or authenticated browser interaction. No
  application database mutation, external message, commit or deployment occurred; the
  broader audit remains active.

## 2026-11-04 — Bound per-view list metadata retention

- List metadata retained every filter/sort identity until account change, explicit reset
  or disposal. A retention regression demonstrated growth beyond 128 entries
  (`/tmp/hype-list-metadata-retention-red.log`).
- The store now retains the 128 most recently written identities, matching the existing
  inactive native detail/pin history limit. Updating an identity renews its position.
  Reads remain side-effect free; mutation/eviction bookkeeping runs untracked to avoid
  subscribing caller effects to map size or iteration. An evicted metadata entry returns
  null and cannot enable completeness-based local sort reuse.
- Verification: rendered metadata, admin metadata/task prisms and scoped Feature index
  suites passed **3 files / 22 tests** (`/tmp/hype-list-metadata-retention-tests.log`),
  including count replacement/reset and renewal before eviction. Typecheck passed with
  **0 errors / 19 existing warnings** (`/tmp/hype-list-metadata-retention-check.log`);
  scoped whitespace validation passed.
- Boundary: deterministic retention and mounted jsdom checks, not browser heap
  profiling. No application database mutation, external request, commit or deployment
  occurred; the broader audit remains active.

## 2026-11-04 — Retire permanent import Feature lookup promises

- The import module cached Feature lookup promises forever by ID, including null results
  and rejected promises. Reproduced missing-after-create, unretryable failure, reuse of
  a prior successful result after a changed access response, and failure to refresh a
  retained native handle; all four failed before the fix
  (`/tmp/hype-import-lookup-cache-red.log`).
- Exported lookups now use the shared native-query refresh helper and retain no
  cross-call result promise. Initialization keeps a local map from one concurrent
  unique-ID prefetch pass, preserving batched transport and duplicate-row reuse without
  carrying it across imports or mutations.
- Verification: import Feature resolution and user-state suites passed **2 files / 19
  tests** (`/tmp/hype-import-lookup-cache-tests.log`), including one request for
  duplicate IDs per initialization and a fresh read on the next initialization.
  Typecheck passed with **0 errors / 19 existing warnings**
  (`/tmp/hype-import-lookup-cache-check.log`); scoped whitespace validation passed.
- Boundary: controlled remote responses and initialization state; no live import/save or
  authenticated browser verification. This removes retained cross-call results but does
  not by itself fence an entire pending import flow across account changes. No
  application database mutation, external request, commit or deployment occurred; the
  broader audit remains active.

## 2026-11-04 — Remove incomplete global Feature row-model memoization

- The module-level row-model cache keyed by Feature ID used an incomplete signature: it
  omitted view property definitions, non-display locale content, user fallback
  preferences and image alt text. Three regressions reproduced cross-view labels, stale
  translation status and stale alt text (`/tmp/hype-feature-row-cache-red.log`). The map
  also retained every visited ID indefinitely.
- Removed the second/global model cache and its partial signature. The existing virtual
  list calls the builder only for mounted rows after its scrolling placeholder settles;
  model presentation now reads current inputs while the lower-level view-owned statistic
  caches remain in use. The exported function is retained for existing callers and
  documents that ownership.
- Verification: four row-model cases plus the rendered status-pip test passed **2 files
  / 5 tests** (`/tmp/hype-feature-row-cache-tests.log`), including fallback-preference
  changes. Typecheck passed with **0 errors / 19 existing warnings**
  (`/tmp/hype-feature-row-cache-check.log`); scoped whitespace validation passed.
- Boundary: actual model calculations and jsdom status rendering, not a browser
  performance measurement. Lower-level statistic invalidation is a separate review
  concern. No application database mutation, external request, commit or deployment
  occurred; the broader audit remains active.

## 2026-11-04 — Bind primed Feature statistics to their source inputs

- Primed view-local statistics were retrieved by Feature ID/statistic alone, even after
  optimistic in-place changes or replacement rows. Reproduced stale publication status,
  image completion and content flags (`/tmp/hype-feature-stat-source-red.log`).
- Feature statistic setters now retain a semantic source token, and getters reuse values
  only while current inputs match. Tokens cover flags, image counts, locale
  content/generated flags, property values and relevant property components.
  Unknown/unversioned/stale entries use pure calculation instead of mutating caches
  during rendering. Translation-completion tokens retain presence/generated flags rather
  than duplicated prose.
- Verification: row-model/statistic regressions, rendered pips and app user-state suites
  passed **3 files / 35 tests** (`/tmp/hype-feature-stat-source-tests.log`). Coverage
  includes in-place edits, replacement image counts, added translations, changed
  property component and unchanged-input cache reuse. Typecheck passed with **0 errors /
  19 existing warnings** (`/tmp/hype-feature-stat-source-check.log`); scoped whitespace
  validation passed.
- Boundary: controlled source changes and real statistic calculations; no browser
  performance measurement. Statistics retention volume remains separate from value
  validity. No application database mutation, external request, commit or deployment
  occurred; the broader audit remains active.

## 2026-11-04 — Bound retained Feature statistics

- Feature entity retention was capped at 2,000 while its separate statistics map
  retained every primed identity. A regression reproduced 2,001 retained statistic
  records (`/tmp/hype-stat-retention-red.log`).
- Statistic writes now evict the oldest whole Feature records above 2,000. Repriming
  renews retention order through the existing replacement operation. Reads remain
  side-effect-free, and evicted rows use the existing current-input calculation
  fallback.
- Verification: row-model/statistic, rendered pips and app user-state suites passed **3
  files / 36 tests** (`/tmp/hype-stat-retention-tests.log`). Regression verifies the
  bound, refreshed-row retention, oldest-row eviction and calculation without read-time
  reinsertion. Typecheck passed with **0 errors / 19 existing warnings**
  (`/tmp/hype-stat-retention-check.log`); scoped whitespace validation passed.
- Boundary: bounds retained Feature identities, not the number of properties within one
  Feature. No browser performance measurement, external request, application database
  mutation, commit or deployment; broader audit remains active.

## 2026-11-04 — Clear retained import rows and enrichment on reset

- Cancel/close/new-file paths call `ImportCtx.reset()`, but it omitted CSV data,
  row-indexed enrichment, the layer form and its creation/submission flags. Old
  enrichment could therefore be applied to the same row index of a subsequent import;
  cancelled CSV contents also remained retained.
- Reset now clears those five omitted fields along with the existing import state.
  Preserved the current reset structure and comments.
- Verification: two regressions failed before the fix
  (`/tmp/hype-import-reset-red.log`). Import reset and Feature-resolution suites passed
  **2 files / 12 tests** (`/tmp/hype-import-reset-tests.log`), including a full
  initial-state comparison after seeding every retained field. Typecheck passed with **0
  errors / 19 existing warnings** (`/tmp/hype-import-reset-check.log`); scoped
  whitespace validation passed.
- Boundary: synchronous reset is covered with the real reactive ImportCtx. Pending
  asynchronous import operations can still outlive reset and need a separate lifecycle
  fence audit; no account-transition or browser proof claimed. No external requests,
  application database mutations, commits or deployments occurred.

## 2026-11-04 — Fence asynchronous Feature resolution refreshes

- A pending resolution lookup could publish old rows after reset/replacement, and a late
  rejection could clear newer results. Concurrent refreshes also published in completion
  order instead of request order. Two deferred lookup regressions reproduced replacement
  races (`/tmp/hype-import-refresh-race-red.log`).
- Refresh publication now requires the newest operation for that ImportCtx and unchanged
  CSV/header/column identities. WeakMap ownership avoids retaining completed contexts.
  Initialization checks input identity after lookup and before merging, preventing old
  CSV rows from consuming a new import's enrichment or updating its fallback layer.
- Verification: reset and Feature-resolution suites passed **2 files / 15 tests**
  (`/tmp/hype-import-refresh-race-tests.log`), including late success, late failure and
  overlapping refreshes with different missing-ID policies. Typecheck passed with **0
  errors / 19 existing warnings** (`/tmp/hype-import-refresh-race-check.log`); scoped
  whitespace validation passed.
- Boundary: this fences resolution initialization/publication for replaced inputs; it
  does not cancel a running submission queue, fence all import enrichment requests or
  establish account-transition behavior. Those lifecycle paths remain under audit. No
  application database mutations, external requests, commits or deployments occurred.

## 2026-11-04 — Stop superseded Feature submission queues

- A deferred Feature lookup demonstrated that resetting an import did not stop its
  submission queue: the old operation continued looking up subsequent rows and writing
  result/progress state (`/tmp/hype-import-queue-reset-red.log`).
- Queues now retain input and result-array identities and check ownership before each
  row and after each asynchronous row result/error. Single-row processing checks the
  same guard after preflight lookups and before/after submission, preventing further
  requests after reset/replacement. Standalone row processing defaults to input-identity
  checks.
- Verification: import resolution/reset suites passed **2 files / 18 tests**
  (`/tmp/hype-import-queue-reset-tests.log`), including reset during lookup, replacement
  results and rejected lookup after reset. Typecheck passed with **0 errors / 19
  existing warnings** (`/tmp/hype-import-queue-reset-check.log`); scoped whitespace
  validation passed.
- Boundary: client cancellation cannot undo a write already submitted to the server.
  Deferred preflight lookups were tested with mocked remotes; no actual submission or
  browser interaction occurred. Account changes without import reset and other
  enrichment workflows remain separate audit concerns. No application database mutation,
  external request, commit or deployment occurred.

## 2026-11-04 — Verify cache and import lifecycle fixes together

- Full Vitest verification passed **467 files / 4,589 tests** in 113.49s
  (`/tmp/hype-import-cache-full-tests.log`), covering current Feature statistic
  source/retention, row-model, import lookup, reset, refresh and submission-queue
  changes together. The original process completed successfully without restart.
- Follow-up source audit found the import route does not reset on account/role-scope
  changes, and its CSV parsing and project-association paths have additional
  asynchronous writes. In particular, `fetchAvailablePropertyKeys` publishes
  success/error/finally state without checking the current project or request order.
  These are pending findings, not resolved issues or tested account-transition
  guarantees.
- This is unit/integration verification with fixtures and mocked external boundaries,
  not authenticated browser or production proof. No code edits in this verification
  pass, application database mutations, external requests, commits or deployments. The
  broader audit remains active.

## 2026-11-04 — Fence project-property choices during import

- Deferred request tests reproduced old-project success replacing newer choices, old
  failure clearing them, old completion ending a newer same-project loading indicator,
  and reset/reselection restoring old properties
  (`/tmp/hype-import-properties-red.log`).
- Property loading now requires the latest per-context request plus unchanged
  selected-project and CSV-data identities before publishing success, failure or loading
  completion. WeakMap request ownership does not retain disposed contexts. Loading
  without a selected project clears choices and loading state without a request.
- Verification: property-loading, reset and Feature-resolution suites passed **3 files /
  23 tests** (`/tmp/hype-import-properties-tests.log`); typecheck passed with **0 errors
  / 19 existing warnings** (`/tmp/hype-import-properties-check.log`); scoped whitespace
  validation passed. An initial test hook accidentally returned the mock as a cleanup
  function and caused a timeout; corrected the hook to return void before final
  verification.
- Boundary: tests use the real reactive ImportCtx and deferred mocked remotes. The
  surrounding project-selection continuation still needs its own guard before remapping
  columns; account ownership, CSV parsing and other enrichment paths remain under audit.
  No application database mutation, external request, commit or deployment occurred.

## 2026-11-04 — Preserve newer import state across project metadata and CSV reads

- Three deferred project-selection regressions reproduced old metadata completion
  remapping columns or advancing the flow after reset, a newer selection or manual
  remapping (`/tmp/hype-import-project-red.log`). Selection continuations now require
  the latest operation and unchanged project/data/header/column identities before
  publishing.
- Two deferred CSV-read regressions reproduced old files replacing newer data and
  reviving reset imports (`/tmp/hype-import-csv-red.log`). CSV publication now requires
  the latest drop and unchanged input identity. Removed redundant post-await state
  mutations in the flow wrappers so they cannot undo the service guards; successful
  services already publish those transitions.
- Verification: five import lifecycle suites passed **5 files / 29 tests**
  (`/tmp/hype-import-entry-lifecycle-tests.log`), including current selection
  advancement and current CSV publication. Typecheck passed with **0 errors / 19
  existing warnings** (`/tmp/hype-import-entry-lifecycle-check.log`); scoped whitespace
  validation passed.
- Boundary: real reactive context with deferred file reads/metadata fixtures, not a
  mounted browser flow. Account/role-scope ownership and remaining async
  validation/enrichment/layer-creation paths remain under audit. No application database
  mutation, external request, commit or deployment occurred.

## 2026-11-04 — Fence import layer creation and preserve property lookup failures

- Deferred regressions reproduced reset during project-property loading still issuing
  `createLayer`, and reset during create/reload publishing an old layer into the new
  import and clearing its loading state (`/tmp/hype-import-layer-red.log`). Creation now
  checks per-context operation, project, data and form ownership after each asynchronous
  boundary. Stale operations stop further requests and state publication; loading
  cleanup belongs only to the current operation.
- A separate regression reproduced project-property lookup failure being treated as an
  empty property list, allowing an incomplete layer to be created
  (`/tmp/hype-import-layer-properties-red.log`). Lookup failures now propagate to the
  existing creation error path, preserving the form and issuing no create request.
- Verification: layer lifecycle, reset and project-selection suites passed **3 files /
  12 tests** (`/tmp/hype-import-layer-tests.log`), including normal successful
  creation/selection and loading cleanup. Typecheck passed with **0 errors / 19 existing
  warnings** (`/tmp/hype-import-layer-check.log`); scoped whitespace validation passed.
- Boundary: mocked remote requests with the real reactive context; no actual layer
  created. Client cancellation cannot roll back an already-submitted create.
  Account/role-scope ownership and other asynchronous validation/enrichment paths remain
  under audit. No application database mutation, external request, commit or deployment
  occurred.

## 2026-11-04 — Keep pending layer translations within their originating draft

- Deferred regressions reproduced a translation filling a reopened form, applying
  outdated source text and reporting success after every target field had been manually
  filled (`/tmp/hype-layer-translation-red.log`).
- Layer drafts now carry weakly owned lifetime tokens renewed on opening and invalidated
  on closing. Translation publication requires the same draft, import data and project;
  each field also requires unchanged source text and a still-empty target. Empty/no-op
  results return false without replacing form state. Draft tokens allow independent
  locale translations to complete despite immutable form updates.
- Verification: translation, layer creation and reset suites passed **3 files / 13
  tests** (`/tmp/hype-layer-translation-tests.log`), including simultaneous translations
  to two locales and generated flags. Typecheck passed with **0 errors / 19 existing
  warnings** (`/tmp/hype-layer-translation-check.log`); scoped whitespace validation
  passed.
- Boundary: deferred mocked translation calls and real reactive context; no translation
  provider requests or browser interaction. Feature batch translation, account-scope
  ownership and remaining validation callbacks remain under audit. No application
  database mutation, external request, commit or deployment occurred.

## 2026-11-04 — Stop superseded Feature translation batches

- A deferred regression demonstrated continued translation requests after cancellation
  (`/tmp/hype-batch-translation-red.log`). The batch processor now accepts an ownership
  check, evaluates it before requests and after responses, and returns starting results
  without further status publication when superseded.
- The translation step binds work to mounted lifetime, current step and
  CSV/header/column identities. It uses the captured analysis when saving results,
  ignores stale errors/results and releases translating status on unmount so revisiting
  can restart. Results are assigned only after the ownership check.
- Batch result updates now copy nested per-scenario records, preventing partial work
  from mutating the caller's retained result map.
- Verification: batch translation, layer translation and reset suites passed **3 files /
  11 tests** (`/tmp/hype-batch-translation-tests.log`), covering cancellation between
  directions, normal completion and input-result immutability. Typecheck passed with **0
  errors / 19 existing warnings** (`/tmp/hype-batch-translation-check.log`); scoped
  whitespace validation passed.
- Boundary: service tests use mocked translators; component cancellation wiring is
  typechecked/source-reviewed, not a mounted browser verification. Already-dispatched
  provider requests cannot be undone. Account ownership and remaining import validation
  callbacks remain under audit. No application database mutation, provider request,
  commit or deployment occurred.

## 2026-11-04 — Verify translation cancellation in the mounted component

- Mounted the actual TranslationStep with the real ImportCtx and deferred mocked
  translation remote in jsdom. Verified that late success and failure after unmount
  neither enrich rows nor advance the step, that unmount releases translating state, and
  that mounting again completes a fresh translation and advances normally.
- Added a reset-while-mounted case: a late response cannot restore enrichment or change
  the reset step/status, and no second translation direction is requested.
- Verification: mounted step, batch translation and layer translation suites passed **3
  files / 11 tests** (`/tmp/hype-mounted-translation-tests.log`). Typecheck passed with
  **0 errors / 19 existing warnings** (`/tmp/hype-mounted-translation-check.log`);
  scoped whitespace validation passed.
- Boundary: this closes the mounted-component evidence gap for those cancellation cases,
  not real-browser layout or authenticated account-transition verification. Source
  inspection still finds unguarded user/layer validation continuations in
  ImportFeatureFlow; those and account ownership remain under audit. No provider
  request, application database mutation, commit or deployment occurred.

## 2026-11-04 — Fence import user/layer validation and preload publication

- Source tracing found user/layer validation callbacks, final enrichment/step
  advancement and layer preload responses writing into ImportCtx without checking reset,
  navigation, destination or account scope.
- The mounted flow now captures per-operation ownership, CSV/header/column/project
  identities, current step and role scope. Progress/results/error callbacks and final
  continuations publish only while current; destruction invalidates all operations.
  Layer preload uses a separate operation identity. Validation services accept ownership
  checks and stop further user lookups, row processing and callbacks when superseded.
- Verification: deferred user/layer lookup cancellation tests plus layer-creation/reset
  suites passed **3 files / 10 tests** (`/tmp/hype-validation-lifecycle-tests.log`).
  Typecheck passed with **0 errors / 19 existing warnings**
  (`/tmp/hype-validation-lifecycle-check.log`); scoped whitespace validation passed.
- Boundary: deferred service cancellation is tested; the full ImportFeatureFlow wrapper
  wiring is typechecked/source-reviewed, not mounted-browser proof. Cancellation returns
  empty results and callers explicitly recheck ownership before interpreting them.
  Import-wide account reset and remaining callback families remain under audit. No
  application database mutation, external request, commit or deployment occurred.

## 2026-11-04 — End retained imports when account or role scope changes

- A mounted import-route regression reproduced retained CSV and enrichment after the
  reactive account scope changed (`/tmp/hype-import-account-red.log`). The route now
  watches the canonical role-scope key, resets ImportCtx and pending drop/flow selection
  when it changes, and resets on route destruction. Reset replaces input identities used
  by the existing asynchronous guards.
- Verification: mounted route, reset and mounted translation suites passed **3 files / 7
  tests** (`/tmp/hype-import-account-tests.log`), covering account change, role change
  and unmount. Typecheck passed with **0 errors / 19 existing warnings**
  (`/tmp/hype-import-account-check.log`); scoped whitespace validation passed. Before
  this change, the combined import suite passed **11 files / 57 tests**
  (`/tmp/hype-import-combined-tests.log`).
- Boundary: the real route was mounted in jsdom with mocked child flows/header providers
  and a reactive role-scope source; no authenticated browser session switch was
  performed. Account-reset publication does not cancel already-dispatched writes.
  Image-upload worker cancellation remains a separate audit item: hiding the image flow
  alone does not prove its queue has stopped. No application database mutation, external
  request, commit or deployment occurred.

## 2026-11-04 — Stop cancelled image import queues before later uploads

- Image flow session checks previously suppressed UI callbacks but did not stop queue
  processing. Added ownership checks to drop orchestration, each batch and individual
  uploads after intent/hash resolution, upload-context construction and upload
  completion. The flow supplies mounted/session/role-scope ownership for normal and
  replacement uploads, invalidates sessions on destruction and ignores stale replacement
  cleanup.
- Verification: image queue suite passed **1 file / 5 tests**
  (`/tmp/hype-image-cancellation-tests.log`), covering cancellation during hierarchy
  lookup, cancellation during hashing before upload/later batches, and existing per-row
  decode/hash failure continuation. Typecheck passed with **0 errors / 19 existing
  warnings** (`/tmp/hype-image-cancellation-check.log`); scoped whitespace validation
  passed. An initial edit misplaced a guard in context enrichment; focused
  tests/typecheck exposed it and it was corrected before final verification.
- Boundary: mocked hierarchy/image operations; no images uploaded. Cancellation prevents
  subsequent upload calls but cannot abort work already dispatched within
  uploadAndProcessImage. Hierarchy prefetch itself may finish pending read requests.
  Full mounted image-flow cancellation and remaining audit coverage are still
  outstanding. No application database mutation, external request, commit or deployment
  occurred.

## 2026-11-04 — Verify mounted image cancellation and fix drop identity loops

- Mounting the actual image flow with a plain drop object exposed
  `state_proxy_equality_mismatch` and `effect_update_depth_exceeded`: the deduplication
  marker deep-proxied the event and no longer equaled the original prop, repeatedly
  starting uploads. Changed the identity marker to `$state.raw`; applied the same
  correction to the identical Feature flow marker.
- Mounted image-flow tests now prove one queue start per supplied drop, invalidation of
  the supplied ownership callback on destruction/account-scope change, and Back-button
  cancellation without restarting the same drop.
- Verification: mounted image flow plus queue service suite passed **2 files / 8 tests**
  (`/tmp/hype-mounted-image-tests.log`). Typecheck passed with **0 errors / 19 existing
  warnings** (`/tmp/hype-mounted-image-check.log`); scoped whitespace validation passed.
  Test setup provides the responsive context and disables fade animations unsupported by
  jsdom; the actual flow and buttons are mounted, with queue service mocked separately
  from its service tests.
- Boundary: these are jsdom interaction and mocked-service tests, not actual file
  uploads or authenticated browser switching. The equivalent Feature marker correction
  is source-based; full mounted Feature validation remains an audit gap. No application
  database mutation, external request, commit or deployment occurred.

## 2026-11-04 — Verify import lifecycle changes across the full unit suite

- Full Vitest verification passed **477 files / 4,624 tests** in 115.58s
  (`/tmp/hype-import-lifecycle-full-tests.log`). The original process completed
  successfully without restart. No implementation changes were made while this suite was
  running.
- Follow-up source inspection identified outstanding geocoding lifecycle work: the
  paused loop has no unmount exit, remote completion can still enrich shared rows, and
  final advancement is unconditional. Property creation also waits for translation
  before dispatching a create without a lifetime check. These are pending findings, not
  resolved items or verified safe behavior.
- Current inventory remains 82 database-service files and 32 remote modules; passing
  tests alone do not establish full audit coverage. Existing database/permission
  evidence, image storage cleanup limits and remaining import work still need completion
  review.
- Boundary: unit/integration fixtures, including mounted jsdom tests, not authenticated
  browser or production proof. No application database mutation, external request,
  commit or deployment occurred; the broader audit remains active.

## 2026-11-04 — Cancel stale and paused import geocoding

- Mounted tests reproduced late geocoding advancing reset/unmounted imports to Feature
  resolution (`/tmp/hype-geo-lifecycle-red.log`). Geocoding now captures mounted
  lifetime, current step and data/header/column/project identities, checks ownership
  before caching or enriching responses, and suppresses stale errors and advancement.
- Destruction stops geocoding, paused loops check ownership, and the final continuation
  no longer advances cancelled work. The explicit next-step handler also requires the
  mounted geocoding step.
- Verification: mounted geocoding and account-lifecycle suites passed **2 files / 4
  tests** (`/tmp/hype-geo-lifecycle-tests.log`). Cases cover reset/unmount during
  response, no stale localStorage write/enrichment, and a paused loop exiting on unmount
  without requesting the next row or advancing. Typecheck passed with **0 errors / 19
  existing warnings** (`/tmp/hype-geo-lifecycle-check.log`); scoped whitespace
  validation passed.
- Boundary: actual component mounted in jsdom with a mocked provider; paused-loop timers
  are controlled. Already-dispatched geocoding reads cannot be undone. Property-creation
  continuations and broader audit coverage remain outstanding. No provider request,
  application database mutation, commit or deployment occurred.

## 2026-11-04 — Fence import property creation and its translation wait

- Source tracing found property creation could dispatch after waiting for translation
  even if its editor/import had been replaced, then publish created property
  enrichment/cache entries or completion into current state. Creation now captures
  mounted lifetime, property key, CSV/column/project identities, step and role scope;
  checks ownership after translation waiting and remote create; suppresses stale
  errors/completion; and releases its processing state on destruction only while it
  still owns that state.
- Property-label translation captures source label/placeholder values and the same
  editor ownership. Stale responses cannot update translated fields or issue the second
  locale request after cancellation.
- Verification: mounted property-creation and property-loading suites passed **2 files /
  8 tests** (`/tmp/hype-property-creation-tests.log`). Cases cover reset/unmount while
  create is pending and unmount during translation waiting with no subsequent create
  call. Typecheck passed with **0 errors / 19 existing warnings**
  (`/tmp/hype-property-creation-check.log`); scoped whitespace validation passed.
  Initial fixtures required sampleValues and a freeform scenario; the translation-wait
  test uses real timers because fake timers stalled component teardown.
- Boundary: actual component mounted with mocked remote/context providers; no property
  was created externally. A create already dispatched cannot be undone. Remaining
  property enrichment callbacks and broad completion coverage remain under audit. No
  application database mutation, provider request, commit or deployment occurred.

## 2026-11-04 — Fence property enrichment and surface translation failure

- Mounted deferred tests reproduced property enrichment continuing after reset/unmount
  and translation failures being swallowed while the component claimed completion
  (`/tmp/hype-property-enrichment-red.log`). Enrichment now captures mounted lifetime,
  property key, import inputs, project, step and reconciliation-map ownership. It checks
  before each translation batch and before publication; stale continuation actions
  cannot advance the flow.
- Current translation failures now propagate to the component's existing error/retry UI
  instead of publishing incomplete enrichment. Retry rebuilds local row enrichment and
  publishes only after translation completes.
- Verification: mounted enrichment and creation suites passed **2 files / 7 tests**
  (`/tmp/hype-property-enrichment-tests.log`), covering reset, unmount, provider
  rejection, retry and completed locale values. Typecheck passed with **0 errors / 19
  existing warnings** (`/tmp/hype-property-enrichment-check.log`); scoped whitespace
  validation passed.
- Boundary: real mounted components/context with mocked translators, not provider or
  authenticated-browser verification. No application database mutation, external
  request, commit or deployment occurred; the broader database/permission and reactivity
  completion audit remains active.

## 2026-11-04 — Load the complete import layer catalogue

- Import layer preloading requested only offset 0 with limit 500, silently excluding
  later accessible layers from matching. A regression reproduced a missing second page
  (`/tmp/hype-layer-pagination-red.log`). Preloading now follows server
  hasMore/nextOffset metadata, falls back to totalCount/page length when metadata is
  absent, and deduplicates layer identities across pages.
- Non-advancing pagination and later-page failures use the existing failure path rather
  than returning a successful partial catalogue.
- Verification: pagination, layer creation and validation-cancellation suites passed **3
  files / 10 tests** (`/tmp/hype-layer-pagination-tests.log`), including server
  continuation offsets, later failure and stalled offsets. Typecheck passed with **0
  errors / 19 existing warnings** (`/tmp/hype-layer-pagination-check.log`); scoped
  whitespace validation passed. Before this fix, the combined import suite passed **17
  files / 76 tests** (`/tmp/hype-import-final-combined-tests.log`).
- Boundary: mocked paginated responses; no large-project production query. Preload
  errors still follow the pre-existing empty-list contract, and offset pagination is not
  a database snapshot across concurrent edits. No application database mutation,
  external request, commit or deployment occurred; the broader audit remains active.

## 2026-11-04 — Refresh native layer pages and cancel further pagination

- Native query-handle regression reproduced preloading a retained old layer result
  without refreshing it. A separate deferred page regression reproduced continuing
  pagination after cancellation (`/tmp/hype-layer-freshness-red.log`).
- Each layer page now uses the existing refreshRemoteQuery helper and reads its
  refreshed current payload. Preloading accepts an ownership callback checked
  before/after requests; both flow preloading and validation pass their existing guard.
  Cancelled pagination returns no partial catalogue and issues no next-page request.
- Verification: layer pagination, creation and validation lifecycle suites passed **3
  files / 12 tests** (`/tmp/hype-layer-freshness-tests.log`). Typecheck passed with **0
  errors / 19 existing warnings** (`/tmp/hype-layer-freshness-check.log`); scoped
  whitespace validation passed.
- Boundary: controlled native-handle adapter and deferred mocked pages; no live account
  or production query. Already-dispatched reads finish, and offset pagination does not
  provide a transaction snapshot. No application database mutation, external request,
  commit or deployment occurred; broader audit remains active.

## 2026-11-04 — Refresh contributor queries before import matching

- Native query-handle regressions reproduced retained users being accepted by
  ID/username validation and exposed by contributor search despite refreshed responses
  containing no user (`/tmp/hype-user-freshness-red.log`).
- User lookup and search now use the existing refreshRemoteQuery helper, including the
  email-validation search path. Refresh failures follow the existing
  failed-validation/empty-search behavior rather than returning stale retained data.
- Verification: native-query freshness, contributor state and validation lifecycle
  suites passed **3 files / 16 tests** (`/tmp/hype-user-freshness-tests.log`), including
  denied refresh without stale fallback. Typecheck passed with **0 errors / 19 existing
  warnings** (`/tmp/hype-user-freshness-check.log`); scoped whitespace validation
  passed.
- Boundary: simulated native query handles and mocked remotes, not live permission
  revocation. Server-side authorization remains authoritative at submission. No
  application database mutation, external request, commit or deployment occurred;
  broader audit remains active.

## 2026-11-04 — Refresh image-import hierarchy and canonical occupancy

- Native query-handle regressions reproduced retained Feature/project/organisation
  hierarchy and stale canonical occupancy being used for image-upload context
  preparation (`/tmp/hype-image-context-freshness-red.log`). These reads now use
  refreshRemoteQuery before their current payload is consumed.
- Hierarchy prefetch now accepts the upload ownership guard and checks between
  chunks/stages. Cancellation after Feature lookup prevents subsequent project,
  organisation and canonical-occupancy requests and returns no partial context map.
- Verification: image queue and mounted image-flow suites passed **2 files / 12 tests**
  (`/tmp/hype-image-context-freshness-tests.log`), including all four native query
  families and cancellation before hierarchy continuation. Typecheck passed with **0
  errors / 19 existing warnings** (`/tmp/hype-image-context-freshness-check.log`);
  scoped whitespace validation passed.
- Boundary: mocked native handles, no live hierarchy/permission changes or uploads.
  Refresh makes the client preview current at read time; server submission guards remain
  necessary for later races. No application database mutation, external request, commit
  or deployment occurred; broader audit remains active.

## 2026-11-04 — Refresh import property definitions and created-layer reads

- Native query regressions reproduced stale property-choice lists and stale property
  assignments in new layers (`/tmp/hype-import-property-freshness-red.log`). Both import
  property-loading paths now refresh their native project-property handles before using
  the current definitions.
- The post-create layer read also refreshes its handle, preventing a retained missing
  result from hiding the newly created layer. Existing ownership checks still run after
  these refreshed reads.
- Verification: property loading, layer creation and layer pagination suites passed **3
  files / 17 tests** (`/tmp/hype-import-property-freshness-tests.log`). Coverage
  verifies current property assignments and successful selection after a retained
  missing layer response. Typecheck passed with **0 errors / 19 existing warnings**
  (`/tmp/hype-import-property-freshness-check.log`); scoped whitespace validation
  passed.
- Boundary: native-query adapters and mocked create/read calls, not an actual layer
  creation or account switch. No application database mutation, external request, commit
  or deployment occurred; the broader audit remains active.

## 2026-11-04 — Guard fallback layer-step preload publication

- Completion verification for the preceding import freshness changes: full Vitest suite
  passed **482 files / 4,649 tests** (`/tmp/hype-import-freshness-full-tests.log`). This
  run preceded the component change below.
- Source inspection found that LayerMatchingStep's fallback preload did not pass the
  service ownership callback and unconditionally published after awaiting its read. It
  now captures request, input-data, project and step identities and mounted lifetime;
  obsolete success/failure cannot replace the current catalogue or loading state, and
  pagination receives the same cancellation guard.
- Verification: existing pagination and validation cancellation suites passed **2 files
  / 7 tests** (`/tmp/hype-layer-step-lifecycle-tests.log`). Typecheck passed with **0
  errors / 19 existing warnings** (`/tmp/hype-layer-step-lifecycle-check.log`); scoped
  whitespace validation passed.
- Evidence boundary: the new component wiring was source/type checked; these service
  tests do not exercise the mounted fallback focus path. Mounted interaction
  verification remains outstanding. The legacy preload failure-as-empty contract and
  durable image cleanup design also remain unresolved; the broader database/permission
  and reactivity audit is active. No application database mutation, external request,
  commit or deployment occurred.

## 2026-11-04 — Wire fallback layer search text into filtering

- The shared ImportSearchBox passes the entered value to onInput, but LayerMatchingStep
  ignored that argument and read the unchanged context query. Typing therefore left the
  fallback choices unfiltered. The handler now stores the supplied value before
  filtering.
- A mounted regression with the query assignment removed reproduced the empty query
  after typing `Beta` (`/tmp/hype-layer-search-red.log`). With the fix, mounted search
  and pagination suites passed **2 files / 6 tests**
  (`/tmp/hype-layer-search-tests.log`), including filtering and restoring choices when
  cleared. The adjacent layer-resolution and contributor search handlers already consume
  their input arguments.
- Boundary: the actual component and search box run in jsdom with a supplied responsive
  context. This is not authenticated-browser evidence and does not verify the pending
  fallback-preload lifecycle. Catalogue failure-as-empty behavior and the broader audit
  remain outstanding. No application database mutation, external request, commit or
  deployment occurred.
- Additional verification: typecheck passed with **0 errors / 19 existing warnings**
  (`/tmp/hype-layer-search-check.log`); scoped whitespace validation passed.

## 2026-11-04 — Distinguish layer catalogue failure from an empty catalogue

- preloadLayers previously swallowed failed/stalled pages as an empty array. Its flow
  caller then marked the catalogue loaded, while validation could report actual layers
  as missing. Read failures now propagate; cancellation still returns an empty array
  under the existing ownership-check contract.
- Feature-flow validation catches current failures, clears unusable choices, stops
  validation and renders an explicit retry action. Continue is blocked both while the
  request is pending and after failure. A request counter prevents an older request's
  finally block from releasing a newer request's pending state. Existing single-layer
  boolean validation helpers continue to catch failures conservatively.
- Verification: pagination, layer lifecycle, validation lifecycle and mounted search
  suites passed **4 files / 15 tests** (`/tmp/hype-layer-failure-tests.log`). Tests
  cover later-page failures, stalled continuation and failure propagation without
  progress/result callbacks. Typecheck passed with **0 errors / 19 existing warnings**
  (`/tmp/hype-layer-failure-check.log`); scoped whitespace validation passed.
- Boundary: retry/error rendering and Continue guards are source/type checked, not yet
  exercised in a mounted full Feature flow. The fallback component's independent preload
  still catches errors without its own retry message; it leaves layersLoaded false. No
  application database mutation, external request, commit or deployment occurred;
  broader audit remains active.

## 2026-11-04 — Verify mounted Feature-flow catalogue failure and cancellation

- Added mounted ImportFeatureFlow regressions using its real footer, layer step and
  catalogue service with mocked remote reads. A failed catalogue displays the retry
  alert and disables an already-visible Continue action retained from previous
  validation; retry loads choices and returns to fallback selection.
- Deferred-read tests verify Continue is disabled while loading and that input
  replacement or unmount prevents catalogue publication and further pagination. These
  tests exercise the flow ownership wiring previously verified only by source
  inspection.
- Verification: mounted flow, pagination and validation lifecycle suites passed **3
  files / 11 tests** (`/tmp/hype-mounted-layer-flow-tests.log`). Typecheck passed with
  **0 errors / 19 existing warnings** (`/tmp/hype-mounted-layer-flow-check.log`).
- Boundary: jsdom with responsive context and mocked remotes, not authenticated-browser
  or production permission-change evidence. The independent LayerMatchingStep
  focus-preload path is not covered by these flow tests. No application database
  mutation, external request, commit or deployment occurred; the broader audit remains
  active.

## 2026-11-04 — Share one fresh catalogue between layer validation and choices

- Mounted regressions reproduced two mismatches: first validation fetched the complete
  catalogue twice, while an already-loaded import validated against a fresh catalogue
  but retained old resolution choices (`/tmp/hype-layer-single-read-red.log`).
- The flow now refreshes once for every validation operation and passes that catalogue
  to validateLayers. Standalone service callers still load their own fresh catalogue.
  Matching and choice publication share the same read; existing ownership checks and
  failure handling remain in place.
- Verification: mounted flow, pagination and validation lifecycle suites passed **3
  files / 13 tests** (`/tmp/hype-layer-single-read-tests.log`), including both initial
  and previously-loaded states. Scoped whitespace validation passed.
- Boundary: mocked remote queries in mounted jsdom components; no production catalogue
  or authenticated-browser check. Offset pagination remains non-transactional across
  pages. No application database mutation, external request, commit or deployment
  occurred; broader audit remains active.
- Typecheck passed with **0 errors / 19 existing warnings**
  (`/tmp/hype-layer-single-read-check.log`). Read-only follow-up inspected
  featureCounts.ts authorization-derived query fingerprints and revision-guarded cache
  publication; no new defect established there, and this inspection does not prove
  database-wide audit completion.

## 2026-11-04 — Reconcile fallback layer selection after catalogue refresh

- Mounted regressions reproduced a removed fallback layer remaining selected with
  Continue enabled, and a still-available fallback retaining its old display data
  (`/tmp/hype-layer-fallback-refresh-red.log`). On entering fallback selection, the flow
  now resolves its retained ID against the refreshed catalogue, clears absent
  selections, and replaces retained display data with the current row.
- Verification: mounted Feature-flow and layer-search suites passed **2 files / 8
  tests** (`/tmp/hype-layer-fallback-refresh-tests.log`). Typecheck passed with **0
  errors / 19 existing warnings** (`/tmp/hype-layer-fallback-refresh-check.log`); scoped
  whitespace validation passed.
- A first verification attempt failed before test collection while generated Paraglide
  modules were unavailable; after the concurrent check completed and locale modules were
  present, the same tests passed. No generated translation sources were edited for this
  fix.
- Boundary: refreshed mocked catalogue availability, not a live permission-revocation
  test. Server-side write authorization remains authoritative after this preview. No
  application database mutation, external request, commit or deployment occurred;
  broader audit remains active.

## 2026-11-04 — Revalidate task and parent-form transaction guards

- Compared task-scope.ts, revisionBatch.ts and taskContribution.ts with the
  authorization design's task ancestry and optimistic-concurrency requirements. Task
  creation checks persisted Feature/project/organisation ancestry within the batch;
  contribution drafts guard captured task identity, contributor, revision, draft/review
  state and destination ancestry alongside the Feature plan.
- Re-read transaction tests that inject parent moves and failures, skip task writes,
  change contributor/review/draft state, and change project revisions between preflight
  and batch execution. Organisation stale-revision tests compare persisted permission
  and translation snapshots rather than merely asserting an error.
- Focused verification passed **6 files / 60 tests**
  (`/tmp/hype-db-guard-audit-tests.log`): contribution creation, contribution drafts,
  task finalization, project forms/moves and organisation forms. No new defect
  established in these inspected guards. This is scoped fixture evidence, not a
  database-wide completion claim or live D1 verification.
- Started the full Vitest suite against the accumulated changes
  (`/tmp/hype-db-import-audit-full-tests.log`); result pending at this checkpoint. No
  application database mutation, external request, commit or deployment occurred;
  broader audit remains active.

## 2026-11-04 — Inspect capability cascade and cache evidence boundaries

- Read capabilityCascade.ts and its organisation-form transaction integration.
  Descendant restriction expressions evaluate live project/role JSON booleans, retain
  only explicitly allowed existing permissions, and execute before the parent revision
  advances. No newly established defect in this inspection.
- Inspected existing capability tests for concurrent revocation, stale parent edits,
  null/numeric capability normalization and bounded parameters across 300 projects. Also
  located count-cache tests for per-user revisions, rollback, bounded retained entries
  and rejection of obsolete cache writes. Test names alone are not counted as fresh
  execution evidence; the running full suite must finish before recording its outcome.
- Full-suite process remains live on its original handle at this checkpoint; no restart
  or source changes during that run. Broader completion remains unproven, including
  live-browser evidence and durable image cleanup boundaries.
- Full-suite completion: **484 files / 4,658 tests passed** in 126.23 seconds
  (`/tmp/hype-db-import-audit-full-tests.log`, original process exit 0). This includes
  the accumulated import changes and existing database/capability/cache suites. Green
  automated tests do not establish the unresolved live-browser or storage recovery
  boundaries.

## 2026-11-04 — Restrict versioned metadata cleanup to exact suffixes

- Originals cleanup enumerated `<publicId>.v` and deleted every returned key. That
  textual prefix also matches unrelated originals such as `<publicId>.variant` and
  nested keys. Regression fixtures reproduced those deletions for project, organisation
  and hub replacement cleanup (`/tmp/hype-image-prefix-red.log`, 3 failures).
- Prefix deletion now supports an exact-format filter; versioned metadata cleanup
  accepts only a numeric revision followed by `.json`. Other cleanup namespaces retain
  their existing behavior. Tests verify unrelated prefix matches survive while an older
  listed metadata revision is still removed.
- Verification: image remote suite passed **1 file / 92 tests**
  (`/tmp/hype-image-prefix-tests.log`); scoped whitespace validation passed. Cloudflare
  skill consulted; no storage API or binding change was needed.
- Boundary: mocked bucket listings and deletion calls. Current generated upload IDs use
  random identifiers; arbitrary persisted public IDs are still accepted. This filter
  does not establish exclusive storage ownership, eliminate check/delete races, or
  provide durable cleanup retries. No live bucket operation, database mutation, commit
  or deployment occurred; broader audit remains active.
- Typecheck passed with **0 errors / 19 existing warnings**
  (`/tmp/hype-image-prefix-check.log`).

## 2026-11-04 — Verify filtered metadata cleanup across pages

- Extended the replacement-cleanup fixture so the first originals page contains only
  unrelated prefix matches and the second contains an older metadata revision.
  Assertions verify the second request uses the returned cursor, unrelated keys are
  preserved, and the later revision is deleted for project, organisation and hub
  replacement.
- Image remote suite passed **1 file / 92 tests**
  (`/tmp/hype-image-prefix-pagination-tests.log`); scoped whitespace validation passed.
  No implementation change was necessary for pagination.
- Read-only follow-up found no cleanup queue in the inspected database schema/migrations
  or workers. The authorization design explicitly documents retained objects and
  non-transactional storage as separate boundaries; current best-effort cleanup still
  has no established durable retry or ownership-reservation mechanism. This inspection
  does not claim that absence of search hits proves complete repository coverage.
- Mocked bucket evidence only; no live storage operation, database mutation, commit or
  deployment occurred. Broader audit remains active.
- Typecheck passed with **0 errors / 19 existing warnings**
  (`/tmp/hype-image-prefix-pagination-check.log`).

## 2026-11-04 — Move bulk Feature mutations out of cached queries

- Remote inventory found updateFeatureBulkState declared with guardedBatchQuery despite
  persisting state. That wrapper registers query families for requested refreshes;
  native query retention/refresh semantics are inappropriate for a write and can rerun
  it. This finding is based on the registration and mutation code paths, not a browser
  replay reproduction.
- Converted bulk editing to a guarded command accepting 1–100 updates. The admin caller
  sends one command per existing 100-row chunk and records ordered per-row outcomes;
  transport failures still produce one failure per affected row. Each row uses its own
  explicit admin intent. Dedicated publication/archive authorization remains in the
  existing mutation helper.
- Verification: Feature remote and remote-guard suites passed **2 files / 58 tests**
  (`/tmp/hype-bulk-command-tests.log`), including command metadata, ordered mixed
  success/failure, and dedicated publication behavior. Typecheck passed with **0 errors
  / 19 existing warnings** (`/tmp/hype-bulk-command-check.log`); scoped whitespace
  validation passed.
- Browser verification attempted before this work: computer-use inventory returned no
  browsers and reported the browser access host unavailable. No new unauthenticated
  session was used as evidence about existing admin authentication. UI bulk-operation
  behavior remains source/type checked, not authenticated-browser verified.
- No application database mutation, external request, commit or deployment occurred;
  broader audit remains active.

## 2026-11-04 — Cancel obsolete bulk mutation queues

- Full verification of the preceding command conversion completed before this change:
  **484 files / 4,660 tests passed** (`/tmp/hype-bulk-command-full-tests.log`, 132.50
  seconds).
- Source review found bulk writes lacked the selection loader's ownership checks: after
  unmount, account/scope changes or closing bulk mode, remaining chunks could still be
  dispatched and stale results patched into the UI. Added a guarded chunk runner and
  captured selection revision, scope, role scope, selection identity and action.
  Obsolete responses cannot publish progress, send another chunk, patch cached rows or
  display completion toasts. Changing action advances the revision so switching back
  cannot revive an older run.
- Focused verification passed **2 files / 36 tests**
  (`/tmp/hype-bulk-lifecycle-tests.log`), covering late success/failure cancellation,
  stopping later writes and ordered current completion, alongside Feature remote
  behavior. Scoped whitespace validation passed.
- Boundary: chunk-runner tests use deferred mocked commands; component ownership wiring
  is source/type checked, not a mounted admin-index or authenticated-browser test.
  Already-dispatched commands can still commit and server authorization remains
  authoritative. No application database mutation, external request, commit or
  deployment occurred; broader audit remains active.
- Workspace typecheck did **not** pass: **2 errors / 19 warnings**
  (`/tmp/hype-bulk-lifecycle-check.log`). Diagnostics are outside the changed bulk
  paths: useMediaPickerModel.svelte.ts does not yet implement newly required
  MediaPickerModel fields, and media-cache.ts passes a possibly undefined scope to
  Entry. These concurrently changed messaging files were left intact. No diagnostics
  were reported for the new runner or bulk component, which is narrower evidence than a
  green workspace check.

## 2026-11-04 — Publish a Feature and its image policy atomically

- Tracing bulk publication reached a database gap: updateFeaturePublishedStateById
  committed the Feature row before calling the separate image-policy batch. A failing
  image write therefore returned an error while leaving the Feature published with
  changed attribution. A disposable SQLite regression reproduced the partial commit
  (`/tmp/hype-feature-publication-red.log`).
- Publishing now batches the Feature update and prepared image
  classification/publication statements together. Unpublishing retains its existing
  single-statement behavior. Updated the authorization design to include this
  single-Feature atomicity guarantee.
- Verification: Feature publication transaction, ancestor publication transaction and
  Feature remote suites passed **3 files / 53 tests**
  (`/tmp/hype-feature-publication-tests.log`). The new regression checks complete
  Feature rollback, retained image classification/publication after failure, and
  successful attribution. Scoped whitespace validation passed.
- Boundary: real generated SQL against a disposable SQLite adapter modeling D1 batch
  rollback; no live D1 operation. The separately observed bulk UI field-patching
  behavior remains under review. No application database mutation, external request,
  commit or deployment occurred; broader audit remains active.
- Workspace typecheck remains non-green: **1 error / 19 warnings**
  (`/tmp/hype-feature-publication-check.log`), solely the concurrently changed
  messaging/media-cache.ts optional-scope assignment. No diagnostic was reported for
  this publication change; the messaging file was left intact.

## 2026-11-04 — Verify Feature publication edge contracts

- Expanded disposable-SQLite coverage for the new atomic Feature publication path:
  parent-write failure, missing Feature identity, and unpublishing. Missing identities
  return undefined without touching existing rows; unpublishing clears attribution while
  retaining the existing independent image-state behavior. Parent and image failures
  both preserve the prior Feature and image state.
- Feature publication contracts, image-policy tests and ancestor publication transaction
  suites passed **3 files / 30 tests**
  (`/tmp/hype-feature-publication-contract-tests.log`). Scoped whitespace validation
  passed. No additional implementation change was needed.
- This closes those transaction regression gaps, not the broader audit. The previous
  workspace check still had a messaging media-cache diagnostic; no new typecheck result
  is claimed here. No application database mutation, live storage operation, external
  request, commit or deployment occurred.

## 2026-11-04 — Patch bulk rows with persisted state and revisions

- The admin bulk completion path discarded returned database values and patched only the
  requested boolean. That left publication attribution and modifiedAt stale, and could
  overwrite a newer refreshed state with an older request's intent.
- Added a shared row merger for both normal and remote-search collections. It uses
  returned state/revision/attribution fields, preserves hydrated content, skips known
  newer rows, and clears publisher display data when its ID no longer matches persisted
  attribution. Failed and unrelated rows retain identity.
- Bulk row-merging, chunk-lifecycle and Feature remote suites passed **3 files / 38
  tests** (`/tmp/hype-bulk-row-state-tests.log`), covering server values,
  hydrated-content retention, stale publisher removal and newer/failed/unrelated row
  preservation. Scoped whitespace validation passed.
- Boundary: source-traced old behavior and helper regressions; no mounted admin-index or
  authenticated-browser check. Command results do not hydrate a new publisher relation;
  refresh remains responsible for its details. No application database mutation,
  external request, commit or deployment occurred; broader audit remains active.
- Final typecheck passed with **0 errors / 19 existing warnings**
  (`/tmp/hype-bulk-row-state-check.log`). The first check caught an overly narrow
  full-Feature input type; the helper now accepts both collection and detail row shapes
  while retaining their types. The concurrent messaging diagnostic also disappeared
  without edits to that file in this work.

## 2026-11-04 — Refresh admin Feature continuation pages

- Admin first-page loading used refreshRemoteQuery, but loadMoreFeatures directly
  awaited the native handle. A retained-query regression reproduced no refresh and the
  obsolete continuation payload being available for append
  (`/tmp/hype-admin-page-freshness-red.log`).
- Continuation reads now use the same refresh helper as the first page. Existing
  scope/generation checks still run after the refreshed response. A denied refresh
  records the pagination error and ends loading without appending retained values.
- Admin pagination and navigation suites passed **2 files / 27 tests**
  (`/tmp/hype-admin-page-freshness-tests.log`), including current payload consumption
  and denied refresh without stale fallback. Scoped whitespace validation passed.
- Inspection also confirmed setSortedResourceState rebuilds Feature lookup and division
  state after list replacement; no defect established in that path. Boundary: real
  contexts with mocked native query handles, not authenticated-browser or live
  permission-revocation evidence. No application database mutation, external request,
  commit or deployment occurred; broader audit remains active.
- Workspace typecheck reported **1 error / 19 warnings**
  (`/tmp/hype-admin-page-freshness-check.log`): the concurrently changed
  messaging-media-picker.test.ts uses unsupported `exact` in ByRoleOptions. No
  diagnostics were reported for the continuation change; the messaging test was left
  intact.

## 2026-11-04 — Refresh navigation reads and reject stalled continuation

- Both ID-only and filtered-card navigation reads directly awaited retained native
  handles. Regressions reproduced missing refresh calls in both paths. A separate
  malformed-continuation regression reproduced issuing another read with a non-advancing
  offset (`/tmp/hype-admin-navigation-freshness-red.log`).
- Navigation now refreshes each queried page before choosing neighbours and rejects a
  non-advancing continuation before retaining that page or issuing another request.
  Existing live-scope checks remain after each read.
- Pagination/navigation suites passed **2 files / 30 tests**
  (`/tmp/hype-admin-navigation-freshness-tests.log`). The card fixture uses a title
  meeting the existing greater-than-one-character filter. Scoped whitespace validation
  passed.
- Workspace typecheck reports **1 error / 19 warnings**
  (`/tmp/hype-admin-navigation-freshness-check.log`), solely unsupported `exact` in the
  concurrently changed messaging-media-picker test. No diagnostic was reported for this
  change, and that messaging file was left intact.
- Boundary: real contexts and filters with simulated native query handles; retained
  complete navigation snapshots keep their existing lifetime. No live account, database,
  storage, commit or deployment operation occurred; broader audit remains active.

## 2026-11-04 — Reject stalled admin continuation before cache writes

- The main admin Load more path accepted unchanged/backward continuation offsets and
  empty pages claiming more data. Three regressions reproduced the absence of a
  pagination error (`/tmp/hype-admin-page-progress-red.log`). Unlike the navigation
  loop, repeated reads here would be driven by the existing infinite-scroll caller.
- Validate continuation progress before publishing rows or cache entries. Invalid pages
  retain the last valid cursor, set the existing pagination error and release loading.
  Retrying uses that cursor and clears the error on success.
- Pagination/navigation suites passed **2 files / 33 tests**
  (`/tmp/hype-admin-page-progress-tests.log`), including all three malformed
  continuation shapes, cache/row preservation and successful retry. Scoped whitespace
  validation passed.
- Boundary: real admin contexts with mocked remote pages; no live infinite-scroll or
  browser verification. No application database mutation, external request, commit or
  deployment occurred; broader audit remains active.
- Workspace typecheck passed with **0 errors / 19 existing warnings**
  (`/tmp/hype-admin-page-progress-check.log`). The concurrent messaging test diagnostic
  is no longer present; that test was not edited by this work.

## 2026-11-04 — Review remaining query-side writes

- Inventoried exported remote query declarations and inspected mutation-like calls in
  their handlers. This is a call-site audit aid, not proof that every transitive
  dependency is read-only.
- The messaging inbox query intentionally synchronizes provider snapshots. Inspected its
  conditional external-identity claim, per-message transactional projection,
  source-sequence conflict predicate and monotonic replay cursor. Existing integration
  tests explicitly replay older snapshots, inject projection failure and race
  conflicting initial identities. These synchronization writes differ from the removed
  cached bulk-edit mutation; no new defect established in the inspected paths.
- Theme preference reads use an account identity check and a separate save command;
  analytics handlers authorize scope before requesting remote summaries. No
  implementation changes made during the running full suite.
- Full-suite verification remains pending on its original process. Browser host
  availability and durable image cleanup remain separate unresolved evidence/design
  boundaries; broader audit stays active.
- Full-suite result: **487 files / 4,691 tests passed** in 152.51 seconds
  (`/tmp/hype-admin-publication-audit-full-tests.log`, original process exit 0). This
  verifies the accumulated publication, bulk-edit and pagination changes alongside the
  current suite; it does not substitute for unavailable browser checks or unresolved
  storage recovery design.

## 2026-11-04 — Refresh admin search and complete-selection queries

- Source inspection found three remaining direct native reads in AdminFeatureIndex:
  initial text search, search continuation, and Select all page collection. All now use
  refreshRemoteQuery, matching the context-level index/navigation paths. Search
  continuation also rejects a non-advancing offset before replacing matches or cursor
  state.
- Bulk selection composition tests verify current native payload consumption and
  rejection without stale fallback when refresh is denied. Bulk-selection, admin
  pagination and navigation suites passed **3 files / 39 tests**
  (`/tmp/hype-admin-search-freshness-tests.log`); scoped whitespace validation passed.
- Boundary: component call-site wiring and search-continuation guard are source/type
  checked, not exercised through a mounted admin search UI. Service/context regressions
  do not substitute for that missing browser evidence. No application database mutation,
  external request, commit or deployment occurred; broader audit remains active.
- Workspace typecheck reported **1 error / 19 warnings**
  (`/tmp/hype-admin-search-freshness-check.log`): the concurrently changed
  messaging/sticker-player.ts could not resolve `$app/environment`. No diagnostic was
  reported for the admin-search change. That messaging file was not edited by this work.

## 2026-11-04 — Correct the sticker loader's framework environment import

- Rechecking the workspace reproduced sticker-player.ts importing unavailable
  `$app/environment`; the checkout's other browser guards use `$app/env`. Corrected that
  single import while preserving the loader's existing lazy server boundary and client
  initialization.
- The media-picker suite then reached Lottie's canvas-dependent module initialization,
  unsupported by jsdom. Its interaction fixture now mocks the sticker-player module; it
  does not claim to test animation rendering. Sticker/media-picker suites passed **2
  files / 9 tests** (`/tmp/hype-sticker-env-tests.log`). Workspace typecheck passed with
  **0 errors / 19 existing warnings** (`/tmp/hype-sticker-env-check.log`); scoped
  whitespace validation passed.
- Reviewed admin search unmount handling: effect cleanup advances the request identity
  used by both initial and continuation response guards; no additional implementation
  defect established there. Browser inventory retry still returned no surfaces and
  `The browser access host is unavailable`.
- Boundary: animation rendering and authenticated admin interactions remain unverified.
  No live database/storage operation, external message, commit or deployment occurred;
  broader audit remains active.

## 2026-11-04 — Fence image publication after a skipped Feature update

- A disposable SQLite trigger using RAISE(IGNORE) reproduced an already-published
  Feature whose parent update returned no row while its image classification/publication
  still committed (`/tmp/hype-feature-publication-skipped-red.log`). The caller saw no
  updated Feature despite the image side effect.
- The publication batch now uses the shared revision-batch assertion mechanism: check
  parent existence, update it, assert changes() = 1 immediately, then apply image
  policy. Missing/skipped parent writes return undefined with no image mutation; real
  write errors still propagate. Unpublish retains its single-statement behavior. Updated
  the authorization design accordingly.
- Feature publication, ancestor publication and Feature remote suites passed **3 files /
  57 tests** (`/tmp/hype-feature-publication-skipped-tests.log`). Scoped whitespace
  validation passed.
- Boundary: injected SQLite skip behavior and real generated SQL, not a production
  trigger or D1 incident. No application database mutation, external request, commit or
  deployment occurred; broader audit remains active.
- Typecheck passed with **0 errors / 19 existing warnings**
  (`/tmp/hype-feature-publication-skipped-check.log`).

## 2026-11-04 — Fence descendant publication after skipped parent updates

- Six disposable SQLite regressions reproduced organisation, project and layer updates
  returning null while descendants changed after a RAISE(IGNORE) trigger skipped the
  parent write, for both publish and unpublish
  (`/tmp/hype-parent-publication-skipped-red.log`: 6 failed / 18 passed).
- Each parent command now checks existence inside the batch, updates the parent, then
  asserts changes() = 1 before descendant snapshots and image policy writes. A
  missing/skipped parent returns null without descendant changes; other database errors
  still propagate. Updated the authorization design guarantee.
- Focused publication and Feature remote suites passed **3 files / 63 tests**
  (`/tmp/hype-parent-publication-skipped-tests.log`). Typecheck passed with **0 errors /
  19 existing warnings** (`/tmp/hype-parent-publication-skipped-check.log`); scoped
  whitespace validation passed.
- Boundary: generated SQL exercised through disposable SQLite, not live D1. No live
  database/storage operation, external message, commit or deployment occurred. Browser
  evidence and durable storage cleanup remain unresolved; broader audit remains active.
- Full suite completed with **485 files passed / 2 failed; 4,696 tests passed / 5
  failed** (`/tmp/hype-parent-publication-full-tests.log`). Four admin search-effect
  tests lacked the refreshRemoteQuery dependency in their source-extraction harness
  after the earlier search freshness fix. Injected the real helper into that harness;
  search and messaging media-picker rerun passed **2 files / 12 tests**
  (`/tmp/hype-parent-publication-followup-tests.log`). The messaging send-count timeout
  did not reproduce without changes; its full-suite cause remains unresolved. No claim
  of a clean full-suite run after the harness correction.

## 2026-11-04 — Reject empty admin continuation pages that claim more rows

- Inspected the Feature database pagination contract: hasMore is derived from an extra
  fetched row, and continuation offsets advance by returned row count. An empty
  continuation claiming more data is therefore malformed even if it supplies a larger
  offset.
- Reproduced search and ordinary admin pagination accepting that malformed continuation
  and advancing their retry cursor (`/tmp/hype-search-page-progress-red.log`,
  `/tmp/hype-empty-page-progress-red.log`). Both now reject it before row/cache/cursor
  mutation, retain existing results, release loading and allow retry from the last valid
  offset.
- Expanded the actual search-effect extraction harness with unchanged/backward/empty
  continuation and retry cases, plus native query-handle refresh coverage for initial
  and continuation pages. Search, pagination and navigation suites passed **3 files / 42
  tests** (`/tmp/hype-empty-page-progress-tests.log`); scoped whitespace checks passed.
- Reviewed parent publication remote handlers: all three require a non-null persisted
  result after authorization, so skipped service writes do not produce a successful
  remote response. No additional permission defect established in that inspection.
- Boundary: search effects execute with Svelte reactivity outside the full admin shell;
  this does not replace mounted/browser verification. Broader DB/permission/reactivity
  audit remains active.
- Typecheck passed with **0 errors / 19 existing warnings**
  (`/tmp/hype-empty-page-progress-check.log`). Full suite completed with **485 files
  passed / 2 failed; 4,659 tests passed / 47 failed**
  (`/tmp/hype-empty-page-progress-full-tests.log`). All failures reported missing
  ResizeObserver in the messaging suites. Current test files already contained observer
  stubs when inspected after completion; no messaging edits were made by this pass.
- Reran those current messaging suites: **38 passed / 9 failed**
  (`/tmp/hype-empty-page-messaging-recheck.log`), now failing to find attachment menu
  items (GIFs, Stickers, Photo or video). This is unresolved concurrent UI/test work,
  not a clean full-suite result. The focused admin suites passed independently; no live
  database/storage operations, commits or deployments occurred.

## 2026-11-04 — Recheck authorized ancestry inside parent publication transactions

- Organisation, project and layer publication authorized a command probe, then persisted
  by ID alone. Nine disposable SQLite regressions reproduced publishing/unpublishing
  after the authorized resource or ancestor scope changed
  (`/tmp/hype-publication-scope-red.log`: 9 failed / 24 passed).
- Publication services now require the expected scope captured by the remote
  authorization probe and recheck it inside the guarded D1 batch before any writes.
  Organisation checks hub identity, project checks organisation plus hub, and layer
  checks its project/organisation plus the project's actual organisation and hub. Null
  hub identities use SQLite IS comparison. A changed/missing scope returns null without
  modifying publication, attribution, descendants or images; remote handlers already
  reject null results.
- Extended regressions cover moves within the same hub, ancestor hub moves, unchanged
  null hubs and assignment after a null-hub probe. Remote tests assert forwarding the
  probed hub scope. Publication service and three parent remote suites passed **4 files
  / 133 tests** (`/tmp/hype-publication-scope-tests.log`); scoped whitespace validation
  passed. Updated the authorization design guarantee.
- Boundary: generated SQL through disposable SQLite and mocked remote authorization
  context. Role grants are not re-read inside these transactions. No live
  database/storage actions, external messages, commits or deployments occurred; broader
  audit remains active.
- First typecheck found one implicit-any pointer event in concurrently changed
  MessageBubble.svelte (`/tmp/hype-publication-scope-check.log`). Added only the
  PointerEvent annotation to that callback; runtime behavior is unchanged. Final
  typecheck passed with **0 errors / 19 existing warnings**
  (`/tmp/hype-publication-scope-final-check.log`).
- Follow-up source inspection identifies single-Feature publication (including its
  bulk-command route) as another ID-only write after a scope probe; this still needs
  equivalent scope-race regression coverage and correction. No broad
  permission-completion claim is made.

## 2026-11-04 — Preserve authorized scope for direct and bulk Feature publication

- Fourteen disposable SQLite regressions reproduced Feature publish/unpublish succeeding
  after the Feature's layer/project/organisation, an ancestor parent link, or hub
  identity changed (`/tmp/hype-feature-publication-scope-red.log`: 14 failed / 6
  passed).
- Both direct and bulk publication handlers now pass the persisted authorization probe
  to the database service. The service requires that scope and checks Feature IDs,
  layer/project ancestry and nullable hub identity inside the revision-guarded batch for
  both publish and unpublish. Missing, moved, inconsistent or skipped targets return
  undefined without changing Feature or image state; image policy runs only for publish.
- Added same-hub move, null-hub success/assignment rejection and remote scope-forwarding
  coverage. Feature/ancestor publication and Feature remote suites passed **3 files / 97
  tests** (`/tmp/hype-feature-publication-scope-tests.log`); scoped whitespace
  validation passed. Updated the authorization design guarantee.
- Boundary: real generated SQL in disposable SQLite plus mocked remote context, not live
  D1. Existing role grants are not re-read inside the transaction. No live
  database/storage mutation, external message, commit or deployment occurred; broader
  audit remains active.
- Typecheck passed with **0 errors / 19 existing warnings**
  (`/tmp/hype-feature-publication-scope-check.log`). Follow-up inspection found
  standalone publishFeatureImages still passes only the Feature ID into its image write
  after probing authorization; that separate route remains to be guarded and verified.
  Archive command scope/transaction behavior also remains outside this fix.

## 2026-11-04 — Guard standalone Feature image publication against scope changes

- Seven disposable SQLite regressions reproduced image publication after a
  Feature/ancestor move or Feature deletion
  (`/tmp/hype-image-publication-scope-red.log`: 7 failed / 7 passed). The remote command
  authorized a probe but its database service accepted only the Feature ID and actor.
- Extracted the existing Feature publication ancestry predicate into
  featureCommandScope.ts and reused it for both Feature state publication and explicit
  image publication. The latter now requires the authorized probe and checks it in the
  same D1 batch as the image write. Missing or changed scope returns false; the remote
  maps that to 409 STALE_FEATURE_PUBLICATION_SCOPE rather than reporting success.
- Image eligibility is unchanged: direct non-research assignments with active source
  images can be explicitly published regardless of project automation settings. Valid
  no-op retries succeed without rewriting attribution; actual database errors propagate.
  Scope checks do not re-read role grants or assert publication state.
- Image publication, Feature publication and Feature remote suites passed **3 files / 73
  tests** (`/tmp/hype-image-publication-scope-tests.log`), covering stale scope
  preservation, remote conflict, successful/repeated publication, and injected write
  failure. Updated the authorization design; scoped whitespace validation passed.
- Boundary: generated SQL in disposable SQLite and mocked remote context, not live D1 or
  browser evidence. No live database/storage operation, external message, commit or
  deployment occurred. Archive command scope/transaction checks and the broader audit
  remain open.
- Typecheck passed with **0 errors / 19 existing warnings**
  (`/tmp/hype-image-publication-scope-check.log`). Full suite passed **487 files / 4,755
  tests** in 156.67 seconds (`/tmp/hype-publication-scope-full-tests.log`, original
  process exit 0), covering the accumulated publication scope changes and current
  messaging worktree. This does not replace browser verification or establish completion
  of the remaining audit.
- Archive follow-up inspection: organisation and layer remote handlers still execute
  parent state changes separately from descendant cascades; project archive batches both
  but lacks scope and skipped-parent assertions. These are the next transaction/scope
  regression targets; not yet fixed by this publication change.

## 2026-11-04 — Make hierarchy archive commands atomic and scope-bound

- New archive service regressions initially produced **22 failures / 11 passes**
  (`/tmp/hype-archive-transaction-red.log`). Organisation/layer parent services did not
  own descendant writes, while project batching lacked parent-scope and skipped-write
  guards. Remote organisation/layer handlers performed their cascades separately,
  allowing parent state to survive a later failure.
- All three parent archive services now commit parent and descendant snapshots in one
  revision-guarded batch. They share their publication command's ancestry predicate,
  require exactly one affected parent row before descendants, and return null for
  missing/moved/skipped parents. Organisation/layer remote handlers no longer execute a
  second cascade. Standalone cascade helpers now batch their descendant statements.
  Existing restoration SQL, local snapshots and archived-ancestor behavior are retained.
- Feature archive/unarchive had the same ID-only scope race in direct and bulk paths.
  Twelve regressions reproduced moved-scope writes
  (`/tmp/hype-feature-archive-scope-red.log`: 12 failed / 28 passed). Its single UPDATE
  now includes the shared Feature ancestry predicate, and both remote paths forward the
  authorized probe. The bulk super-admin requirement remains unchanged.
- Archive, publication/restoration and four resource remote suites passed **9 files /
  258 tests** (`/tmp/hype-archive-scope-tests.log`), including success, repeated
  archive/restoration, descendant failure rollback, skipped/missing parents, same-hub
  moves and ancestor hub changes. Updated the authorization design and corrected
  misplaced layer-publication JSDoc. Scoped whitespace validation passed.
- Verification interruption: an initial Feature test run could not import generated
  Paraglide messages; framework sync restored them before the recorded red regression
  run. Initial typecheck found a separate nullable senderName fallback in the concurrent
  WhatsApp optimistic quote preview. Changed only that absent optional value from null
  to undefined; messaging console tests passed **1 file / 43 tests**
  (`/tmp/hype-archive-messaging-tests.log`).
- Boundary: disposable SQLite and mocked remote authorization, not live D1 or browser
  interaction. Transactions preserve the authorized ancestry but do not re-read role
  grants. No live database/storage operation, external message, commit or deployment
  occurred; broader audit remains active.
- Final workspace typecheck passed with **0 errors / 19 existing warnings**
  (`/tmp/hype-archive-scope-final-check.log`). The last full-suite pass predates these
  archive changes; this pass used the focused archive/publication/remote and messaging
  suites above, not a new full-suite claim.

## 2026-11-04 — Restore Feature archive snapshots before historical-layer routing (Refs #194)

- Historical-layer inspection found no ordinary application path converting an existing
  source to a managed derivative. The concrete reachable case is the migration's
  source-restoration trigger: enabling historical layers while a source is archived
  defers derivative creation until unarchive.
- A regression using the real 0147_historical_layers.sql triggers reproduced a source
  unarchive routing intangible Features into history:l before the descendant UPDATE.
  Previously active Features remained archived and retained stale localIsArchived
  snapshots (`/tmp/hype-archive-historical-routing-red.log`: 1 failed / 33 passed).
- Layer archive transactions now apply descendant archive snapshots before the parent
  update can trigger routing. The parent write count is still asserted before commit, so
  missing/skipped/failed parent writes roll back all preceding changes. Updated result
  extraction for the new statement order; organisation/project ordering is unchanged.
- Tests verify both recursive-trigger settings, retain individually archived Features,
  and inject historical-child creation failure after descendant restoration to prove
  complete rollback. Focused archive/publication/layer-remote/visibility suites passed
  **6 files / 117 tests** (`/tmp/hype-archive-historical-routing-tests.log`). Existing
  migration tests passed **6 tests** (`/tmp/hype-historical-layer-migration-tests.log`).
  Updated the authorization design and the historical-layer section in
  spec/breadline/proposal/01-places-features.md.
- Boundary: real migration triggers in disposable SQLite, not live D1. No live
  database/storage action, external message, commit or deployment occurred; broader
  audit remains active.
- Initial typecheck reported two errors in concurrently added messaging tests
  (`/tmp/hype-archive-historical-routing-check.log`): an organisation-role fixture
  omitted required userId, and getByRole received unsupported exact. Supplied the
  current fixture actor ID and removed the unsupported option (string name matching
  remains exact). Messaging integration/console suites passed **2 files / 100 tests**
  (`/tmp/hype-historical-messaging-tests.log`).
- Final typecheck passed with **0 errors / 19 existing warnings**
  (`/tmp/hype-archive-historical-routing-final-check.log`); scoped whitespace checks
  passed. No new full-suite or browser-completion claim is made.

## 2026-11-04 — Prevent project publication from overwriting concurrent license history

- Project publication built its next license/history from the command probe, then wrote
  that object without checking whether the stored license changed. Two regressions
  reproduced successful publication against stale attribution or a concurrently appended
  history entry (`/tmp/hype-project-license-publication-red.log`: 2 failed / 40 passed).
- License replacements now require their original snapshot in the service type contract.
  The guarded publication transaction compares normalized JSON before any
  parent/descendant/image write. A mismatch returns null and the remote reports 409
  STALE_PROJECT_PUBLICATION. The initial missing-project probe still reports not found;
  unpublish omits license replacement entirely.
- Tests verify stale-snapshot preservation of all tables, successful publication against
  unchanged compact/formatted JSON, forwarding the original probe, conflict response and
  unpublish omission. Publication, project remote and archive suites passed **3 files /
  123 tests** (`/tmp/hype-project-license-publication-tests.log`); scoped whitespace
  validation passed. Updated the authorization design guarantee.
- Boundary: disposable SQLite and mocked remote context, not live D1. This guards
  license replacement, not every other probed field or role grant. No live
  database/storage operation, external message, commit or deployment occurred; broader
  audit remains active.
- Final typecheck passed with **0 errors / 19 existing warnings**
  (`/tmp/hype-project-license-publication-final-check.log`). The initial typecheck
  caught TypeScript losing the relationship between optional license fields in a
  conditional spread; an explicit undefined branch preserves the paired contract, and
  focused tests were rerun successfully.
- Full suite passed **488 files / 4,822 tests** in 139.02 seconds
  (`/tmp/hype-archive-license-audit-full-tests.log`, original process exit 0), covering
  the accumulated archive, historical-trigger ordering and publication-license fixes.
  Browser verification and the broader storage/recovery audit remain separate open
  boundaries.

## 2026-11-04 — Settle resource toggles from committed write acknowledgements

- Layer and organisation toggle handlers performed detail reads and dependent
  reconciliation inside the write-failure catch. Six actual-handler regressions
  reproduced editor erasure after an empty read, failure feedback after a committed
  write, and a late completion replacing another route
  (`/tmp/hype-resource-toggle-settlement-red.log`: 6 failed / 2 passed).
- Both handlers now settle their field from the write acknowledgement using the current
  matching record, guarded by captured resource reference and authorization scope.
  Removed the redundant post-write detail read; native updates still request the detail
  query. Dependent reconciliation has a separate error boundary, preserving the
  committed outcome and avoiding a second failed settlement. Genuine write failures
  retain the editor and reject optimism.
- Extending the same harness to Project reproduced the acknowledgement replacing fresher
  relation data with its pre-write snapshot
  (`/tmp/hype-project-toggle-freshness-red.log`: 1 failed / 17 passed). Project now also
  merges the acknowledgement into the current matching record, preserving
  relation/license data delivered by native refreshes.
- Route-handler, shared detail refresh/reactivity and guarded remote suites passed **4
  files / 54 tests** (`/tmp/hype-resource-toggle-settlement-tests.log`), covering
  publication/archive acknowledgement, no redundant detail request, reconciliation
  failure, write rejection, fresh relation preservation and late navigation. Scoped
  whitespace validation passed.
- Boundary: tests execute the actual extracted route functions with controlled
  dependencies, not mounted editor components. Browser inventory returned no surfaces
  and `The browser access host is unavailable`; this does not establish absence of an
  authenticated session. No live database/storage action, external message, commit or
  deployment occurred; broader audit remains active.
- Final workspace typecheck reported **12 errors / 19 warnings**
  (`/tmp/hype-resource-toggle-settlement-final-check.log`). All errors are in the
  concurrently added, untracked src/tests/fixtures/conversationControlsCheck.js browser
  harness (absolute import resolution, window property and missing JS
  parameter/collection types). No diagnostic was reported for the changed route handlers
  or regression harness. That concurrent browser fixture was not modified; this is not a
  clean workspace typecheck or full-suite claim.

## 2026-11-04 — Bind editor toggle feedback to route lifecycle

- Late publication/archive completions could reset shared busy flags or show feedback
  after navigation or unmount. Twelve lifecycle regressions reproduced the stale effects
  (`/tmp/hype-resource-toggle-lifecycle-red.log`: 12 failed / 18 passed).
- The shared editor controller now exposes revision-based route ownership. Layer,
  organisation and project toggles settle their shared mutation ledger but gate local
  state, feedback and busy resets on current route ownership, resource reference and
  scope. New route loads reset busy state; layer/organisation load effects explicitly
  track identity and scope without tracking incidental loader reads.
- Committed writes still reconcile the captured cache after navigation or unmount. An
  account-generation change skips that reconciliation, preventing an old completion from
  starting reads for the replacement account.
- Tests execute actual route-handler source with the real controller lifecycle and
  controlled remote/cache dependencies. Focused lifecycle, form, detail
  refresh/reactivity and optimism suites passed **5 files / 69 tests** after correcting
  two mock-component return types
  (`/tmp/hype-resource-toggle-lifecycle-final-tests.log`). Scoped whitespace checks
  passed.
- Boundary: source-extracted handlers, not mounted editors or authenticated browser
  verification. No live database/storage operation, external message, commit or
  deployment occurred. Broader audit remains active.
- Final workspace typecheck passed with **0 errors / 19 warnings**
  (`/tmp/hype-resource-toggle-lifecycle-corrected-check.log`). Earlier runs captured
  errors in the concurrent messaging browser fixture as well as the two corrected test
  mocks; those fixture diagnostics are absent in this completed run. No new full-suite
  claim is made.

## 2026-11-04 — Preserve Hub editor state after toggle acknowledgement

- Hub toggles still performed an extra detail read after a committed write and
  unconditionally committed it, showed feedback and reset shared header busy state. Five
  regressions reproduced editor erasure from an empty read and late effects after
  navigation/unmount (`/tmp/hype-hub-toggle-red.log`: 5 failed).
- Hub now merges the write acknowledgement into the current matching record, preserving
  fresh relations and avoiding the redundant read. Route ownership, reference and
  authorization scope guard local settlement, feedback and busy reset. Route loading
  explicitly tracks identity/scope, resets busy state and runs incidental loader reads
  untracked.
- Added actual-handler coverage for fresh relation preservation, current-route write
  rejection and late success/failure after navigation, unmount or scope changes. Hub,
  hierarchy toggle and shared form suites passed **3 files / 47 tests**
  (`/tmp/hype-hub-toggle-tests.log`); scoped whitespace checks passed.
- Boundary: controlled source-extracted handler tests, not mounted editor verification.
  Native command updates still refresh Hub detail/list queries. Feature
  toggle/image-prompt lifecycle remains a separate audit target. No commit, deployment,
  external message or live database/storage action occurred; broader audit remains
  active.
- Final workspace typecheck passed with **0 errors / 19 warnings**
  (`/tmp/hype-hub-toggle-check.log`). No new full-suite claim is made.

## 2026-11-04 — Guard Feature toggle and bulk-image action settlement

- Feature publication/archive still committed an extra detail fetch and emitted feedback
  after navigation, scope change or unmount. Eight actual-handler regressions failed
  before the toggle fix (`/tmp/hype-feature-toggle-red.log`).
- Added action revision ownership independent of form hydration, covering the newly
  created Feature route that intentionally skips form reload. Route/scope transitions
  clear busy flags and publication prompts; incidental header reads are untracked. Late
  command completions settle the shared optimistic ledger without changing obsolete
  editor state, prompts or feedback.
- Feature toggles merge the acknowledgement and the native detail result already
  requested by command updates, including publication image-policy changes, without a
  second detail read.
- Bulk image publication uses the same lifecycle guard and native refreshed detail.
  Failed writes undo only an owned optimistic gallery, preserving unrelated current
  fields and newer editor snapshots. Ownership compares the retained Svelte proxy after
  assignment, not the raw input object.
- Focused Feature, Hub and hierarchy toggle suites passed **3 files / 58 tests**
  (`/tmp/hype-feature-toggle-tests.log`); scoped whitespace checks passed. Coverage
  includes native gallery results, missing detail retention, current rollback, newer
  snapshot preservation and late success/failure after navigation, unmount and scope
  changes.
- Boundary: source-extracted handlers and lifecycle callbacks with controlled
  dependencies, not mounted Feature editor/browser proof. No live database/storage
  action, external message, commit or deployment occurred. Broader audit remains active.
- Workspace typecheck reported **2 errors / 19 warnings**
  (`/tmp/hype-feature-toggle-check.log`): concurrent messaging.remote.ts references an
  unresolved projectMessagingArchive helper, and messaging.integration.test.ts omits the
  newly required archiveCursor field. No diagnostics were reported for the changed
  Feature route or regression harness. Concurrent messaging files were left untouched;
  this is not a clean workspace typecheck or new full-suite claim.

## 2026-11-04 — Verify Feature actions with Svelte runtime and restore retained optimistic galleries

- Replaced the Feature handler harness's simulated lifecycle with compiled Svelte
  state/effects under jsdom. The actual extracted action effect, cleanup and handlers
  now execute against real reactive proxies; the initial 17 cases passed
  (`/tmp/hype-feature-toggle-reactive-tests.log`). This is runtime reactivity coverage,
  not the complete mounted editor shell.
- A stronger rejection assertion reproduced relation-only record replacement retaining
  the optimistic gallery after a failed image write
  (`/tmp/hype-feature-gallery-rollback-red.log`: 1 failed / 16 passed). Whole-record
  ownership was too coarse: the new record still held the action's gallery fields.
- Rollback now compares retained cover/gallery field references, restoring owned fields
  while retaining newer relation data and replacement galleries. Added coverage for
  replacement gallery preservation and in-place relation edits. Focused
  Feature/Hub/hierarchy toggle, optimism and detail reactivity suites passed **5 files /
  81 tests** (`/tmp/hype-feature-gallery-final-tests.log`); scoped whitespace checks
  passed.
- Browser inventory again returned no surfaces and
  `The browser access host is unavailable`; this does not establish absence of an
  authenticated session. No live database/storage operation, external message, commit or
  deployment occurred. Broader audit and full mounted editor verification remain open.
- Workspace typecheck again reported **2 errors / 19 warnings**
  (`/tmp/hype-feature-gallery-check.log`), limited to the unresolved
  projectMessagingArchive reference and missing archiveCursor fixture field in
  concurrent messaging work. No diagnostics were reported for this change; those files
  remain untouched.

## 2026-11-04 — Roll back only image publication fields

- Real Svelte runtime coverage reproduced gallery rollback deleting an image added
  during the pending command and discarding an edited caption
  (`/tmp/hype-feature-image-fields-red.log`: 1 failed / 19 passed). Restoring an entire
  retained gallery remained too broad even when its reference was owned.
- Bulk publication now captures the previous publication flag for each changed assigned
  image proxy. Failure projects only those flags back into current cover/gallery
  envelopes, preserving membership, metadata and replacement images. This supersedes the
  whole-gallery field restoration described above.
- All **20 Feature runtime tests passed** (`/tmp/hype-feature-image-fields-tests.log`);
  scoped whitespace checks passed. No live database/storage operation, external message,
  commit or deployment occurred. Full mounted editor/browser verification remains open.
- Workspace typecheck reported **2 errors / 19 warnings**
  (`/tmp/hype-feature-image-fields-check.log`), still limited to the concurrent
  messaging projectMessagingArchive reference and archiveCursor fixture field. No
  diagnostics were reported for the changed route or tests. Started the full Vitest
  suite to validate the accumulated editor lifecycle changes; completion is not yet
  claimed.
- Full Vitest completed in 178.81 seconds with **490 files passed / 1 failed; 4,890
  tests passed / 2 failed** (`/tmp/hype-editor-lifecycle-full-tests.log`, exit 1). Both
  failures are in concurrent messaging-inbox-model.test.ts: an archived WhatsApp thread
  remains in the visible inbox, and an old refresh leaves a row after archive. All other
  suites, including the accumulated editor lifecycle/rollback checks, passed. Concurrent
  messaging implementation/tests were not modified; the workspace suite is not green.

## 2026-11-04 — Honor superseded detail refresh results at the consumer boundary

- Same-scope reconciliation removes the retained detail entry without advancing the
  account epoch. CacheCtx correctly returned undefined for the superseded operation, but
  ResourceDetail.load ignored that result and returned its old query data. Two
  regressions reproduced this after both successful and denied obsolete requests
  (`/tmp/hype-detail-supersession-red.log`: 2 failed).
- ResourceDetail now honors the undefined result and detaches the obsolete query only
  when that load still owns the consumer generation. A newer load's replacement query is
  preserved when the old request finishes later. The next load reacquires the current
  retained detail normally.
- Actual cache/client tests cover late success and denial, clearing exposed obsolete
  data, recovery, and preserving a replacement loaded before the old request settles.
  Focused detail refresh/reactivity and optimism suites passed **3 files / 33 tests**
  (`/tmp/hype-detail-supersession-tests.log`); scoped whitespace checks passed.
- Boundary: runtime cache/client coverage, not mounted admin/browser proof. No live
  database/storage action, external message, commit or deployment occurred; broader
  audit remains active.
- Final workspace typecheck passed with **0 errors / 19 warnings**
  (`/tmp/hype-detail-supersession-check.log`). Concurrent messaging diagnostics from
  earlier checks are absent in this run; no new full-suite claim is made.

## 2026-11-04 — Ignore obsolete detail-load failures

- ResourceDetail guarded successful completion by load generation, identity and account
  epoch, but its catch still rejected obsolete requests and could store an old scope's
  error. Three regressions reproduced failures after release, scope change and a
  replacement load (`/tmp/hype-detail-errors-red.log`: 3 failed).
- Rejected reads now use the same ownership checks before setting consumer error state
  or throwing. Obsolete requests resolve without data; current requests still expose
  their failure and hide denied data. Shared transport/cache error handling remains
  unchanged for other consumers.
- Detail refresh/reactivity and optimism suites passed **3 files / 37 tests**
  (`/tmp/hype-detail-errors-tests.log`), including current denial, late failures,
  loading cleanup and replacement-data preservation. Scoped whitespace checks passed.
- Boundary: runtime cache/client tests, not mounted editor/browser proof. No live
  database/storage operation, external message, commit or deployment occurred; broader
  audit remains active.
- Workspace typecheck passed with **0 errors / 19 warnings**
  (`/tmp/hype-detail-errors-check.log`). No new full-suite claim is made.

## 2026-11-04 — Keep active details pinned during reload

- ResourceDetail.load released its existing retention handle before reacquiring the same
  identity. With 128 inactive details retained, the active query briefly became the
  oldest inactive entry and was evicted, causing an unnecessary factory invocation and
  refresh. A runtime regression reproduced the duplicate operation
  (`/tmp/hype-detail-retention-red.log`: 1 failed).
- Loads now acquire the next retention handle before releasing the previous one,
  preserving continuous ownership on same-key reloads. The test also releases the actual
  consumer and verifies its entry becomes evictable, guarding against a leaked retention
  count.
- Detail refresh/reactivity and optimism suites passed **3 files / 38 tests**
  (`/tmp/hype-detail-retention-tests.log`); scoped whitespace checks passed. This covers
  real cache/client retention behavior under a full inactive cache.
- No live database/storage operation, external message, commit or deployment occurred.
  Broader audit and mounted browser verification remain open.
- Workspace typecheck passed with **0 errors / 19 warnings**
  (`/tmp/hype-detail-retention-check.log`). No new full-suite claim is made.

## 2026-11-04 — Ignore obsolete first-page list failures

- ResourceList documented ignored obsolete completions and guarded state writes, but
  still threw failed first-page requests after clear, release or activation of a newer
  search. Three regressions reproduced rejected obsolete loads
  (`/tmp/hype-list-errors-red.log`: 3 failed).
- First-page failure handling now exits when the traversal generation is obsolete.
  Current failures continue clearing denied pages, recording the error and rejecting
  normally; pagination behavior is unchanged.
- List, collection reactivity, detail refresh and optimism suites passed **4 files / 77
  tests** (`/tmp/hype-list-errors-tests.log`), including existing current denial/factory
  failure tests and the new obsolete-failure cases. Scoped whitespace checks passed.
- Boundary: actual controller/cache runtime tests, not mounted admin/browser proof. No
  live database/storage operation, external message, commit or deployment occurred;
  broader audit remains active.
- Final workspace typecheck passed with **0 errors / 19 warnings**
  (`/tmp/hype-list-errors-final-check.log`). The earlier check was interrupted and its
  process handle was no longer present; this completed replacement check supplies the
  evidence.

## 2026-11-04 — User-requested wrap-up

- Stopped further audit work at the user's request. Latest focused validation: **4 files
  / 77 tests passed**; final workspace typecheck: **0 errors / 19 warnings**. Latest
  full-suite evidence remains **4,890 passed / 2 failed**, with both failures in
  messaging inbox tests; that run predates the latest detail/list fixes.
- Changes remain uncommitted. No deployment or live database/storage operation was
  performed. The broad audit is not claimed complete: authenticated mounted browser
  verification and previously recorded storage cleanup/recovery boundaries remain open.

## 2026-11-05 — Apply explicit import, background-job and rotation behavior decisions

- User clarified that active imports must block navigation, bulk mutations must continue
  as app-owned background work across internal navigation, rotation must change metadata
  rather than source bytes, and refresh failures should have separate feedback after
  successful saves. These decisions supersede the earlier view-owned bulk cancellation
  and byte-rewriting rotation implementations.
- Import image uploads/replacements and active Feature processing now register
  navigation guards. Account/scope reset remains independent. Browser document departure
  uses SvelteKit's native unload warning; internal navigation is cancelled while work is
  busy.
- RootCTX now owns background job progress. Bulk chunks retain their captured inputs and
  continue after the initiating view closes or changes selection; account revision
  changes still stop further dispatch. Only current views receive local row changes.
  Root layout renders progress at bottom right and guards document departure while jobs
  run; in-app navigation remains available. Completed writes reconcile the shared cache.
- Rotation preserves source bytes/public ID and writes an immutable metadata revision
  before a snapshot-guarded database update. Delivery applies renderRotation to decoded
  pixels or the Images binding. Legacy baked source angles are retained separately to
  avoid double rotation. Raw downloads preserve source bytes; displayed intermediates
  and derivatives apply metadata rotation. The app and asset-service changes require
  coordinated release; no deployment was performed.
- Parent editor refresh failures and bulk reconciliation failures now issue distinct
  warning feedback without relabeling a successful database write as failed.
- Initial focused validation passed **9 files / 197 tests** through dev-check
  (`/tmp/hype-behavior-tests.log`). Added further actual bulk-handler navigation/account
  tests and repeated/legacy rotation metadata tests for the final run. Initial workspace
  typecheck reported **108 errors / 20 warnings**, including duplicate Svelte snippet
  types across the workspace; no clean typecheck claim is made.
- Browser inventory returned `The browser access host is unavailable`; authenticated
  rendered verification remains unavailable. Cloudflare documentation fetch failed DNS
  resolution; the implementation uses the installed Workers types for the Images
  transform contract. Further validation is recorded below when complete.
- Final focused validation passed **11 files / 202 tests**
  (`/tmp/hype-behavior-final-tests.log`), covering actual bulk-handler continuation
  after navigation/closing bulk mode, account-bound cancellation, immutable rotation
  metadata, legacy source angles, pixel transforms, image transaction behavior, imports
  and save/refresh settlement.
- Asset-service Wrangler dry-run bundle passed (`/tmp/hype-asset-rotation-build.log`);
  it exited without deployment. Final workspace typecheck still reported **108 errors /
  20 warnings** (`/tmp/hype-behavior-final-check.log`), including widespread
  incompatible Svelte Snippet identities and test matcher declarations. The changed
  ImportFeatureFlow has the same existing snippet diagnostic at its footer; no clean
  workspace typecheck is claimed.
- Extracted the root progress presentation into BackgroundJobStatus and verified it
  mounted with real job state. Progress survives indicator remount, internal navigation
  remains allowed, document departure is guarded while busy, completion removes the
  guard, and settled entries can be dismissed. This UI/background/import subset passed
  **4 files / 10 tests** (`/tmp/hype-background-ui-tests.log`) after using real timers
  for Svelte unmount cleanup. This is mounted jsdom evidence, not authenticated-browser
  verification.
- Scoped whitespace checks passed. Changes remain uncommitted. No live application data,
  original image objects or deployed workers were modified.

## 2026-11-05 — Atomic commit series

The audit implementations and their independent regression suites were isolated from
concurrent work and committed in the groups below. Repeated verification entries above
do not each represent a separate code change. The four product-decision commits
(`b636d4e70`, `e23a3131f`, `dcf945e0e`, `e14e712d8`) predate this series. The series was
rebased onto `65611172f` to preserve six subsequent image/organisation fixes.

- The stable, rebased series passed **112 Vitest files / 1,716 tests**. The explicit
  address-label baseline cases also passed (3 tests). Normal commit hooks ran for each
  commit.
- Broad checks are not a clean release gate: the initial type check reported 194 errors
  and 20 warnings; after isolation fixes a second check reported 186 errors / 20
  warnings. The remaining introduced Feature type import was corrected after that check.
  The exploratory full run reported 24 failed / 418 passed files, but overlapped the
  rebase and is diagnostic only. It must not be represented as a stable final-suite
  result.
- The relationship and accessibility fixes include their minimum schema/service
  prerequisites (Refs #194). Historical-layer transaction tests use a local SQL fixture
  without publishing the separate historical-layer migration.
- Unrelated authoring, rematching, organisation-user, header, and address-search work
  remains outside this series. Test-only expectation adjustments inside those
  uncommitted feature workflows remain with them; notably the rematch score,
  draft-local-link naming, and Location record tooltip fixtures. Their historical
  verification remains recorded above, but their owning features are not claimed as
  delivered by these commits.
- Bun verification passed 18 tests (including all 16 Location tests and both local
  restoration tests). The Feature import suite cannot load because the installed address
  package no longer exports `ADDRESS_GRANULARITIES`; that dependency mismatch remains
  unresolved in the isolated baseline.
- No push, deployment, application-data mutation, or issue completion is implied.

| Commit      | Change                                                                                       |
| ----------- | -------------------------------------------------------------------------------------------- |
| `5c34c43aa` | fix(db): classify wrapped missing-schema errors precisely                                    |
| `2d0af0f5b` | fix(db): enforce mapped relation ownership during replacement                                |
| `f7662c800` | fix(db): prepare revision-guarded relation replacements                                      |
| `b77785095` | fix(properties): commit values and translations atomically                                   |
| `581c55ddc` | refactor(properties): expose statements for parent form transactions                         |
| `e308426e8` | fix(cache): fence and deduplicate resource detail refreshes                                  |
| `2d3b937d9` | fix(resources): preserve detail ownership and hide denied reads                              |
| `c792fe0d0` | fix(resources): retain collection freshness within its access scope                          |
| `a461c9add` | fix(panels): refresh selected queries and bound retained pins                                |
| `ce2c61caa` | fix(features): fence retained queries and recover failed refreshes                           |
| `f34f50ff8` | fix(features): keep row models and bounded statistics tied to source inputs                  |
| `677bc5d1a` | fix(import): clear retained rows across reset and account changes                            |
| `ef58f1658` | fix(import): fence feature resolution and submission queues                                  |
| `d9c2659f1` | fix(import): fence project property choices and refresh definitions                          |
| `40eb0a226` | fix(import): reject superseded project metadata reads                                        |
| `65abdbeb2` | fix(import): load fresh complete layer catalogues and fence creation                         |
| `1d2ff56aa` | fix(import): stop superseded translation batches                                             |
| `062da9426` | fix(import): refresh contributor queries before matching                                     |
| `f7eb59618` | fix(import): fence validation and reconcile refreshed layer choices                          |
| `d35ab7a17` | fix(import): drain active image queues before allowing retry                                 |
| `131091d3a` | fix(import): cancel stale geocoding work                                                     |
| `c83385e52` | fix(import): fence property creation and pending translations                                |
| `0502f04e5` | fix(import): fence enrichment and surface translation failures                               |
| `1b2d014bc` | fix(metadata): include DNS resolution in link lookup deadline                                |
| `0acf5b977` | fix(forms): ignore link autofill after editing lifetime ends                                 |
| `61c31015c` | fix(admin): settle hub toggles within their route lifetime                                   |
| `944487221` | fix(features): retain account-owned membership operations across cards                       |
| `bbd3a1bdd` | fix(maps): invalidate thumbnails when rendered content is removed                            |
| `1dc08dce5` | refactor(db): compose descendant publication within parent transactions                      |
| `74185f62b` | fix(authz): restrict descendant capabilities with bounded statements                         |
| `d6d2f40d6` | refactor(projects): prepare live-scope map style assignments                                 |
| `ac9919662` | fix(layers): commit forms and scoped cascades atomically                                     |
| `79d229a3b` | fix(projects): commit forms ancestry and scoped cascades atomically (Refs #194)              |
| `8b39a139c` | fix(organisations): commit forms and scoped cascades atomically                              |
| `05236585d` | fix(hubs): commit parent relations and property catalogues atomically                        |
| `0e9054556` | test(db): verify publication and archive transaction rollback (Refs #194)                    |
| `8cdfa6012` | fix(features): share write-time authorization ancestry guards                                |
| `3325a3842` | fix(tasks): validate feature ancestry inside creation transactions                           |
| `23e87af6e` | fix(contributions): commit feature drafts and guarded tasks atomically                       |
| `1f829d195` | fix(images): preserve referenced assets and restrict metadata cleanup                        |
| `0b019afb1` | fix(images): guard upload confirmation edits and deletion atomically                         |
| `407d00a3b` | fix(features): guard publication and archive writes by authorized ancestry                   |
| `8938a0246` | fix(contributions): retain scoped retry stages and drain active uploads                      |
| `0b8b9e33b` | fix(images): retain viewer-owned upload retries and scoped rollback                          |
| `34d63ffe2` | fix(users): await native query refresh registration                                          |
| `7970951e1` | fix(resources): scope reactive list metadata and refresh ownership                           |
| `114be65f7` | fix(admin): refresh feature traversal and reject stalled continuations                       |
| `dfbb49082` | fix(admin): settle feature and gallery actions within route ownership                        |
| `6633b7d19` | fix(addresses): normalize geocoded components before abbreviating                            |
| `832ad3b35` | test(db): run feature count migrations with portable FTS5                                    |
| `0831ac24a` | test(authz): verify fresh persisted request role snapshots                                   |
| `33998e95d` | test(translations): enforce schema limits before provider calls                              |
| `31bfbb4b5` | test(messaging): verify delivery and partial replay boundaries                               |
| `ebed75c89` | test(forms): verify editor route ownership lifetimes                                         |
| `5edb02d3b` | test(resources): align fixtures with query and authorization contracts                       |
| `a5f35a61a` | fix(locations): retain explicit address labels in baselines (Refs #194)                      |
| `189972657` | feat(locations): retain relationship assertions for guarded review (Refs #194)               |
| `c0479610d` | fix(locations): recheck subject visibility in address reorder transactions (Refs #194)       |
| `734468085` | fix(locations): preserve accessibility save outcomes and reject changed subjects (Refs #194) |
| `388ea59e4` | fix(addresses): fence translation callbacks by editor identity and locale                    |
| `a7c395302` | test(tooling): isolate framework probes and deployment mocks                                 |
| `49fb6db93` | test(users): correct SQLite row adapter typing                                               |
| `1a895145b` | test(import): own restoration fixtures and allow migrated checks to finish                   |
| `9eb387a9f` | docs(authz): record transactional scope and refresh contracts                                |
| `8d2eb802f` | fix(types): align isolated editor and layer contracts                                        |
| `8130d844d` | fix(addresses): preserve the existing single-locale display control                          |
| `bceb113a3` | fix(types): import feature envelopes from their public schema                                |
