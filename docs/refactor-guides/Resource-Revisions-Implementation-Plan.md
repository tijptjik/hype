# Resource revisions implementation plan

## Objective and agreed scope

Give organisations, projects, layers and features stable identities with immutable
content revisions and attributable editing history. Organisations, projects and layers
are admin-edited and have one current revision; saves take effect immediately subject to
existing visibility gates. Only features have unpublished proposal revisions, a
published head and user contributions. Acceptance merges and publishes atomically.
Feature review stores references and decisions, not a second copy of the proposed
content.

The priority is knowing who changed what and reviewing changes before publication.
Project release manifests, historical application playback, bitemporal queries and
descendant revisions caused solely by inherited settings are out of scope.

This is an execution specification. Implementation and acceptance evidence belong in
GitHub issues, not a second local progress ledger. Before implementation, map affected
Breadline work to the existing tracker (#178 and relevant #179–#187 parent and leaf
issues); use a separately scoped issue for cross-resource work if needed. Do not invent
a leaf issue association. Link relevant technical changes back to
`spec/breadline/proposal/`, particularly `01-places-features.md` for feature/location
integration. No implementation or rollout is claimed by this document.

## Design decisions

### Identities and content

Use resource-specific tables: `organisationRevision`, `projectRevision`, `layerRevision`
and `featureRevision`. Keep existing resource IDs and external references stable.
Organisation, project and layer identities have `currentRevisionId`. Feature identities
have a nullable `publishedRevisionId`. Unpublished work belongs to independent
proposals. There is no accepted-but-unpublished working head. Public feature content
comes only from the published head. Other resources serve their current revision when
their existing visibility gates permit it.

Each revision has an opaque ID, resource ID, predecessor references, change-set ID and
payload schema version. The change set supplies actor, server timestamp, origin and
reason. The published pointer is authoritative; neither ordering timestamps nor taking
the largest revision ID selects published content. A monotonic head generation fences
unpublish/republish cycles as well as content changes.

The first persistence layer stores the complete authored aggregate in a versioned JSON
snapshot. Identity, parentage, review decisions and publication are typed relational
columns with same-feature composite foreign keys. Gallery pins are derived into typed
rows by an insert trigger, checked against the immutable snapshot. Existing normalized
application tables remain public query projections. Resource-specific capture, schema
validation and complete projection adapters are required before application cutover;
this storage envelope alone does not establish the full authored-content boundary.

Revision-owned translations include generated/manual flags. Feature property values,
layer field assignments, relevant image associations/order and authored configuration
must be included in the content boundary. Retain the property label/type/option context
needed to explain historical changes; global property-definition revisions are a
separate scope decision during the field inventory. Do not duplicate binary media.
Preserve references or a tombstone when referenced media is removed.

Identity tables eventually hold IDs, creation metadata and head pointers. Retained
legacy content columns are explicitly current-state projections during migration, not
independent writable sources of truth.

### Feature contributions and review

This workflow applies only to features. Other resources have no contributor proposals or
content review queue.

Independent contributors retain separate proposal heads. Use one edit proposal per
contribution, referencing candidate revisions in the same typed revision tables. A
proposal contains resource identity, contributor, base revision, candidate head,
workflow state and timestamps. Use typed proposal-to-revision links with enforced
same-resource foreign keys rather than unchecked polymorphic IDs.

Saving a proposal creates another immutable candidate revision. It does not change the
published head. Submission freezes the candidate being reviewed; amendment creates a new
version requiring a new submission. Review decisions reference the exact submitted
revision and retain reviewer, time and reason. Persist workflow transitions in
append-only events; the current status is a projection.

Initial states: draft, submitted, accepted, rejected, withdrawn. Rejected or withdrawn
content remains attributable. A replacement proposal may reference its predecessor.
Existing feature tasks may link to this workflow while retaining their task semantics.

Acceptance performs a three-way comparison of proposal base, submitted candidate and
current published revision. Apply only proposed differences to current published
content. Unrelated staff edits must survive, when the contributor started from an older
published revision. Overlapping changes require explicit resolution. Initially accept or
reject a whole proposal; a reviewer-modified resolution becomes a new attributed
revision with source proposal provenance.

Acceptance publishes the candidate directly when its base is still current and no
reviewer changes are needed. Otherwise it creates and publishes a merge revision with
the current published revision as mainline parent and the candidate as proposal parent.
Preserve contributor and reviewer identities separately. Staff with direct edit and
publish permission may perform the same guarded acceptance in one operation.

### Publication and access

Feature acceptance checks the exact submitted candidate and current published head, then
atomically writes the merge result if needed, the review decision, publication event and
public projections. Rejection writes only the decision and leaves the public head
unchanged. A concurrent publication invalidates the reviewed comparison; the whole
acceptance must abort and refresh, never silently recompute an approved result.
Unpublishing clears the public head with an attributed event. Organisation, project and
layer publication remains a visibility operation on current content, without a second
content head.

Content heads do not replace live authorization. Ownership, hub scope, archive state,
role grants, capability enforcement and publication eligibility must use current
authorized control state. Snapshot their changes for attribution, but do not defer
revocation or archival until content publication. Restoring historical content must not
restore historical privileges or parent ownership implicitly.

Classify every field before moving it: editorial content, live control state,
relationship, or derived projection. In particular, hub assignment, ancestry,
capabilities, licence and location policy require explicit rules; do not let a
translation approval change them. Current ancestor visibility and archive gates still
apply to published descendants. Parent cascades remain explicit atomic commands.

History and proposals are private by default. Current permissions govern access;
contributors can read their own permitted proposal without gaining access to private
proposal fields. Construct candidate snapshots server-side from an authorized base and
an allowlisted patch. Restrict translation proposals to allowed locales and fields. Do
not return hidden fields in conflict reports or diffs.

### Attribution, relationships and location integration

A shared `changeSet` records actor, origin, reason, request/idempotency identifier and
timestamp for a logical operation. Separate human authors, reviewers and system jobs; do
not attribute imported baseline content to the operator as its original author. Retain
non-sensitive attribution identifiers after account deletion without cascading history
deletion; follow existing privacy deletion requirements for personal content.

Record parent moves as explicit relationship/control changes with before/after IDs.
Retain the current denormalized organisation/project/layer ancestry for authorization
and indexing, updating it atomically. A normal content restore cannot move a resource.
Role grants and revocations get their own attributable events, outside profile content.

Feature revisions pin accepted location facts, organisation corrections, occupancy,
address and association evidence using existing location revision identifiers. Upstream
refresh creates available evidence; adoption creates a feature proposal; approved
adoption publishes its result. Public feature reads continue using the published
feature's accepted references. Reuse existing location histories rather than replacing
their provenance.

Inherited setting changes create a parent change only. Derived spatial indexes,
effective visibility, counts and search documents remain rebuildable projections. Record
source revision IDs on content projections so drift can be detected.

### Feature identity merges and splits

An ordinary edit remains scoped to one feature ID. Cross-feature identity changes are
explicit multi-resource operations, not exceptions to same-feature foreign keys. A
`featureIdentityOperation` is the accepted merge/split receipt with change-set
provenance and immutable input/output revision links. Pending identity-operation review
needs its own immutable submitted operation manifest; ordinary single-feature proposals
do not stand in for that multi-resource review. Each input records feature ID and the
exact published revision inspected; each output records its feature ID and result
revision. Acceptance requires current authority over every affected scope and atomically
guards all input heads, writes output revisions, updates lifecycle/redirect state and
records publication. Any stale input aborts the whole operation.

Revision ancestry and identity lineage are distinct. Edit merge parents belong to one
feature. Identity-operation input/output links explicitly span features. The operation
supports multiple inputs or outputs without weakening ordinary revision constraints. A
merge must retain one input identity and redirect the absorbed identities to that
survivor. A split either retains the source identity as one child or retires the source
and publishes new child identities. Retired split sources have multiple successors, not
an arbitrary one-target redirect. Source retirement and child publication are atomic,
and retired sources cannot be republished by ordinary visibility cascades.

Tasks, visits, contribution ownership, imported crosswalks, locations and operational
records must be classified before moving references. Historical events retain original
feature identity. Do not automatically copy roles, merge upstream location identities,
or redistribute quantities. The review must include a per-relation disposition and
selected gallery allocation. An ambiguous relation blocks acceptance pending resolution.

### Image and gallery evolution

Separate immutable file versions, image metadata revisions and feature gallery entries:

```text
imageAssetVersion
  id, imageId, immutableStorageKey, contentHash, mediaType, byteSize
imageRevision
  id, imageId, previousRevisionId, changeSetId, assetVersionId
  metadata snapshot (attribution, capture data, presentation settings)
featureRevisionImage
  featureRevisionId, imageId, imageRevisionId, position, intent
  feature-specific caption/alt translations and presentation overrides
```

Every feature revision pins its complete gallery. Add/remove/reorder and feature-local
caption changes create candidate feature revisions. Global image metadata changes create
image revisions; existing published galleries retain their pinned metadata until an
accepted proposal adopts the change. Pixel replacement, crop or rotation that changes
stored bytes creates a new immutable asset version; never overwrite a pinned object key.
Derived renditions can be regenerated from that immutable source with versioned keys.

Removing an entry only removes that gallery membership. It does not delete the image,
bytes or old revisions. Permanent privacy/moderation removal is a separate live access
control operation, overriding all historical/public references and preserving a
tombstone. Private candidate assets must not become publicly retrievable merely by
guessing a URL; asset delivery policy and caching must be verified before enabling
contribution uploads.

Match gallery entries by stable image ID, not array position. Metadata edits to
different entries can merge; remove-versus-edit conflicts. Gallery ordering is one
atomic field initially: competing reorders or add/reorder conflicts require explicit
review. Validate exact membership/order correspondence, unique positions and
canonical-image rules after any merge. Identity merges deduplicate selected gallery
entries by identity and require explicit metadata/order decisions; split outputs
explicitly select/share references.

## Concrete attribution model

The following is a logical schema; typed foreign keys and payload columns are expanded
per resource during implementation.

```text
organisation / project / layer
  id, createdAt, currentRevisionId
  current live control state

feature
  id, createdAt, publishedRevisionId?
  current live control state

changeSet
  id, actorId, recordedAt, origin, reason?, requestId

organisationRevision / projectRevision / layerRevision
  id, resourceId, previousRevisionId?, changeSetId
  schemaVersion, full typed content snapshot

featureRevision
  id, featureId, previousRevisionId?, changeSetId
  sourceProposalRevisionId?, restoredFromRevisionId?
  schemaVersion, full typed content snapshot

featureEditProposal
  id, featureId, contributorActorId, baseRevisionId
  candidateRevisionId, status, createdAt

featureReviewEvent
  id, proposalId, submittedRevisionId, changeSetId
  action, reason?, resultingPublishedRevisionId?

featurePublicationEvent
  id, featureId, previousPublishedRevisionId?, publishedRevisionId?
  changeSetId, action
```

All resources may record a restore source; it is shown on featureRevision above as an
example. Revision-owned translation/value/media rows reference their revision ID. Review
events include submission, acceptance, rejection and withdrawal; actor/time come from
the event's change set. Submitted content is frozen by its revision ID. Publication
events describe publish/unpublish and never overwrite previous events.

`actorId` refers to a durable audit actor: a human account, named system process or
migration actor. Its optional link to a live user can be cleared without deleting
attribution records. Avoid copying personal profile/contact details into every event.
The exact actor retention policy must align with account-deletion requirements.

The editor is the revision's change-set actor. The reviewer is the acceptance/rejection
change-set actor. The publisher is the publication change-set actor. An integration
revision is attributed to the accepting actor and links the original submitted revision,
preserving the contributor's authorship separately. A revision snapshot does not mean
its actor authored every unchanged field: before/after differences identify their edit.

For example, a user creates candidate r11 from published r8, then another proposal
publishes r10. Acceptance creates r12 from r10 plus the proposed changes, linking r11,
and atomically moves the public pointer from r10 to r12. The contributor retains edit
attribution; the accepting reviewer is the publisher. No separate suggested-content
payload is stored.

## Persistence invariants

- Enforce unique resource/revision pairs and same-resource predecessor/head links.
  Branching is allowed: do not impose a single-successor constraint on all revisions.
- Enforce append-only revision payloads and child rows, including against accidental
  direct SQL updates. Define controlled privacy erasure separately from normal edits.
- Save revision, child rows, events, head advancement and required projections in one
  guarded D1 batch. A stale head or ancestry guard aborts the whole operation.
- Advance head generations with exact expected-token guards; never infer the current
  published revision from timestamps or a maximum revision ID.
- Guard submission/acceptance against candidate changes and duplicate decisions; retries
  must not create duplicate approvals or publications.
- Compare real authored payloads for no-op saves. No-op saves create no revision.
- Archive instead of cascading deletion through retained history.
- Keep actor attribution and content provenance separate from current user profile
  display data. A missing user must not make a historical revision unreadable.

## Persistence integration boundary

`0171_feature_revisions.sql` defines immutable feature snapshots, publication heads,
proposal workflow, review/publication history and identity-operation receipts.
`0172_image_revisions.sql` defines immutable asset/metadata versions and gallery pins.
They are additive: applying them does not backfill records or enroll existing writers.

The services under `src/lib/db/services/featureRevision.ts`,
`featureIdentityRevision.ts` and `imageRevision.ts` prepare guarded D1 batches. Callers
must supply server-built authorization/ancestry and captured-projection predicates,
complete domain validation, and public projection writes with a verification predicate.
Never expose these internal contracts as raw client-supplied SQL or snapshot APIs.
Unchanged draft saves retain the candidate; submitted candidates are frozen. Retried
terminal decisions cannot create duplicate acceptance/publication records. Transport
idempotency for draft creation still belongs in the API integration.

A first draft can be accepted against a never-published baseline with generation zero.
An unpublished formerly public identity cannot use that shortcut to bypass reviewed
republication. New split children must be unpublished draft identities with unused
heads. Identity-operation output candidates are separate from ordinary edit proposals.

The persistence slice precedes the resource vertical slices below so concurrency,
identity lineage and media constraints can be exercised independently. It does not
replace the required writer/read inventory, UI integration or migration rehearsal on a
representative application copy.

## Implementation sequence

### Phase 1 — Inventory and executable contracts

Inspect all writers/readers for the four resource schemas, I18n, property/image joins,
imports, jobs, publication cascades, archive/restore, clone/move, location adoption and
feature contribution tasks. Start with `src/lib/db/schema/`, resource services,
`featureFormSave.ts`, `publication.ts`, `taskContribution.ts`, `revisionBatch.ts`,
resource remote APIs, public feature queries and map render paths.

Produce a field classification and command/read matrix in this guide's companion
technical documentation. Identify proposal versus public read contracts explicitly. Load
the Cloudflare/D1 and applicable query-batching guidance before implementation. Confirm
the current database schema and migration numbering instead of relying on a previous
checkout snapshot. Preserve concurrent work on `preview`.

Exit: every write path and security-sensitive field has an owner and defined semantics;
fixtures cover draft edits to already-published content and parallel translation
proposals.

### Phase 2 — Shared infrastructure and organisation vertical slice

Add additive migrations, change sets, typed organisation revisions, revision-owned
translations and a current head. Implement snapshot/diff helpers and guarded admin save
commands. Reuse existing transaction guard patterns after validating semantics. Record
visibility/archive operations without introducing editorial draft heads.

Capture a migration baseline atomically on each existing organisation's first attributed
mutation, preserving its prior content and identity. New records receive one authored
root. A bulk enrolment rehearsal may be added before rollout; applying the additive
migration alone does not enrol existing records. Unknown historical authors remain
unknown; overwritten legacy content cannot be reconstructed.

Route organisation reads to current content. Add history/diff UI using existing
component boundaries. Do not add user translation proposals to organisations.

Exit: an authorized admin save immediately advances current content and retains an
attributed prior snapshot; stale saves cannot overwrite concurrent changes; existing
visibility and archive behavior is preserved.

### Phase 3 — Projects and layers

Apply the proven infrastructure to project and layer content, translations and field
configuration. Preserve current licence, capability, relocation-policy and hierarchy
semantics according to the field matrix. Move/transfer commands retain their own
authorization and atomic ancestry checks. Update publication/archive cascades without
manufacturing child content revisions solely for inherited state changes.

Exit: both resource types support immediate admin edits and attributable history; parent
visibility and access changes still take immediate effect as intended.

### Phase 4 — Features and existing contribution workflows

Application integration is governed by the
[Feature write-boundary inventory](Feature-Revisions-Write-Boundaries.md), including
child-only drift, shared Location corrections, catalogue cascades, task evidence,
immutable media and the confirmed staff-draft/automatic-adoption decisions. The source
reader and merge safeguards are preparatory; Feature recording is not enabled by those
changes.

Add the feature published head, proposals, review events and publication events.
Implement guarded save/submit/accept/reject/publish/unpublish commands. Backfill the
published heads for currently published features and draft proposals for unpublished
features, retaining current visibility/archive gates. Previously overwritten published
content cannot be reconstructed.

Revision feature content, values/translations and relevant media joins. Integrate
`featureFormSave`, location adoption, current task review actions, imports and system
writers. Link feature tasks to revision proposals where applicable, preserving task IDs
and existing evidence. Keep photo/missing-report semantics distinct from translation
proposals. Do not silently replace unrelated task workflows.

Separate proposal previews and published feature projections, including geometry, text
search, filters, property queries, map output, image selection and counts. A query that
joins published identities to candidate values still leaks drafts and fails the phase
gate.

Exit: proposals remain private until acceptance, which publishes atomically; public
maps/search/cards consistently use published content; all writers create history.

### Phase 5 — Cutover and operational verification

Rehearse migrations on a disposable database copy with FK checks, row counts, snapshot
comparisons and interruption/retry cases. Coordinate backfill with writers through a
maintenance window or guarded catch-up process; do not switch readers to partial data.
Cut over complete resource slices rather than leaving mixed public/proposal joins.

Make compatibility columns transactionally maintained projections. Detect any remaining
direct writer and remove duplicate sources of truth only after parity is demonstrated.
Do not remove old columns in the initial additive migrations.

Rollback must preserve new revision data. Prefer disabling new writes and rolling
forward; old application code that overwrites compatibility rows is not a safe rollback
after revision writes begin. Document recovery and backup receipts before rollout.
Commit, push, remote migration and deployment remain separately scoped operations.

## Validation and completion criteria

Run heavy checks through `dev-check`; use focused service/database tests and the
repository's installed Playwright with authenticated admin access for browser checks.

Required evidence includes:

- Baseline migration preserves IDs, current public content and all owned child values.
- Revisions and child rows resist mutation; cross-resource pointers are rejected.
- Simultaneous saves, stale proposals and replayed requests cannot lose changes.
- Fault injection rolls back snapshots, heads, decisions and projections together.
- Two proposals from the same base survive independently; non-overlapping integration
  preserves staff edits; overlapping edits require resolution.
- Translation contributors cannot edit protected fields, see private proposal content,
  approve themselves without authority, or accept without publication authority.
- An existing published feature stays unchanged through draft save and submission, then
  changes atomically on acceptance. Rejection leaves it unchanged. Unpublish and archive
  hide it correctly.
- Current ancestry/permissions are rechecked for review, publish and restore commands;
  resource moves cannot reuse authorization from an old scope.
- Public maps, search, images, filters and counts never expose proposal-only content.
- Location adoption retains original source evidence and accepted revision references.
- Deleted accounts, removed media and unknown baseline authors do not break history.
- Admin-only resources reject user contribution attempts and expose authorized edits
  immediately through their current head, subject to visibility gates.
- Browser checks demonstrate feature draft/save/submit/accept-and-publish, readable
  locale diffs, history attribution and stale-edit recovery on narrow and desktop
  layouts.

Completion requires passing evidence for every migrated writer and public read path,
updated authorization/component documentation where contracts changed, and accurate
linked issue acceptance records. The first application vertical slice is organisations
end to end; subsequent phases depend on that slice proving the shared model.

## Organisation write integration evidence (2026-11-05)

Migration 0173 and the application capture adapter are implemented but not applied to
the running database. Attributed organisation creation, form saves, publication,
archival, hub assignment changes and logo uploads capture their before/after profile
inside the existing atomic batch. The authenticated remote handlers supply the actor;
clients cannot choose the history actor. Existing records receive an explicitly
unknown-author migration baseline on their first attributed mutation. New records
receive one authored root. Unchanged snapshots do not advance the head.

The aggregate includes profile fields, translations, user-policy configuration and
property assignment/order. It excludes role grants and user membership lists. Current
normalized tables remain transactionally maintained read projections. Enrolled
organisations reject direct writes outside capture. Without migration 0173, the adapters
retain existing behavior; partial installation fails closed. This is staged
compatibility, not evidence that every writer is migrated.

Real SQLite/D1-adapter tests exercise application creation/update, stale saves,
late-failure rollback, raw-write rejection, no-op saves, 150 hub assignments within the
query binding budget, and logo upload replay. Migration/schema contract coverage
includes organisation revisions and foreign keys. These checks do not establish
production D1 rollout or browser acceptance.

Remaining organisation work at that checkpoint: authorised history/diff reads and UI,
full writer audit (including property-definition deletion and organisation deletion),
disposable-copy migration rehearsal, and deliberate activation. Do not apply 0173 until
these paths are reconciled: legacy deletion or indirect mutation of an enrolled record
fails closed. Project/layer conversion and the feature review UI remain separate
unfinished phases.

### Organisation history read/UI increment

The existing organisation admin screen now has an editor-only History tab, using the
shared Updates facet with an organisation-specific label. It consumes
`organisationHistory.remote.ts` and the persisted revision/change-set tables rather than
building history from the current projection. Reads use the organisation update policy
and repeat the authorized hub scope in SQL. Ten-entry cursor pages include durable
actor, time, reason and predecessor comparisons. Initial captures explicitly have no
earlier comparison; removed values are distinct from null values.

The UI refreshes through the existing remote-query helper, ignores responses after
navigation, and clears evidence on a failed authorization/read. Migration absence is
shown as unavailable tracking, separately from an empty history. Existing edit forms
continue through the atomic capture adapter; this increment does not activate the
migration or introduce a second editing form.

Live browser acceptance remains outstanding because the browser-access host was
unavailable. Component interaction tests exercise comparison display, pagination,
refresh failure and navigation races. The selected Svelte check traverses existing
dependencies with unrelated type/missing-module errors; no clean app-wide check is
claimed.

### Local SaanSeoi demonstration (2026-11-05)

At the user's request, migrations 0171 and 0173 were rehearsed on a WAL-safe copy, then
applied atomically with synthetic history to the local `hype-db-local` database.
Migration 0172 (image history) and unrelated pending migrations were not applied. The
seed uses the existing organisation capture service with explicit `system` origin and
`synthetic:local-demo` attribution: English description, display name/Traditional
Chinese description, then restoration of the original values. The final organisation row
and translation rows match their pre-seed values exactly. The baseline and three changes
remain inspectable in History. A private backup, rehearsal copy and seed script are
retained under `.local/revision-history-demo/`; the seed refuses repetition.

The existing admin persona on port 4179 successfully loaded the History tab and its API
returned all four entries. This verifies the local runtime read path against the same
database used by `hype.localhost`; it does not establish production readiness.
Organisation capture is now active locally for attributed application mutations. The
remaining writer audit still gates wider rollout. No remote migration occurred.

### Organisation logo removal and retention increment

The existing Image viewer's organisation action now says Remove and explains that the
media is retained for history. It uses the existing authenticated delete API, which
delegates organisation contexts to an atomic pointer-detachment service. The service
fences the authorized image/scope, captures the organisation revision, clears the
current logo and verifies the final state in one batch. A stale request, ignored pointer
update or late history failure rolls back the entire operation. The viewer's existing
optimistic update and rollback path remains in use.

Replacement cleanup now checks immutable organisation snapshots inside its DELETE
predicate. Hard deletion through another context also refuses images retained by
organisation history, before touching task evidence or associations. This closes the
previous path that could delete old logo files after replacement. Organisation removal
never schedules asset cleanup.

169 focused service/API tests passed, including stale/ignored/failed removal, retained
detached logos, cross-context deletion protection, and unchanged adjacent image
workflows. Browser verification through the existing admin persona confirmed the Remove
label and retention confirmation; the dialog was dismissed, preserving the real SaanSeoi
logo. This does not yet version logo pixel/metadata edits or expose historical media
previews. Full immutable image delivery remains a later phase.

Writer audit so far: organisation create/form/publication/archive and hub assignment
writes use capture; user policy writes are composed into the organisation form; property
assignment replacement is also inside that form transaction. Physical organisation
deletion has no current application command (the UI archives). Unused legacy low-level
organisation helpers still fail closed on enrolled rows. Property definitions and
mutable image metadata need their own revision integration; the organisation snapshot
currently records property assignments and image identity.

### Organisation field-definition history increment

Migration 0176 adds immutable, owner-scoped property-catalogue revisions and a current
head. Each snapshot retains stable field/option IDs, typed definition metadata,
translations and option ranks. Deleted definitions remain in preceding snapshots; this
records change evidence without introducing automatic restoration of feature values or
permissions. Rank assignments still belong to the parent organisation snapshot.
Shared/hub definitions are not copied into descendant organisations.

The existing organisation create/save paths pass the authenticated actor into
preparePropertyCatalog; its capture statements run inside the parent form batch. The
independent appendPropertyValues API now captures organisation-owned options, rechecks
the probed organisation/hub scope in that transaction and advances the organisation edit
token. An old Fields form cannot erase newly appended options. Unconverted direct
writers fail closed once their owning catalogue is enrolled.

The existing History UI has Profile/settings and Field definitions categories, using the
same editor policy and current-scope SQL fence. Field history includes removed
definitions, readable field labels and exact predecessor comparisons.

0176 was rehearsed against a WAL-safe local database copy, then applied to local
hype-db-local only. Existing property/translation/option/assignment rows were unchanged;
integrity and foreign-key checks passed relative to the original state. No catalogue was
enrolled merely by applying the migration. Private backup and rehearsal files are under
.local/property-catalog-history/. Headless admin browser verification confirmed the
enabled field-history category and preserved profile history without mutating field
content or opening visible windows.

Hub/project catalogue storage is supported by the schema, but those application writers
are not yet enrolled. Project/layer entity revisions and immutable image pixel/metadata
integration remain outstanding.

### Project, layer and hub command integration (staged)

Migration 0177 adds separate immutable revision, head and transaction-local write scope
tables for projects, layers and hubs. The shared admin capture adapter retains
unknown-author baselines for existing records, attributed roots for new records, no-op
detection, same-owner predecessor/head foreign keys and projection write guards. The
migration is **not applied locally or remotely**. Do not apply it until the remaining
writers below have been integrated and rehearsed.

The existing authenticated create/form/save APIs now supply the actor to the existing DB
transactions. Direct publish/unpublish and archive/unarchive commands also capture
before/after state in their existing guarded batches. Project forms capture affected
layer revisions, including project moves, inherited assignment changes and layer
rank/default visibility. Project state commands capture their layer descendants in the
same transaction. Existing normalized tables remain the current read projection.

Snapshots retain profile fields, translations, property assignments and typed values;
projects also retain map-style selection, and hubs retain layer defaults. Roles and
membership grants are excluded. Hub subscription session cookies are excluded entirely,
including historical payloads; credential-only changes therefore do not produce profile
revisions. Hub organisation assignments remain recorded on the organisation identities
by the previously integrated assignment capture.

This is a backend increment, not a complete resource cutover. Remaining activation
requirements are organisation-driven capability/publication/archive cascades,
independent property-definition and option writers (including cross-owner assignment
cascades), image upload/removal/retention, other low-level writers and authorized
History APIs/UI for these three resources. Hub/project catalogue actors are not yet
passed to catalogue capture because migration 0176 is already active locally and would
enroll those catalogues before their independent writers are ready. Effective
publication/archive fields are currently captured, so inherited state changes must also
be captured before activation; a later normalization to local-only evidence would
require adjusting both snapshot contracts and mutation guards together.

Focused real SQLite tests cover baseline/root attribution, no-op saves, stale edits,
rollback of state and history, direct-write/immutable-record guards, secret exclusion,
partial migrations, existing form commands, layer ordering, and publication/archive
commands. API tests assert authenticated attribution on layer creation. No new UI or
browser acceptance is claimed for this staged increment.

Validation for this increment: 270 tests passed across eight focused persistence,
transaction and API suites; the final 27-test new persistence suite also passed after
fixture typing cleanup. New schema/capture modules pass lint. The focused TypeScript
check reports only the existing two D1 adapter type mismatches and the pre-existing
layer property translation-shape mismatch; no clean repository-wide check is claimed.

### Project, layer and hub History UI

The existing admin screens now expose editor-only History facets. A shared
ResourceHistory viewer preserves the organisation viewer's predecessor comparisons,
expansion, pagination, relative timestamps and stale-request/error handling.
Organisation history retains both profile and field-definition categories; the new
resources expose only their implemented profile history. New-record forms do not show
history, and resource/actor changes reset the mounted evidence.

The new remote query uses each resource's update authorization and repeats current
ancestry in the final SQL read. Reads distinguish absent revision storage from an empty
history. Migration 0177 remains unapplied: the UI is available for inspection, but live
project/layer/hub save-to-history testing still requires completing the previously
listed indirect writers and migration rehearsal. No synthetic history or live
configuration changes were made in this UI increment.

Headless verification against the existing admin persona on port 4179 loaded the project
(hkghostsigns), layer (7akti7OImSFg) and hub (core) History tabs with no page errors and
correctly reported the absent migration. Screenshots are retained under
.local/admin-resource-history-ui/. The focused Svelte check reports 12 existing errors
outside the new history paths and two configuration warnings; a clean application-wide
check is not claimed.

UI increment validation: 61 History persistence/API/component tests and 26 admin
navigation tests passed. Existing organisation synthetic history also remains available
through the shared viewer; its system-origin entries display the existing human-readable
System attribution label.

### Local project/layer/hub synthetic review data

At the user's request, 0177 was rehearsed and installed on local hype-db-local only.
This supersedes the preceding notes that its storage is absent. Storage installation now
creates an explicit per-resource `adminResourceRevisionRollout` gate, disabled by
default. Capture remains off for all three resources; this gate is not a rollback
mechanism for already-enrolled identities, whose guards continue to fail closed.

Four clearly labelled synthetic revisions each were added for the HK Ghost Signs project
(YuSFnia9VOtG), its Current layer (7akti7OImSFg), and its hub (Zmr0egfhmvs-). Each
series shows a starting snapshot, an English-description example, a name and Traditional
Chinese-description example, then original values again. Every entry is system-origin
with the synthetic:admin-history-demo-2026-11-05 actor and an explicit Synthetic demo
reason. No actual edits were performed: snapshots were copied into history storage
without creating live heads or write scopes. Future rollout can capture a real baseline
independently of these demonstration chains.

The WAL-safe backup, rehearsal, guarded seed script and screenshots are retained in
.local/admin-history-demo/. Rehearsal and live seeding verified unchanged hashes for all
existing application tables (apart from additive migration receipts/change sets),
unchanged pre-existing foreign-key findings, and a successful SQLite quick check. The
seed refuses duplicate execution and accepts only the exact local database or its
rehearsal copy. History now explicitly indicates when stored evidence is visible but new
edits are not being recorded. Remaining writer integration still gates live capture
activation; no remote database was changed.

### Local activation of project, layer and hub recording

Following approval of the synthetic examples, live recording is now enabled for project,
layer and hub in the local database. This supersedes the disabled rollout status above;
migration defaults remain disabled for other databases. A fresh WAL-safe backup is
retained at `.local/admin-history-activation/before-enable.sqlite`. No remote database
was changed.

Existing admin saves now capture authenticated revisions across profile/translations,
publication/archive cascades, organisation capability changes, derived historical
layers, project location policy, and project/hub logo upload and detachment. Nested
captures share their enclosing write scope. Shared-field deletion also captures owners
affected by cascading assignment removal and advances their edit tokens so stale forms
cannot restore removed assignments. Independent field creation and option appends
capture the owner and catalogue atomically. Project and hub History now offer Field
definitions, with persisted ancestry checks on authorized reads. Detached logos remain
retained when referenced by history; these resource snapshots record image identity, not
a completed immutable pixel/metadata integration.

Validation: 448 tests passed across 15 focused suites. Follow-up location/ancestry
checks passed 103 tests, and the expanded persistence/media suite passed 38 tests (these
runs overlap and are not additive). A disposable copy of the actual local database
passed 24 transactional scenarios, including cascades, shared fields, location policy,
upload retries and image retention; heads matched projections and no new foreign-key
failures appeared. Rehearsal changes were rolled back.

Headless browser checks through the existing admin persona saved and restored an English
name in the HK Ghost Signs project, Current layer and hub. Every translation was
restored exactly, History displayed the edits, and no page errors occurred. The project
and hub each acquired a genuine baseline plus two edits; the layer acquired two edits
after its baseline was captured by the project operation. Screenshots and reports are
retained in `.local/admin-history-activation/`. A final live read verified all three
gates enabled, matching current revision heads, no leaked resource write scopes, and
SQLite quick_check reporting ok.

The focused Svelte check still reports 12 pre-existing errors and two warnings; focused
service typing retains the existing D1 adapter and layer translation-shape errors. No
clean repository-wide validation or remote rollout is claimed.

### Feature editorial backend integration

The strict `feature-content/v1` schema, baseline source adapter and guarded editorial
projection are implemented. The
[Feature write-boundary guide](./Feature-Revisions-Write-Boundaries.md#editorial-content-and-projection-implementation)
defines included related records, atomic merge groups and currently refused writes.
Server-owned translation proposals remain isolated from public rows; acceptance of an
authorized proposal updates an already-published Feature atomically. Explicit initial
publication and system attribution are supported by storage primitives. Unpublished
staff Save/Publish and policy-approved Location automation remain distinct application
integrations; shared Location corrections require separate review.

Validation: 116 focused tests pass across 11 suites. The existing disposable local
database copy converts all 219 image-free Features and passes real-trigger acceptance
and late-failure rollback scenarios, with rehearsal mutations rolled back. Focused
typing still reports only the existing two D1 adapter diagnostics and Layer property
translation-shape diagnostic. Feature enrollment remains disabled; no live Feature
heads, image baselines, new migration, remote/UI cutover or browser proof is claimed for
this increment. Immutable media delivery, dedicated Location/gallery/brand writers,
cascades/imports, application workflows and merge/split integration remain required.

### Managed deployment workflow

The deployment entry points now own schema migration, fenced baseline enrollment,
verification and activation. See
[Revision deployment](../operations/Revision-Deployment.md) for encrypted recovery,
resume boundaries and first-deployment prerequisites. Breadline integration remains
separate; existing production records are preserved, and no Breadline source import or
reconciliation is part of this rollout. Implementation and offline verification do not
imply production activation.
