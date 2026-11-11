# Authorization Design Notes

## Purpose

Working notes for designing a unified authorization system with hierarchical ownership,
field-level permissions, and remote-function query APIs.

## Current Hierarchy

- Resource chain: `organisation -> project -> layer -> feature -> task`
- Parent refs in schema:
  - `project.organisationId`
  - `layer.organisationId`, `layer.projectId`
  - `feature.organisationId`, `feature.projectId`, `feature.layerId`
  - `task.organisationId`, `task.projectId`, `task.featureId`

## Current Role Model

- Hub roles: `hubRole` (`HubRoleType.admin`)
- Organisation roles: `organisationRole`, ordered `user < member < owner`. Its `grant`
  JSON map retains independent reasons; the effective role is the strongest. User
  inclusion accepts all three levels. Staff checks accept only member/owner. User-only
  grants never confer staff access or upward editing rights.
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

Publication commands for organisations, projects and layers commit the parent,
descendant publication snapshots and eligible image classification/publication in one D1
batch. Each batch checks parent existence and asserts that the parent update affected
exactly one row before descendant writes; missing or skipped updates return null without
changing descendants. Authorization is resolved before constructing the batch. The batch
rechecks the probed organisation/project ancestry and hub identity (including null
hubs); moved resources cannot publish under their old authorized scope. This does not
re-read role grants inside the transaction. Project publication also compares the
original persisted license before writing history derived from that snapshot; concurrent
license/history changes abort the transaction and return a publication conflict.
Unpublishing does not replace license history. A failure at any stage rolls back all
publication state and attribution; `publishChildren` remains an explicit choice to
include drafts. Remote handlers must not perform a second descendant cascade after this
atomic service call. Single-Feature publication also commits its state and eligible
image classification/publication in one D1 batch, so image-policy failure cannot leave a
partially published Feature. The transaction asserts that the Feature update affected
exactly one row before image-policy writes; a missing or skipped parent update cannot
publish images. Both Feature publish and unpublish recheck the authorized
layer/project/organisation IDs, their parent links and the nullable hub identity in that
transaction. Direct and bulk commands pass the same authorization probe; moved or
inconsistent ancestry returns no updated row. Standalone image publication uses the same
transactional scope predicate and returns a conflict when the Feature is missing or
moved. Valid no-op retries retain original image publication attribution.

Organisation, project and layer archive commands likewise commit the parent and all
descendant archive snapshots in one guarded batch. They recheck authorized ancestry and
require one affected parent row before commit. Layer archive applies descendant
snapshots before updating its parent, because restoration triggers may move Features
into a newly provisioned historical layer; a skipped parent still rolls back all
preceding writes. Remote handlers do not issue a second archive cascade. Single-Feature
archive commands (including bulk) recheck their authorized scope in the UPDATE statement
itself. Missing, moved or skipped parents cannot change descendants; write failures roll
back the hierarchy command. Existing local archive restoration rules are retained.

- Authoritative policy definitions live in application code.
- Policy rules are defined in a central policy map keyed by `resourceType/action`.
- The database remains the source of role assignments and resource relationships (for
  example `hubRole`, `organisationRole`, `projectRole`, ancestry refs).
- Authorization and data retrieval stay logically separate, but must share policy
  semantics through common helpers.
- Avoid DB-stored policy rules in v1 to reduce schema/policy engine complexity and keep
  policy changes type-safe, reviewable, and testable in PRs.

## Actor Model

- A usable Better Auth session may belong to either a guest (`isAnonymous === true`) or
  an upgraded account.
- Guests may read only published, non-archived application resources and may write their
  preferences, default layers, wishlist, visited-place state, and hub
  subscription-prompt dismissal state.
- Account-only writes return `ACCOUNT_REQUIRED`; missing sessions return
  `UNAUTHENTICATED`; role failures for upgraded users return `INSUFFICIENT_ROLE`.
- Session existence alone is never proof of a durable account.

## Hub Admin Scope Semantics

- `hubRole.admin` at `hub.code === 'core'` is global super-allow across all hubs and
  descendant resources.
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
- `isPublished` is authorized via the same `authorize(...)` function using a dedicated
  publish capability check; organisation owners are allowed.
- Archived-state update protection is not enforced in the current phase.
- Unpublished organisations use the same update role checks as published ones.

## Organisation Field-Level Write Controls

- `isCoreInclusive` and `hubId`:
  - writable only by core hub admins (global super-admin scope)
- `isHubExclusive`:
  - writable by any relevant hub admin (core hub admin or scoped non-core hub admin)
- All other organisation fields:
  - writable by `organisationRole.owner` or stronger role scope
- Role membership payload (`userRoles`) is governed by `manageRoles` permission (see
  section below), not generic field update permission.

## Organisation Role Management Policy (`manageRoles`)

- `userRoles` changes in organisation form require explicit `manageRoles` permission.
- Allowed principals for `manageRoles`:
  - `organisationRole.owner`
  - relevant hub admins based on hub scope semantics
- Owners may remove or downgrade themselves.
- Integrity rule: an organisation must always retain at least one owner after any role
  mutation.

## Organisation Users Policy

Refs #189, #194. `canManageOrganisationUsers` requires a durable, non-anonymous actor
and a non-archived organisation, then an Owner assignment for that exact organisation,
relevant scoped Hub Admin, or explicit SuperAdmin. Policy reads/writes and organisation
directory reads use this check. The directory additionally requires an enabled Users
policy and a server-side correlated membership predicate for both results and counts.
Authorized audience managers receive contact fields only for the returned members.
Global user-directory and profile permissions stay independent.

Admin user profiles expose one target-specific access level: explicit SuperAdmins can
edit globally; organisation Owners and the organisation's Hub Admins can edit users with
persisted audience membership in that non-archived organisation **only when** its
`permitUserDetailsEdit` permission is enabled. This platform permission defaults to
false for existing and new organisations. Only an explicit, durable SuperAdmin can grant
or revoke it in Advanced → Organization Permissions; organisation Owners, scoped Hub
Admins and core Hub Admin roles cannot self-grant it. Project roles and all other admin
roles receive the same public profile projection as the user app, without contact
details or account preferences. Core hub administration alone does not grant global
profile editing. Profile saves repeat the live permission and audience predicate and
check `updatedAt` in the UPDATE, rejecting stale edits or withdrawn membership. Contact
changes preserve identity uniqueness; changing email clears verification unless an
explicit SuperAdmin verifies it. Messaging settings use the same audience boundary,
while identity verification retains its separate elevated permission.

The organisation Maintainer role is not yet represented in the role model; its mapping
must be resolved before granting that additional profile-edit entitlement.

`organisationUserPolicy` stores independently selectable hub-sign-in, verified exact
email-domain, explicit card-onboarding and project-contribution rules. Policy updates
compare the observed revision. Sign-in writes re-read publication/archive state, current
hub, policy and persisted user/email verification in the INSERT itself. Card onboarding
uses the session owner and trusted active hub; core access additionally requires
core-inclusive, non-exclusive publication. These enrolment rules grant only the user
level, never staff membership.

Contribution enrolment is atomic with a submitted `newFeature`, `newPhoto` or
`reportedMissing` task (inserted as submitted or finalized from a draft). Migration 0182
installs the triggers: they resolve the organisation through the persisted
Feature/Project chain, check the current policy and durable active account, and merge
only `contribution:<projectId>: user` provenance. Draft uploads do not enrol anyone;
moderation is not required. Turning the rule off stops new enrolments and preserves
existing users. Migration 0183 enables this rule for the organisation owning the
`hkghostsigns` project and backfills its distinct Feature, image and submitted-task
contributors, including historical imports without tasks. Anonymous/archived accounts,
unsubmitted drafts, and uploads belonging only to draft tasks are excluded. Existing
staff roles and independent grants survive. The data migration can be rerun without
adding grants or history; immutable organisation history is preserved.

Migrations 0168 and 0182 must precede this runtime. The existing organisation role uses
independent grant reasons; only member/owner grants confer staff access. Source
payloads, accepted state and sync progress remain in private local files. There is no
production cursor or authentication fence. Before-or-after row guards abort a
conflicting import batch without overwriting independent HYPE edits. Deleted source
identities cannot claim a latent account.

Users settings share the main organisation form's dirty baseline, Reset and Save. Policy
revision guards participate in the same atomic transaction as the other form fields. The
email rule derives its domain from the current owning hub; the stored nullable domain is
an activation marker, not a separately configurable address.

## Request Handling and Error Model

- Unauthorized write attempts return HTTP `403`.
- Authorization failures should return machine-readable reason codes suitable for
  form-level handling.
- In remote form functions, use `invalid(...)` with a form-level message/code payload to
  surface authorization errors in UI.
- Audit logging for allow/deny write attempts is a roadmap item (not in current phase).

## Validation and Authorization Order

- Authorization checks run before validation that could leak resource or business
  information (for example uniqueness checks).
- Unauthorized requests must short-circuit before data lookups that reveal existence
  details.

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
- Task creation checks the submitted Feature, project and organisation chain inside the
  same D1 transaction as insertion. A concurrent reparenting rejects creation with
  `TASK_FEATURE_SCOPE_MISMATCH`; read-side scope checks still quarantine inconsistent
  legacy rows.
- New contribution Features, their translations/properties and their review tasks commit
  in one D1 transaction for both draft and immediate submission. The transaction
  rechecks Layer/project/organisation ancestry; task or relation failure rolls back
  Feature creation. Translation occurs before the transaction and external photo uploads
  after it. Existing-draft edits also commit Feature core/relations and task ancestry
  together, checking both captured revisions, task contributor/type, draft and review
  state, destination ancestry and absence of a Location link. A stale task or Feature
  rejects the complete save with `STALE_TASK_DRAFT`; external upload recovery remains a
  separate boundary.
- Direct Feature-upload confirmation commits the image, Feature assignment and all
  requested task-evidence links in one D1 transaction. Each task must still belong to
  the authorized Feature and canonical parent chain and remain unreviewed.
  Contributor-only access additionally requires every task to remain a draft owned by
  that contributor. A changed context returns `STALE_IMAGE_UPLOAD_CONTEXT` without
  partial image/link writes; retries preserve existing image metadata and moderation.
  New evidence links advance the task revision in that transaction so pending reviews
  cannot commit against an older evidence set; replaying existing links leaves it
  intact. Object storage and metadata sidecars remain outside the database transaction.
- Contribution finalization rechecks the task revision, contributor, type, draft/review
  state, persisted ancestry and at least one linked non-archived image at write time.
  New-Feature finalization captures the Feature revision before content validation and
  commits both draft-state changes together; a failed or skipped Feature update rolls
  back task submission.
- Project organisation moves commit core fields and descendant ancestry in one D1
  transaction. Every descendant write rechecks the captured project revision, prior
  organisation and optional Location policy revision before the parent update. Existing
  private-Location and historical-layer guards remain authoritative: a rejection rolls
  back the entire move. Submitted translations and role replacements, including required
  organisation membership grants, share that transaction. Project creation also commits
  those collections with its parent. Submitted map-style assignments share the
  transaction and check visibility against the destination organisation's live hub and
  the authorized prospective project code. Property catalogs, inherited assignments,
  default seeding and layer presentation also share the form transaction. Inherited
  catalogs resolve after a parent move; an in-batch revision check fences catalog writes
  before any mutation.
- Submitted organisation capability definitions and restrictions to project/role
  capabilities commit in one revision-guarded D1 transaction. Restriction expressions
  read live JSON booleans at write time, never grant a disabled capability, and do not
  update unchanged descendant rows. Submitted organisation translations and role
  assignments share that revision-guarded transaction; the core token advances last.
  Organisation creation likewise commits its parent, translations and initial role
  assignments and property catalog together. Organisation updates include the catalog in
  the parent transaction, checking the revision inside the batch before catalog writes.
- Hub form creation and updates commit core fields, translations, roles, organisation
  assignments and submitted layer defaults together. Each update mutation rechecks the
  hub revision before the final parent update; stale submissions cannot detach
  organisations or replace permissions. Property catalog writes share that transaction,
  preceded by an in-batch revision check; external domain registration remains separate.
- Layer form creation and updates commit core fields, translations and submitted
  property links in one D1 batch. Update relation writes require the unchanged layer
  timestamp and optional relocation-policy revision, with the parent token advanced
  last. Missing or stale parents cannot delete or insert related rows; omitted
  collections remain intact and explicit empty collections clear them.
- New project, organisation and hub upload grants sign the current image pointer,
  resource revision and parent scope, captured before authorization. Confirmation
  commits the image and pointer in one guarded D1 batch. It accepts an unchanged grant
  or a replay whose image is still selected in the same scope; it cannot reselect an
  older image after another upload, even after detached-image cleanup. Replays preserve
  image metadata and resource revision. Missing snapshot claims and changed contexts
  return `409 STALE_IMAGE_UPLOAD_CONTEXT` before sidecars or cleanup are scheduled. This
  scope check does not replace request authorization.
- Image edits commit core metadata and optional Feature-assignment fields in one guarded
  D1 batch. Both targets and the submitted final values must exist before commit; failed
  or skipped promotion cannot demote the previous canonical image or leave changed image
  metadata behind. Explicit image identities must match the authorized target. Supplied
  assignment fields must validate rather than silently becoming an image-only edit.
  These atomicity checks do not replace authorization or provide a storage transaction.
- Image/assignment edits and explicit image deletion advance affected pending and draft
  task revisions in the same transaction, before changing or removing evidence.
  Assignment edits invalidate only tasks for that Feature, including evidence affected
  by canonical demotion; core-image changes invalidate every pending task using it.
  Reviewed/unrelated tasks and no-op edits retain their revisions. Revision updates are
  monotonic and checked for skipped writes before evidence mutation. New Feature upload
  links use the same checked revision operation. A stale task review therefore cannot
  commit against evidence changed by these operations.
- Shared image-edit and explicit-deletion handlers capture persisted image state and
  resource membership/parent ancestry before authorization. Their D1 transactions
  recheck that snapshot before writes; edits also require the same scope at commit.
  Detached/reassigned images, reparented resources and changed image fields reject
  without changing metadata, task revisions or links. The image-state comparison
  includes all persisted columns rather than relying only on timestamp precision. This
  preserves the authorized scope; it does not re-read role grants inside D1 or cover
  storage writes performed before the database edit.
- Explicit upload replacements use a separate object key per grant. The signed token
  includes the original image/scope/assignment snapshot and source object
  namespace/version; legacy or same-object replacement grants fail closed. Confirmation
  requires an unchanged snapshot, including assignment moderation, or accepts a
  read-only replay of its still-current replacement identity. Replays preserve image
  fields, moderation and task revisions. Competing/superseded grants cannot reselect an
  older object. Sidecars use the committed version, retain existing metadata on retry
  and recover from the signed source reference when missing. Replacement does not delete
  source assets; metadata records their location.
- New direct upload URLs sign `If-None-Match: *`, and the proxy reserves the original
  with the equivalent atomic R2 condition before writing create-only sidecars. Reusing
  an occupied destination fails with 412; the client cannot infer matching bytes from
  that response and asks for a new upload. Proxy failures retain partial objects rather
  than deleting assets that concurrent confirmation may reference. The managed
  raw-bucket CORS policy must allow `if-none-match` before rollout. Previously issued
  URLs and retained-object cleanup remain separate storage boundaries.
- Rotation preserves source bytes and public ID. It prepares an immutable versioned
  metadata document and selects that revision with the captured image/scope/assignment
  guard. Delivery applies its render rotation; legacy baked rotations record their
  source angle so they are not applied twice. Failed or competing updates leave the
  selected revision unchanged. Successful rotation invalidates pending task reviews. Raw
  downloads continue to return source bytes; displayed intermediates and derivatives
  apply metadata rotation. Metadata mirrors remain best-effort after database commit.

- Confirmation writes the versioned metadata document with an atomic create-only
  condition, including through the direct R2 fallback. Competing writers read that exact
  document and use it for the unversioned mirror. Retries repair the mirror and manifest
  even when the canonical document already exists. Missing or conflicting canonical
  versions fail closed. This elects the first successful metadata writer; metadata
  storage is still not transactional with D1.

- Legacy image creation uses the same atomic image/assignment and resource-pointer
  batches as upload confirmation, with fresh server-generated IDs rather than upload
  replay identities. Single-image resources capture their pointer and parent scope
  before authorization; a stale snapshot rejects without an orphan image. Failed or
  skipped Feature assignment inserts roll back the image insert. Feature creation
  captures project/organisation/hub ancestry before the current authorization check,
  including on upload confirmation. The transaction checks those identities before
  writes and before commit, preventing authorization from carrying across a concurrent
  reparenting. This does not re-read role grants.

## Implementation Shape (Current Phase)

- Implement `authorize({ userId, resourceType, resourceId, action, fields? })` now for
  `resourceType: organisation`.
- Calls with unsupported resource types should fail with explicit `NOT_IMPLEMENTED`
  errors.
- Remote functions should use guarded wrappers around Svelte remote `query` / `form` /
  `command` handlers so auth gates are consistently applied.
- `organisationForm` should call shared authorization helpers rather than inline role
  checks.
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

### Why policy-in-code first

- Stronger refactor safety with TypeScript types and compile-time checks.
- Faster iteration while role semantics and field-level constraints are still evolving.
- Cleaner expression of precedence logic, inheritance, and field-level writes.
- Easier table-driven testing of `action x role x scope x field` behavior.

### Query consistency strategy

- Keep one shared policy layer that powers both:
  - write checks via explicit `authorize(...)` calls before mutations
  - read/list filtering via policy-derived query condition helpers
- Remote functions should call the shared authorization/policy helpers and avoid
  embedding resource-specific rule branches inline.
- This prevents drift between "who is allowed" and "which rows are selectable".
- Default read filters remain explicit (`isPublished: true`, `isArchived: false`) and
  can be relaxed only through policy-aware conditions for privileged roles.

### Future evolution

- If runtime-configurable policies are needed later, introduce them as a deliberate
  phase with migration, validation, and audit requirements.
- Until then, treat DB policy tables as out of scope; use code policy + DB role data as
  the baseline architecture.

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
  - central `authorize(...)` is implemented for `organisation`
  - `projectPolicyMap` exists, but central dispatcher wiring for `project` is a pending
    refactor
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
- Query filters should be built from shared policy helpers to keep auth and data access
  consistent.

## Personal contribution previews

The profile panel includes an authenticated account's own submitted, rejected and
unpublished features and images, including task-only photo submissions. These are
minimal read-only previews returned by the owner-scoped user profile request, not an
expansion of public feature/image read permissions. User-search or admin access to
someone else's profile does not grant access to their private previews.

Previews retain active hub, selected-map and live-layer boundaries. Drafts, orphan
uploads and unrelated archived content stay excluded. Rejected submissions may be
archived but remain visible to their author. Review records determine submitted and
rejected status; unpublished content without a pending or rejected review is labeled
unpublished. Published entries remain unlabeled. A photo omitted by an accepted partial
review is rejected individually. General resource navigation continues to enforce its
existing authorization rules.

## User directory contact privacy

- HYPE/core HubAdmin is SuperAdmin: core hub admins and explicit super admins may read
  all user email addresses and telephone numbers, regardless of active hub.
- Other HubAdmins do not receive email addresses until hub-specific interaction / core
  HYPE onboarding eligibility rules are implemented. Other viewers receive
  `email: null`; email remains accepted as search input.
- Outside SuperAdmin access, telephone disclosure requires explicit `manageVolunteers`
  or `manageDropOffs` capability and target membership in that same project. The project
  belongs to the server-resolved active hub, and neither project nor organisation may be
  archived. Scoped HubAdmin alone grants no phone access.
- Contact permissions are enforced before response shaping, including direct
  admin-profile reads and member search. Denied telephone fields and email verification
  metadata are omitted.
- Directory rows retain name, username, avatar, attribution, joined date, locale and
  archived/active status. Search results remain mounted during replacement loads.
- Contact-presence filters support any / yes / no for email and phone, combining with
  text search and archived state before pagination and total counting. Null, empty and
  whitespace-only values count as missing. Filtering does not grant contact disclosure
  permission.

## Place Identity Review (Refs #194)

Identity administration acts on the persisted Place, not on a Feature's edit rights. For
a private Place, read its owner project from the minimal Place probe, resolve that
project's persisted ancestry, and require the existing project management permission
used for Place policy updates. Translators and ordinary Feature editors cannot gain
identity administration through a Feature link. Shared Places require a core hub admin;
non-core hub administrators have no authority over globally shared source identities.
Guests cannot prepare, read or accept these reviews.

Authorize before reading private comparison facts or requesting upstream source data.
Reauthorize current ownership when accepting a retained review. Clients submit only
Place/review IDs and a reason; actor, owner scope, concurrency baseline and canonical
projection are server-derived. Private ownership is preserved by promotion. Identity
acceptance does not authorize source fact/location adoption or merging another Place.
The technical workflow is defined in
[Places and Features](../../spec/breadline/proposal/01-places-features.md).

Place merges require independent administration of BOTH the surviving and absorbed
Place. The second identity is resolved from retained source/merge evidence, never
supplied by the client. Preparation, impact reads and confirmation each probe both
current owner scopes and apply their existing private-project or shared-core-admin
policies. Authorization of the survivor does not grant access to the other Place's
retained baseline or affected Features. The impact response exposes a count and retained
visibility, not other Feature contents. Roles and ownership are rechecked at submission,
and privacy-incompatible merges remain blocked even for a core administrator; merging
does not authorize publishing private history.

## Publication preview

Organisation, project and layer editors expose **Preview** beside their publication
controls. Access is inherited from scoped management roles, with no new assignable
capability: project Maintainer/Owner, organisation Owner, or relevant hub admin. Members
and translation-only users cannot preview. Project roles do not grant upward
organisation access. The server resolves persisted ancestry and checks the role on every
hierarchy, feature-page and feature-detail request.

Preview carries explicit `publicationPreview` intent in request metadata, separately
from `isAdminRequest`. The normal public response profiles and map renderer are reused.
The same saved `localIsPublished` restoration expression used by publication writes
controls preview visibility; the all-children option includes saved unpublished
children. Archived rows and unsaved feature drafts remain excluded. Previewing a child
includes unpublished ancestors as hierarchy context only. It does not include sibling
resources, grant upward editing rights, or write parent publication state.

The admin app icon opens published Features through the normal public URL. For an
unpublished saved Feature it enters a feature-scoped preview with full navigation. This
preview includes only that Feature and its persisted ancestors, using the same
management-role checks. It simulates publication without requiring an existing published
revision or changing saved publication state; archived rows and unsaved drafts remain
unavailable.

Preview intent participates in retained entity scopes, query identities and cursors.
Native remote responses are `private, no-store`. Entering and exiting use full
navigation to dispose the previous map state. Private previews never regenerate public
map-render assets or change publication, attribution, review state or timestamps. The
map displays a persistent preview banner and a return link to the resource editor.

Feature visibility follows the agreed matrix: Members see published/non-archived;
Maintainers see either publication state but no archived rows; Owners see either state.
Feature edit authorization enforces the same archive boundary. Existing translation-only
editing remains field-restricted and does not grant publication preview.

## Organisation revision history

Organisation history uses the existing organisation update policy, including scoped hub
administration and organisation ownership. Published-resource read access, organisation
membership, and project roles alone do not grant history access. The history API probes
current ownership, authorizes the caller, and repeats the persisted nullable hub
predicate in the history query. Callers cannot supply the hub scope or attribution.
History contains profile/configuration comparisons, not staff role grants. Reparenting
invalidates a read authorized against the former hub.

Field-definition history uses that same organisation editor policy and current hub
predicate. Independent organisation option appends carry the authenticated actor and the
probed owner/hub into the transaction; client-supplied owner or actor IDs are not used.
The append also advances the parent edit token so older complete-catalogue forms fail
their existing concurrency check.

Project, layer and hub profile history uses the corresponding resource update policy
with a profile-translation submission probe. Public read permission alone is not
sufficient. The API derives all ancestry from persisted probes; clients submit only
resource type, identity and pagination cursor. Project history rechecks organisation and
nullable hub scope in the final read. Layer history additionally rechecks its project
and consistent project/organisation ancestry. Hub history is identity-scoped. These APIs
expose profile snapshots, not role grants or subscription credentials.

## User access overview

### Admin contribution visibility

Admin user profiles include non-draft, non-archived contributions on unpublished
Features or layers when the viewer has live management authority through the relevant
hub Admin, organisation Owner, or project Owner/Maintainer role. Core hub Admin remains
global. Private records require consistent, non-archived layer/project/organisation
ancestry; Member/User roles and profile-edit permission alone do not grant this access.
Public contributions retain their existing hub visibility. Public profiles remain
published-only.

Profile counts, paginated Feature/photo lists and recent preview strips use the same
scope. Unpublished photo assignments additionally require management authority over
their parent Feature. Counts are labelled contributed Features/photos, and unpublished
Feature rows carry a status label. Unsubmitted tasks and draft Features are excluded.

### User change log

The admin user profile's Change log tab requires the subject to be a current,
non-anonymous, non-archived admin-panel user. Removing their last qualifying staff role
hides the tab and denies subsequent history requests; immutable resource history is
retained. Baseline organisation/project `user` membership never grants admin access.
Admin entry explicitly recognizes hub Admin, organisation Owner/Member, and project
Owner/Maintainer/Translator/Member roles; unknown role values fail closed.

History visibility belongs to the viewer, independently of profile-edit permission:
organisation Owners see their organisation and descendants; project Owners/Maintainers
see their project and descendants; hub Admins see their hub and descendants. Existing
core-hub administration (the session-derived SuperAdmin flag) remains global.
Organisation Members/Users and project Members/Users/Translators grant no history scope.
Project Maintainers cannot inspect archived resources. A delegated history capability is
deferred.

Each user-feed SQL branch repeats live subject eligibility, viewer roles and consistent
current ancestry before pagination and filter metadata. User/restore changes attributed
to the subject participate, alongside migration baselines whose retained
reviewer/contributor matches the same actor identity used by the resource changelog.
Baselines keep their migration origin, initial-snapshot label and contributor/reviewer
attribution; the enrollment job is not presented as their edit. Accepted profile,
field-catalogue, Feature publication and private-maintenance journals supply the feed.
Feature comparisons retain current internal-field privacy. Unaccepted drafts and edits
predating those journals are excluded.

### Direct assignments

The admin user page's Access tab lists direct hub, organisation and project roles,
including organisation-user membership and explicit project capability assignments.
Management permissions are evaluated through the existing resource policies using the
subject's current roles. Inherited access is explained separately; the overview does not
manufacture child assignments or enumerate implicit public access. Capability
availability is shown separately from the stored assignment.

An authenticated admin-panel viewer may inspect their own assignments. Core/SuperAdmin
viewers may inspect all assignments. Other viewers only receive assignments for
resources whose roles they can manage, evaluated against persisted ancestry. Profile
edit permission does not expose unrelated memberships. Hidden assignments and their
counts are omitted from the response. The overview is read-only; existing resource
editors retain assignment and capability mutation authority.

## Image URL delivery

Image bytes use discovery-based access. Task, Feature and image-list APIs enforce
permissions when revealing image URLs; possession of an opaque immutable image revision
URL grants delivery without a session, role or publication check. This includes retained
proposal, historical and archived image addresses. Successful delivery is publicly
cacheable; hiding or archiving a record removes discovery, not access to an
already-known image URL. Image edits, review decisions and full metadata APIs retain
their authorization.

## Feature transfers and organisation Location definitions

A Feature transfer requires source Feature-update and destination Feature-create
permission. Copying or reusing organisation-specific Location definitions additionally
requires destination organisation management permission; project grants do not confer
that authority. The server copies only accepted correction pins and placement evidence,
retains shared identities and address revisions, and clones source-owned local Locations
with provenance. Existing conflicting destination definitions reject the transfer.
Evidence copies, association replacement, parent changes and the accepted Feature
revision commit in one guarded batch. Source definitions and historical pins remain
unchanged. Destination ancestry and definition heads are checked inside that batch; role
authorization follows the request-time checks used by other commands.

## Location correction authority and precedence

Location values resolve in order: upstream evidence, accepted community curations, then
Organisation customizations (including explicit suppression). This supersedes any older
rule that routes all Location corrections to the Organisation layer.

An explicit edit of the universal `phoneNumber` property through a linked Feature
requires Feature property-update permission and Organisation correction authority. It
writes an Organisation override in the same atomic Feature save. An explicit per-field
Community mode also contributes a community revision under community authority and
curation locks, pinning only authored fields; Internal mode writes only the override.
The author retains its override through that revision. Later community revisions use
adoption policy: accepting releases only affected overrides; review or rejection retains
them without changing the whole Location to an internal record. Clearing the value
records an explicit empty override; resetting records inheritance and materializes the
phone from the Feature's accepted Location evidence. New community revisions still
follow adoption policy. Immutable actor-attributed history and concurrency checks remain
in force. Unlinked phones, WhatsApp and custom phone properties remain Feature-owned.

Community corrections, including names, addresses, brands and communications, require
Project editing authority through the Feature-scoped command or Organisation management
authority through the standalone directory command. SuperAdmin may also contribute.
Feature-scoped community contributions also require Organisation authority because they
retain an Organisation override. Internal customizations require Organisation authority.
Client-submitted owner IDs or field labels never establish permission. Apply the same
checks to direct saves, reset operations and staff acceptance of third-party task
proposals.

Every shared correction retains the original source evidence, source revision,
replacement or suppression, actor and time. Correction revisions are immutable.
Unchanged or omitted upstream contact evidence retains the correction. Changed upstream
contact evidence supersedes it durably; agreement retires a redundant correction. A
later upstream reversion must not reactivate a retired correction. Community identity
curations remain until explicitly reset. Organisation retain/follow policy applies above
the shared layer. Accepted Feature revisions pin the evidence they adopted; reading
history must never substitute the current head.

The standalone Location editor exposes the Community destination to permissioned
Organisation managers and SuperAdmin for community Locations. Internal saves
Organisation customizations, even for SuperAdmin. The edit destination does not change
Location visibility. Internal Locations cannot receive community writes. Both commands
recheck authority and displayed revisions on the server.

Staff may accept a subset of a third-party proposal's fields. The server accepts only
fields present in the retained proposal and checks each field's destination authority.
The immutable merge receipt records the selected patch and reviewer. Unchecked fields
remain unchanged, and the decision completes that proposal.

### Organisation-wide Location adoption

Accept and Keep-current decisions in the accepted Feature history workflow require
Organisation management authority from the initiating Feature's persisted ancestry.
Feature editing authority alone does not grant permission over sibling Projects.
Automatic acceptance executes the persisted Project policy and synchronizes the accepted
fields across its Organisation. Every affected Feature revision and the Organisation
customization revision share one atomic, concurrency-fenced batch. Other Organisations
are excluded. Acceptance releases affected customizations; Keep-current stores explicit
retained values or suppressions. Independent Feature names and placements remain
separate.
