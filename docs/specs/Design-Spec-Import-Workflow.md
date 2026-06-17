# Import Workflow Design Spec

## Summary

This document captures the admin import system that existed on `feat/data-import`
as a future reimplementation target, not as a recommendation to restore the old code verbatim.

The source snapshot was centered on:

- `src/routes/admin/import/+page.svelte`
- `src/lib/components/import/*`
- `src/lib/client/services/import/*`
- `src/lib/context/import.svelte.ts`

That implementation proved the product shape, but it concentrated too much workflow,
state, network I/O, and persistence logic into one route and one context. If import is
reintroduced, it should preserve the workflow semantics while being rebuilt using the
current repository standards:

- Bits-based admin UI
- Svelte remote functions instead of client-side REST orchestration
- authz-first server mutations
- explicit import-domain services instead of page-owned workflow logic

## Source Snapshot

The legacy import flow supported two distinct paths:

- feature CSV import
- feature image batch upload by filename-derived feature id

The feature CSV path implemented a staged workflow:

1. upload CSV
2. select organisation, project, and locale
3. map columns to domain fields
4. validate and resolve contributor/user references
5. validate and resolve layer references
6. reconcile property definitions and categorical values
7. handle translation-related property cases
8. geocode / geo lookup review
9. preview merged feature payloads
10. create or update features row by row

The old code also had an `events.ts` stub, but event import was not implemented.

## What Was Good

- The workflow model was correct: import is not one form submit, it is a staged
  reconciliation pipeline.
- The property reconciliation step recognized a real domain need:
  property creation, value matching, translation prompting, and type-sensitive value
  handling cannot be reduced to naive CSV mapping.
- The feature preview/diff step was useful and should remain part of any future design.
- The image upload path had a practical operational contract:
  map filenames to feature ids, batch uploads, show per-file status.

## What Should Not Be Reintroduced

- A single route component owning the entire workflow state machine.
- Client-side `fetch('/api/...')` validation and persistence loops as the main mutation
  path.
- A monolithic `ImportCtx` holding every transient state, result cache, modal toggle,
  search result, and enriched row payload.
- Property reconciliation logic embedded primarily in UI components.
- Row-by-row writes with page-local merge logic as the only durable execution path.

## Goals

- Reintroduce admin import as a reusable import domain, not as one large page.
- Keep the successful staged reconciliation model from the legacy implementation.
- Move validation, resolution, merge planning, and persistence to server-owned import
  services.
- Keep the UI as an operator console for inspection, mapping, and approval.
- Support resumable import sessions so operators do not lose work if the page reloads.
- Make import behavior explicit enough to test without rendering the full UI.

## Non-Goals

- Recreating the exact legacy UI hierarchy.
- Reusing legacy REST endpoints for import orchestration.
- Implementing event import in the first pass unless there is active product demand.
- General-purpose ETL for arbitrary external schemas.

## Recommended Product Shape

Future import should be split into two admin surfaces:

- `/admin/import/features`
- `/admin/import/images`

Optional later expansion:

- `/admin/import/events`

Reason:

- feature CSV import and feature-image upload have different validation,
  authorization, and failure models
- the legacy page combined them for convenience, but they are separate jobs

## Target Architecture

### 1. Import Domain Modules

Add an import domain with clear boundaries:

- `src/lib/api/server/import.remote.ts`
- `src/lib/api/services/import/*.ts`
- `src/lib/db/services/import.ts`
- `src/lib/bits/patterns/import/*`

Recommended service split:

- `import.session.ts`
  - create/load/update import sessions
- `import.mapping.ts`
  - infer column mappings and normalize submitted mappings
- `import.validation.ts`
  - validate users, layers, property references, and row shape
- `import.property-reconciliation.ts`
  - property creation, value matching, translation requirements
- `import.preview.ts`
  - produce row preview payloads and diffs
- `import.execution.ts`
  - execute creates/updates and persist results
- `import.images.ts`
  - feature-image upload batching and filename resolution

### 2. Session Model

Do not keep import state only in component memory. Introduce a persisted import session.

Minimum session fields:

```ts
type ImportSession = {
  id: string
  kind: 'feature-csv' | 'feature-images'
  status:
    | 'draft'
    | 'mapping'
    | 'validation'
    | 'reconciliation'
    | 'preview'
    | 'executing'
    | 'completed'
    | 'failed'
  organisationId: string | null
  projectId: string | null
  selectedLocale: 'en' | 'zhHans' | zhHant | null
  sourceFileName: string
  sourcePayload: string
  mappingPayload: string | null
  reconciliationPayload: string | null
  previewPayload: string | null
  executionPayload: string | null
  createdBy: string
  createdAt: string
  updatedAt: string
}
```

The payload fields can start as JSON blobs in D1. If import becomes heavily used, the
execution log can be normalized later.

### 3. Remote Function Contract

The UI should call remote functions, not legacy client fetch services.

Recommended remote handlers:

- `createImportSession`
- `getImportSession`
- `saveImportAssociation`
- `saveImportMapping`
- `runImportValidation`
- `saveImportResolutions`
- `buildImportPreview`
- `executeImportSession`
- `cancelImportSession`
- `uploadImportImages`

Server responsibilities:

- parse and validate submitted state
- authorize by organisation/project scope
- read live DB state for validation
- persist session progress
- return typed stage payloads for the UI

### 4. UI Layer

The route page should be thin. It should:

- load a session
- render the current stage
- submit stage actions through remote functions
- display progress, warnings, diffs, and execution results

Recommended Bits pattern structure:

- `src/lib/bits/patterns/import/ImportShell.svelte`
- `src/lib/bits/patterns/import/ImportStepper.svelte`
- `src/lib/bits/patterns/import/ImportColumnMapping.svelte`
- `src/lib/bits/patterns/import/ImportUserResolution.svelte`
- `src/lib/bits/patterns/import/ImportLayerResolution.svelte`
- `src/lib/bits/patterns/import/ImportPropertyReconciliation.svelte`
- `src/lib/bits/patterns/import/ImportPreview.svelte`
- `src/lib/bits/patterns/import/ImportExecution.svelte`
- `src/lib/bits/patterns/import/ImportImageUpload.svelte`

The old `ImportCtx` should not return. If local UI state is needed, keep it scoped to
one stage component.

## Workflow Specification

### Stage 1: Source Intake

Inputs:

- CSV file or image files

Outputs:

- parsed CSV headers and rows
- source stats
- initial inferred mappings
- new import session id

Notes:

- Keep the old useful behavior of tracking valid, invalid, and truncated CSV rows.
- Parsing should happen server-side for the durable session record.
- The client may parse optimistically for immediate feedback, but server parsing is the
  source of truth.

### Stage 2: Association

Inputs:

- organisation
- project
- selected locale

Outputs:

- scoped import session
- project-specific property catalog
- project layer catalog

Notes:

- This stage is mandatory before validation.
- The legacy modal-based association step was correct conceptually.

### Stage 3: Column Mapping

Inputs:

- user-edited mapping for each header

Outputs:

- normalized mapping definition
- warnings for empty or structurally invalid columns

Mapping targets should stay explicit:

- `Feature`
- `User`
- `Layer`
- `Property`
- `AddressMeta`
- `Address`
- `SKIP`

Keep the useful legacy heuristics:

- locale extraction from headers
- property key extraction from headers
- initial property type inference
- sample values for operator review

Do not keep the legacy behavior where page code mutates column objects directly and
implicitly advances workflow state.

### Stage 4: Reference Validation

Split validation by reference type. Each validator should run server-side against current
data:

- users
- layers
- existing properties
- update-target feature ids, if present

Validation output should be a durable stage payload:

```ts
type ImportValidationResult = {
  users: {
    valid: number
    invalid: Array<{ value: string; reason: string; suggestions: Array<{ id: string; label: string }> }>
  }
  layers: {
    valid: number
    invalid: Array<{ value: string; reason: string; suggestions: Array<{ id: string; label: string }> }>
  }
  featureTargets: {
    missingIds: string[]
  }
}
```

The operator can then:

- choose a fallback contributor
- map invalid user values to concrete users
- choose a fallback layer
- map invalid layer values to concrete layers

### Stage 5: Property Reconciliation

This is the part worth preserving most carefully.

The legacy implementation correctly identified that property import is not one case. The
future version should keep the scenario-based approach, but move the logic into a server
service with an explicit contract.

Required behaviors:

- create new properties when the mapping declares a new property key
- identify property type:
  - classifier
  - specifier
  - display
- match categorical CSV values to existing property values
- create missing categorical values when allowed
- capture translation requirements when locale-bearing values imply multilingual value
  creation
- reject impossible mappings early

Recommended contract:

```ts
type PropertyReconciliationPlan = Array<{
  propertyKey: string
  propertyStatus: 'existing' | 'new'
  propertyType: 'classifier' | 'specifier' | 'display'
  action:
    | 'none'
    | 'create-property'
    | 'match-values'
    | 'create-values'
    | 'collect-translations'
    | 'reject'
  issues: string[]
}>
```

The UI should present this plan as a staged checklist, not hide it in component-local
side effects.

### Stage 6: Preview Build

Before execution, the server should build a preview result per row:

- submitted row projection
- resolved references
- existing feature payload if updating
- merged feature payload
- diff summary
- action classification:
  - `create`
  - `update`
  - `unchanged`
  - `skip`
  - `error`

This preserves the best part of the legacy `FeatureResolutionStep` while removing the
page-owned merge logic.

### Stage 7: Execution

Execution should be server-owned and resumable.

Rules:

- persist row-level execution status
- process rows deterministically
- support retry for failed rows
- keep create/update behavior idempotent as far as possible
- record enough metadata to explain failures later

Recommended execution result:

```ts
type ImportExecutionResult = {
  sessionId: string
  totals: {
    create: number
    update: number
    unchanged: number
    skipped: number
    error: number
  }
  rows: Array<{
    rowIndex: number
    action: 'create' | 'update' | 'unchanged' | 'skip'
    status: 'success' | 'error'
    featureId?: string
    message?: string
  }>
}
```

The legacy row-by-row client loop should be treated as a prototype only.

## Image Import Specification

Image import should be a separate import kind.

Legacy behaviors worth keeping:

- infer feature id from filename stem
- validate target feature existence
- batch upload with per-file status
- show success/error summary

Recommended improvements:

- server-side preflight returning:
  - valid feature matches
  - missing feature ids
  - duplicate filename collisions
  - unsupported file types
- explicit dry-run before upload
- remote function or server endpoint that owns upload execution
- optional zip manifest support later if filename-only matching becomes too fragile

## Data Contracts Worth Preserving

These concepts from the legacy implementation should remain, even if their exact types
change:

- `CSVColumn`
- inferred sample values per column
- user resolution map
- layer resolution map
- per-row enriched data
- property reconciliation plan
- preview row result
- execution row result

The exact legacy types do not need to be copied into `src/lib/types.ts` unchanged.
Instead, introduce new import-domain types under the correct import/resource heading when
the feature is rebuilt.

## Authorization Requirements

Import is admin-only and must be scoped.

Server handlers must authorize:

- import session creation for the selected organisation/project scope
- access to read import session contents
- validation lookups against scoped resources
- feature create/update execution
- image upload attachment to feature resources

Do not trust client-provided organisation, project, layer, user, or feature ids without
server-side scope checks.

## Persistence Strategy

Minimum viable persistence:

- D1 table for import sessions
- JSON payload columns for mapping, validation, preview, and execution state
- optional blob/object storage only if source files need archival beyond the parsed
  payload

Why this is enough initially:

- imports are operator workflows, not user-facing hot paths
- session payloads are easier to evolve early as JSON
- the main value is resumability and inspectability, not relational elegance

## Testing Requirements

Future import work should not ship without targeted tests for:

- CSV parsing and row stats
- column inference
- user validation and resolution
- layer validation and resolution
- property reconciliation scenarios
- preview merge classification
- execution retry/idempotency behavior
- image filename resolution and upload preflight
- authorization failures at every remote entry point

At least the import domain services should be testable without rendering the admin page.

## Migration Guidance

If import is reintroduced later, build it in this order:

1. server session model and import-domain types
2. CSV intake and mapping persistence
3. server validation and resolution contracts
4. property reconciliation service
5. preview builder
6. execution engine
7. Bits admin UI
8. image import surface

This order keeps the complex logic testable before UI composition.

## Explicit Recommendation

If the team wants to preserve the old implementation as reference only, preserve this
spec and the branch/commit reference, not the legacy route code. The workflow is worth
keeping; the legacy architecture is not.
