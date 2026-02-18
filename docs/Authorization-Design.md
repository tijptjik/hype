# Authorization Design Notes

## Purpose
Working notes for designing a unified authorization system with hierarchical ownership, field-level permissions, and remote-function query APIs.

## Current Hierarchy
- Resource chain: `organisation -> project -> layer -> feature -> task`
- Parent refs in schema:
  - `project.organisationId`
  - `layer.organisationId`, `layer.projectId`
  - `feature.organisationId`, `feature.projectId`, `feature.layerId`
  - `task.organisationId`, `task.projectId`, `task.featureId`

## Current Role Model
- Hub roles: `hubRole` (`HubRoleType.admin`)
- Organisation roles: `organisationRole` (`owner`, `member`)
- Project roles: `projectRole` (`owner`, `maintainer`, `member`, `translator`, `user`)
- Existing checks are spread across:
  - `src/lib/client/services/auth.ts`
  - `src/lib/auth/asserts.ts`
  - resource-specific query context functions in `src/lib/api/services/*`

## Status Flags and Access
- First-class resources include `isPublished` and `isArchived`.
- Requirement: policy must control who can request:
  - unpublished content (`isPublished === false`)
  - published content (`isPublished === true`, `isArchived === false`)
  - archived content (`isArchived === true`)
- Default read behavior should remain explicit in list APIs via default conditions.

## Proposed Authorization Model
- Single function:
  - `authorize({ userId, resourceType, resourceId, action, fields? })`
- Decision inputs:
  - role assignments (`hubRole`, `organisationRole`, `projectRole`)
  - resolved resource ancestry
  - optional field list for write checks
- Deterministic precedence:
  - explicit deny > allow
  - narrower scope > broader scope
  - direct subject > inherited role

## Policy Source of Truth
- Authoritative policy definitions live in application code.
- Policy rules are defined in a central policy map keyed by
  `resourceType/action`.
- The database remains the source of role assignments and resource relationships
  (for example `hubRole`, `organisationRole`, `projectRole`, ancestry refs).
- Authorization and data retrieval stay logically separate, but must share policy
  semantics through common helpers.
- Avoid DB-stored policy rules in v1 to reduce schema/policy engine complexity and
  keep policy changes type-safe, reviewable, and testable in PRs.

## Actor Model
- Current state: "known user" and "authenticated user" are equivalent.
- Roadmap: add limited anonymous read-only access using Better Auth anonymous
  support; do not implement this in the current phase.
- Current implementation scope assumes authenticated actors for write actions.

## Hub Admin Scope Semantics
- `hubRole.admin` at `hub.code === 'core'` is global super-allow across all hubs
  and descendant resources.
- `hubRole.admin` on non-core hubs is hub-scoped super-allow only for resources
  belonging to that specific hub.
- Terminology:
  - core hub admin = super-admin across all hubs
  - non-core hub admin = hub admin scoped to one hub
- This is a scope distinction within `hubRole.admin`, not a separate role type.

## Organisation Create Policy (`createOrganisation`)
- Only `hubRole.admin` can create organisations.
- Scope behavior follows hub admin semantics:
  - `core` hub admin can create organisations in any hub.
  - non-core hub admin can create organisations only within their own hub.
- No create permission is granted by organisation or project roles.
- Creator does not automatically become organisation owner.
- Ownership must be explicitly provided in form payload.
- Validation requirements for create:
  - at least one user must be assigned in `userRoles`
  - at least one assigned user must have `organisationRole.owner`
- Reserved organisation codes are blocked by validation:
  - `tijptjik`
  - `hongkong`
  - `hk`
  - `hkgov`
  - `govhk`
- No per-user organisation count limit and no approval workflow in current scope.

## Organisation Update Policy (`updateOrganisation`)
- Update authority is granted to:
  - `organisationRole.owner`
  - relevant hub admins based on hub scope semantics (`core` global, non-core scoped)
- Project roles do not grant upward permissions to organisation resources.
- Precedence semantics are active in this phase:
  - explicit deny > allow
  - narrower scope > broader scope
  - direct subject > inherited role
- `isPublished` is authorized via the same `authorize(...)` function using a
  dedicated publish capability check; organisation owners are allowed.
- Archived-state update protection is not enforced in the current phase.
- Unpublished organisations use the same update role checks as published ones.

## Organisation Field-Level Write Controls
- `isCoreInclusive` and `hubId`:
  - writable only by core hub admins (global super-admin scope)
- `isHubExclusive`:
  - writable by any relevant hub admin (core hub admin or scoped non-core hub admin)
- All other organisation fields:
  - writable by `organisationRole.owner` or stronger role scope
- Role membership payload (`userRoles`) is governed by `manageRoles` permission
  (see section below), not generic field update permission.

## Organisation Role Management Policy (`manageRoles`)
- `userRoles` changes in organisation form require explicit `manageRoles`
  permission.
- Allowed principals for `manageRoles`:
  - `organisationRole.owner`
  - relevant hub admins based on hub scope semantics
- Owners may remove or downgrade themselves.
- Integrity rule: an organisation must always retain at least one owner after any
  role mutation.

## Request Handling and Error Model
- Unauthorized write attempts return HTTP `403`.
- Authorization failures should return machine-readable reason codes suitable for
  form-level handling.
- In remote form functions, use `invalid(...)` with a form-level message/code
  payload to surface authorization errors in UI.
- Audit logging for allow/deny write attempts is a roadmap item (not in current
  phase).

## Validation and Authorization Order
- Authorization checks run before validation that could leak resource or business
  information (for example uniqueness checks).
- Unauthorized requests must short-circuit before data lookups that reveal
  existence details.

## Concurrency Control (Optimistic)
- Update requests must be rejected when the persisted record has changed since the
  client last loaded it (stale write prevention).
- Use optimistic concurrency with `updatedAt` carried in the form meta envelope.
- Form meta contract for updates:
  - include `meta.id`
  - include `meta.updatedAt` (timestamp/value from loaded organisation record)
- Server update handling:
  - compare `meta.updatedAt` with current persisted `updatedAt`
  - reject on mismatch with machine-readable stale-write code via form-level
    `invalid(...)` response
- Client form mapping should populate `meta.updatedAt` alongside `meta.id` when
  constructing edit payloads.

## Implementation Shape (Current Phase)
- Implement `authorize({ userId, resourceType, resourceId, action, fields? })`
  now for `resourceType: organisation`.
- Calls with unsupported resource types should fail with explicit
  `NOT_IMPLEMENTED` errors.
- Remote functions should use guarded wrappers around Svelte remote `query` /
  `form` / `command` handlers so auth gates are consistently applied.
- `organisationForm` should call shared authorization helpers rather than inline
  role checks.
- Transaction strategy for create/update plus role writes is pending platform
  confirmation for D1 behavior; treat this as implementation detail to verify.

## Test Strategy (Policy as Spec)
- Use table-driven tests as executable policy spec.
- Minimum actor matrix for both create and update flows:
  - core hub admin
  - relevant non-core hub admin
  - out-of-scope non-core hub admin
  - organisation owner
  - organisation member
  - unrelated authenticated user
  - anonymous actor (future-path expectation)

## Policy Matrix (v1, Organisation)

### Action-Level Matrix
| Action | Core hub admin | Scoped non-core hub admin (same hub) | Non-core hub admin (other hub) | Organisation owner | Organisation member | Unrelated authenticated user | Anonymous |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `createOrganisation` | Allow | Allow | Deny | Deny | Deny | Deny | Deny |
| `updateOrganisation.fields` (non-restricted fields) | Allow | Allow | Deny | Allow | Deny | Deny | Deny |
| `updateOrganisation.publish` (`isPublished`) | Allow | Allow | Deny | Allow | Deny | Deny | Deny |
| `updateOrganisation.manageRoles` (`userRoles`) | Allow | Allow | Deny | Allow | Deny | Deny | Deny |

### Field-Level Matrix (`updateOrganisation.fields`)
| Field group | Core hub admin | Scoped non-core hub admin (same hub) | Organisation owner |
| --- | --- | --- | --- |
| `hubId`, `isCoreInclusive` | Allow | Deny | Deny |
| `isHubExclusive` | Allow | Allow | Deny |
| Other organisation fields | Allow | Allow | Allow |

### Validation/Integrity Matrix
| Flow | Rule | Expected result |
| --- | --- | --- |
| Create | `userRoles` empty | Deny (`invalid`) |
| Create | No owner in `userRoles` | Deny (`invalid`) |
| Create | `code` in reserved list | Deny (`invalid`) |
| Update | `meta.updatedAt` differs from persisted `updatedAt` | Deny (`invalid`, stale write) |
| Create/Update role mutation | Result has zero owners | Deny (`invalid`) |
| Unauthorized create/update | Any unauthorized actor | Deny (`403` + machine-readable code) |

### Why policy-in-code first
- Stronger refactor safety with TypeScript types and compile-time checks.
- Faster iteration while role semantics and field-level constraints are still
  evolving.
- Cleaner expression of precedence logic, inheritance, and field-level writes.
- Easier table-driven testing of `action x role x scope x field` behavior.

### Query consistency strategy
- Keep one shared policy layer that powers both:
  - write checks via explicit `authorize(...)` calls before mutations
  - read/list filtering via policy-derived query condition helpers
- Remote functions should call the shared authorization/policy helpers and avoid
  embedding resource-specific rule branches inline.
- This prevents drift between "who is allowed" and "which rows are selectable".
- Default read filters remain explicit (`isPublished: true`, `isArchived: false`)
  and can be relaxed only through policy-aware conditions for privileged roles.

### Future evolution
- If runtime-configurable policies are needed later, introduce them as a
  deliberate phase with migration, validation, and audit requirements.
- Until then, treat DB policy tables as out of scope; use code policy + DB role
  data as the baseline architecture.

## Confirmed Decisions
- Default list filters: `isPublished: true`, `isArchived: false`.
- Prism identifiers: use IDs.
- `hubRole` inheritance: yes, inherit across organisation/project descendants.
- Actor model (current): authenticated users only for write paths.
- Anonymous access: roadmap item only (limited read-only), not in current
  implementation.
- `hubRole.admin` scope:
  - `core` hub admin = global super-allow
  - non-core hub admin = super-allow limited to that hub's resources
- `createOrganisation` authorization:
  - only `hubRole.admin` is allowed
  - `core` hub admin is global; non-core hub admin is hub-scoped
  - no create permission from organisation/project roles
- `createOrganisation` ownership behavior:
  - creator does not auto-receive `organisationRole.owner`
  - form submission must include users and at least one owner
- Reserved organisation codes:
  - `tijptjik`, `hongkong`, `hk`, `hkgov`, `govhk`
- `createOrganisation` limits:
  - no max-orgs-per-user limit in current scope
  - no approval workflow in current scope
- `updateOrganisation` authorization:
  - allowed for `organisationRole.owner` and relevant hub admins
  - project roles do not grant permissions to parent organisation actions
- `updateOrganisation` field controls:
  - `hubId` + `isCoreInclusive` writable only by core hub admin
  - `isHubExclusive` writable by relevant hub admin (including core)
  - all other fields writable by organisation owner or stronger
- `isPublished` writes:
  - checked through shared `authorize(...)` action rights
  - organisation owner is allowed
- `manageRoles`:
  - explicit permission required for `userRoles` changes
  - owners can self-downgrade/remove
  - organisation must always retain at least one owner
- State constraints:
  - no additional archived-update guard in current phase
  - unpublished/published update checks use same role logic
- Error behavior:
  - unauthorized writes return `403`
  - return machine-readable authorization reason codes
  - in form handlers, surface via `invalid(...)` with form-level messages/codes
- Auth/validation order:
  - run authorization before uniqueness/existence validations
  - short-circuit unauthorized requests before lookup-heavy checks
- Concurrency:
  - use optimistic concurrency for updates
  - include `meta.updatedAt` in form payload
  - reject stale updates when payload `updatedAt` does not match persisted record
- Implementation shape:
  - implement `authorize(...)` for organisation now
  - unsupported resource types return `NOT_IMPLEMENTED`
  - use guarded remote wrappers to enforce consistent checks
- Audit logging of allow/deny writes: roadmap item.
- Tests:
  - use table-driven tests as executable policy spec
  - include create/update coverage for core admin, non-core admin (in-scope and
    out-of-scope), org owner/member, unrelated user, and anonymous actor
- Policy source of truth: application code.
- Policy structure: central map by `resourceType/action`.
- Remote functions must perform explicit write authorization before mutation.
- Query filters should be built from shared policy helpers to keep auth and data
  access consistent.
