# Feature revision write boundaries

This is the application integration contract for the Feature phase of the
[resource revision design](Resource-Revisions-Implementation-Plan.md). It extends the
existing proposal/acceptance persistence services; it does not activate Feature
recording. Location semantics remain defined by
[Places and Features](../../spec/breadline/proposal/01-places-features.md).

## Confirmed workflow decisions

The user confirmed these rules on 6 November 2026:

1. Keep policy-authorized automatic Location adoption, recording the system actor,
   policy evidence and accepted Feature revision in the same transaction. Human-review
   policies still queue a proposal. Never turn background source refresh alone into
   publication.
2. Keep Save and Publish separate for staff editing an unpublished Feature. Accepting a
   submitted contributor edit updates the already-published record atomically. The
   current revision service deliberately rejects acceptance on an already-unpublished
   head with generation greater than zero; restoring publication needs an explicit
   command.
3. Review shared Organisation/Location corrections separately from a contributor's
   Feature proposal. A linked-feature form currently can create such corrections via
   `saveLinkedFeatureForm`; this side effect must never occur while saving a proposal. A
   Feature proposal cannot implicitly approve or write a shared correction, even when
   the reviewer holds both permissions. Shared corrections retain their own explicit
   review and accepted evidence.

Existing agreements stand: independent proposals, whole-proposal acceptance or
rejection, accepted changes immediately published, same-feature merge parents, and
explicit multi-feature merge/split receipts. A merge retains a survivor and redirects
absorbed identities. A split may retain one identity or retire it and create new ones.

## Ownership and restoration boundary

| Tables or fields                                                                                                                          | Revision treatment                                                                                                                    | Publication / restoration rule                                                                                                                                                                                                                            |
| ----------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `feature.geometry`, `addressMeta`, `isIntangible`, `isVisitable`, `visitableAsOf`, detached brand choice                                  | Authored content, including materialized accepted Location values                                                                     | Geometry/address and visitability/date dependencies require domain validation; a candidate cannot write these projection columns before acceptance.                                                                                                       |
| `featureI18n`                                                                                                                             | All locale values and generated/manual flags                                                                                          | Preserve omitted locales. A translated value and its verification flag form one editing unit; approval cannot accidentally verify a different text. Accepted Location-projected names/address text remain consistent with their source pins.              |
| `featureProperty`, `featurePropertyI18n`                                                                                                  | Stable property IDs, classifier selection or scalar/structured value, locale values/flags                                             | A property storage choice is indivisible: never merge a classifier ID from one branch with scalar/JSON storage from another. Preserve omitted internal fields. Validate field scope, availability and current contribution permissions on acceptance.     |
| `property`, `propertyI18n`, `propertyValue`, `propertyValueI18n`                                                                          | Shared catalogue history; retain the definition/option context used to explain Feature values                                         | Label-only edits do not fan out Feature revisions. Actual cascading removal/nulling of Feature values is an attributed Feature change in the catalogue transaction, not a silent FK side effect. Old proposals cannot resurrect deleted fields/options.   |
| `featureLocation`                                                                                                                         | Accepted facts, geometry, correction, occupancy, address and membership references, Feature-specific choices and association evidence | Reuse existing immutable Location/correction/association histories. Do not infer the newest source revision at read/accept time. A pending link/unlink/adoption must not mutate this table. Keep complete dependent reference sets together during merge. |
| `featureLocationMembership`                                                                                                               | Accepted building/premises bindings and their evidence                                                                                | Commit with the accepted association and Feature geometry/address. No independently published half-association.                                                                                                                                           |
| `locationRevision`, `featureLocationHistory`, Organisation corrections, address/occupancy/membership histories                            | Referenced evidence owned by their existing domains                                                                                   | Feature restore does not overwrite shared Location records or bypass their authority. New upstream evidence is not automatically accepted evidence.                                                                                                       |
| `featureImage`                                                                                                                            | Feature-local gallery membership, selected image revision, intent, explicit order, caption/alt values                                 | Proposal-only membership stays outside the public join table. Add/remove/reorder publish with the Feature. Current task-only/research/unpublished images must not become public merely because a Feature baseline is created.                             |
| `image`, remote image metadata, `imageRevision`, `imageAssetVersion`                                                                      | Separate immutable metadata and file versions, pinned by gallery entries                                                              | A metadata edit creates a new image revision. Each Feature adopts it explicitly. Byte edits require a new immutable object key. Removal detaches membership; referenced bytes remain retained unless live privacy/moderation access overrides them.       |
| Feature identity, ancestry, contributor/creation attribution, local/effective visibility, archive state, draft/review flags               | Identity, live controls and workflow evidence, outside restorable content                                                             | Recheck current ancestry and capabilities. Restore must not move a Feature, restore privileges, resurrect an archived identity or invent original authorship. Parent visibility cascades do not replace the accepted content head.                        |
| `spatialIndex`, division role IDs/resolution, MTR fields/resolution, `featureSpatial`, search documents, counts and routing/division jobs | Derived projections                                                                                                                   | Rebuild from accepted content only; no proposal data enters map/search/filter/count indexes. A routing refresh is not an editorial revision.                                                                                                              |
| `task`, `taskImage`, task evidence revisions                                                                                              | Separate contribution/work/review records, linked to exact candidate and accepted revision IDs where appropriate                      | New Feature, new photo and missing-report workflows keep their semantics. Saving a draft or evidence does not alter public Feature content. Review must fence both task evidence and the Feature comparison.                                              |
| `userFeature`, role grants, imported crosswalks, operational/history records                                                              | Separate relationships and events                                                                                                     | Do not copy into content or replay on restore. Identity merge/split needs explicit per-relation dispositions; original events retain their original identity.                                                                                             |

Internal property values are private even inside historical snapshots. Current
authorization and current/snapshotted sensitivity must constrain history, proposal
previews and conflicts. Never send a complete server snapshot to a translation
contributor. Build candidates on the server from an allowed patch to the authorized
base; editing authority does not imply publishing or shared-correction authority.

Pending review belongs to each proposal. Submitting another proposal must not set a
Feature-wide flag that hides its existing published content, and accepting one must not
remove other proposals from the review queue. Likewise, ancestor visibility may hide a
Feature without clearing its accepted content head; baseline enrollment cannot use
effective `isPublished` alone to infer whether accepted content exists.

The current image join has no stored order, caption or alt columns. Public image queries
sort using image state and intent; those queries must be migrated to the accepted
gallery order. Do not treat the source reader's deterministic image-ID sort as the
intended gallery order. Capture existing presentation order at baseline, and add
explicit projection storage before claiming reorder support.

## Mutation routes that must participate

The source audit identifies the following integration groups. This inventory includes
indirect writers; a grep of `featureForm` alone does not establish coverage.

| Entry points / services                                                                                                  | Required atomic operation                                                                                                                                                                                                                                                                                       |
| ------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `feature.remote.ts`, `featureFormSave.ts`, `feature.ts`, `locationRelations.ts`                                          | Build complete candidate content from the base plus allowed form changes, retaining omitted locales/internal fields. Staff publish-capable edits and contributor submissions follow their respective acceptance rules. Low-level relation helpers must become projection-only or reject enrolled direct writes. |
| `locationEdit.ts`, `locationAssociation.ts`, `locationLinkProjection.ts`, `locationUnlink.ts`, `locationReset.ts`        | Keep association/correction preparation separate from execution. Commit accepted reference changes, Feature projections and existing Location evidence together. Pending candidates cannot write Organisation corrections.                                                                                      |
| `locationAdoptionApply.ts`, `locationPlacement.ts`, `locationMerge.ts`, rematch workers                                  | Translate accepted/policy-approved source changes into Feature revisions, preserving source proposal/decision references, job leases and current policy guards. Location identity merge is not Feature identity merge.                                                                                          |
| `imageUpload.ts`, `image.ts`, `imageDeletion.ts`, image cleanup and asset delivery                                       | Finalize/version assets, stage candidate gallery membership, retain historical pins, and avoid changing public image metadata/order while a candidate is pending. Delivery must enforce current moderation plus published/proposal access.                                                                      |
| `task.ts`, task remote commands and `taskEvidenceRevision.ts`                                                            | Link existing task evidence to Feature proposals; accept task and Feature/gallery changes together. Another open proposal must remain reviewable after one acceptance.                                                                                                                                          |
| `property.ts`, catalogue replacement and property/option FK cascades                                                     | Identify affected Features before removal. Capture actual value removals with attribution and stale-form protection; no unrecorded child cascade. Shared catalogue-only edits remain separate.                                                                                                                  |
| `organisation.ts`, `project.ts`, `layer.ts`, `publication.ts`, historical-layer triggers                                 | Keep live visibility/archival and ancestry updates authoritative. Explicit bulk publication must not select an arbitrary latest proposal or accidentally publish pending contribution assets. Derived historical membership is not an editable content field.                                                   |
| `scripts/breadline/features.ts`, target-adoption/import scripts, curated Location adoption and other maintenance writers | Use attributed baseline/import commands or explicitly refuse enrolled identities. Import crosswalks remain stable; replay must not duplicate revisions or replace reviewed content.                                                                                                                             |
| MTR/division refresh and spatial/index/count triggers                                                                    | Continue accepted-projection maintenance without creating editorial revisions. Test geometry changes and rollback through real triggers.                                                                                                                                                                        |

SQL migrations and fixtures also contain direct Feature writes. Already-applied data
migrations are not runtime writers, but restore/import maintenance operations need an
explicit compatibility decision before write guards are enabled. Account deletion, image
moderation, definition deletion and identity retirement deserve dedicated tests because
their FK effects can cross normal form boundaries.

## First integration safeguards

`readFeatureRevisionSource` captures the Feature and related content/dependency groups
in one SQL read and returns a transactional equality predicate. It observes locale and
property children, accepted Location bindings, gallery/image state, and assigned field
definitions/options. Its result is private **source evidence**, not a revision payload:
it intentionally includes live controls and internal fields to detect races. It cannot
replace an explicit content adapter or authoritative validation of remote media.

Checking only `modifiedAt` would allow enrollment to record stale child rows when a
child-only edit or FK cascade did not touch the parent. Source equality is checked in
the same transaction as the eventual enrollment. Collection size does not increase the
number of bound IDs. Shared definition changes conservatively invalidate a pending
baseline capture; unrelated Features and unused definitions do not.

The generic merge and acceptance services now accept a server-owned atomic-value policy.
It is used for both the comparison and resolution validation, and propagated through
persisted Feature acceptance. The application content adapter must define these
boundaries consistently and version them with the content format; clients cannot choose
them. This prevents synthesizing mixed Location references or incompatible property
storage from superficially independent child-field edits. Whole-result domain validation
still applies.

## Cutover sequence

1. Apply the confirmed workflow decisions, define the strict authored-content format and
   complete forward projection adapter. Group dependent values in that format; keep
   locale/property/image identities stable and order explicit.
2. Rehearse image baselines and immutable delivery. Existing unverified legacy assets
   need an explicit verified import; do not manufacture hashes or choose a revision by
   timestamp. Preserve private/research/task-only media status.
3. Wire unpublished staff drafts, published staff edits and independent contributor
   proposals into the existing forms, authorization and task flows. Prove that saving a
   proposal leaves every public projection unchanged.
4. Wire Location, catalogue, image, hierarchy and import writers. Add projection guards
   only after these paths are converted, so enrollment does not unexpectedly break a
   worker or a cascade.
5. Add authorized Feature History/review/conflict UI using the existing history and form
   components. Test two simultaneous proposals and field-specific permissions.
6. Wire identity operations with a reviewed dependent-record manifest, guarding all
   input heads and task/crosswalk dispositions before committing outputs/redirects.
7. Rehearse full migration/enrollment on a database copy with realistic linked
   Locations, legacy media, internal properties and task evidence. Compare public
   projections before/after; verify deliberate late failures roll back everything.
   Enable locally only after browser checks and all writer paths pass.

Read-only inspection on 6 November 2026 found 1,321 Features, 2,082 gallery links and
2,964 property assignments in the current local database. All source captures and their
equality predicates matched. That database has zero `featureLocation` rows, so it cannot
prove linked-Location cutover; explicit linked fixtures/rehearsal are required. It also
has zero Feature heads, image revisions and image asset versions. No Feature or image
enrollment, live write interception, migration or UI cutover is claimed here.

Validation of this increment: 78 tests passed across source-fencing, persisted Feature
review, identity operations, immutable images, merge, acceptance, lineage and diff
suites. Tests include child-only drift with an unchanged parent timestamp, revoked
scope, rollback, bounded bindings and resolving a complete dependent value before
publication. Focused TypeScript checking reports the existing two D1 adapter errors and
the existing Layer property translation-shape error, with no diagnostics in the new
source reader or changed merge/acceptance paths. This is preparatory backend evidence,
not browser or full Feature-cutover acceptance.

## Editorial content and projection implementation

`featureContent.ts` defines the strict `feature-content/v1` payload.
`featureRevisionContent.ts` maps the captured source into that payload using explicit
allowlists. It includes profile, placement and accepted Location references,
translations, stored property answers with definition/option context, detached brands,
and explicitly ordered gallery entries pinned to image revisions. Live ancestry,
permissions, workflow flags, original authorship and derived spatial data are excluded.
Dependent values use a fixed server-owned merge policy. JSON storage text is preserved
exactly, including JSON `null` versus SQL NULL. The adapter preserves legacy unused
empty scalars alongside classifier selections; competing non-empty values are refused.

`featureRevisionProjection.ts` atomically projects editorial profile, translation,
property and unlinked placement edits. It compares the captured source and current
published content before writing, checks child/reference ownership and verifies the
complete resulting projection. Child writes use bounded bindings; modified timestamps
advance monotonically, including when an existing timestamp is ahead of the clock.
Linked placement/property edits, inherited shared names, gallery changes and detached
brand changes fail closed pending their dedicated writers. These limitations prevent
ordinary editorial acceptance from silently correcting a shared Location.

`featureEditorialRevision.ts` provides server-owned translation proposal create/save and
editorial acceptance commands. Bases must have publication receipts; draft saves require
exact proposal ownership and candidate IDs. Only identifiers are returned to
contributors. Acceptance rechecks live ancestry/publication, caller-supplied current
field eligibility and review permissions. Both conflict results and submitted conflict
resolutions are checked for private fields. Contributor acceptance cannot reactivate an
unpublished Feature. The storage primitive requires explicit initial-publication intent
for a root baseline and supports separate system-origin acceptance attribution; staff
Save/Publish and automatic Location adoption still require application integration.

The expanded focused suite passes 116 tests across 11 suites, including draft isolation,
parallel proposals, private conflicts, reference drift, child deletion/replacement,
150-property binding limits and late-failure/trigger rollback. A disposable copy of the
local database converts all 219 image-free Features and exercises proposal create, save,
submit and accept against the real triggers, plus an injected late publication failure.
Rehearsal mutations are rolled back; image-bearing Features are deliberately not
enrolled without verified image revision pins. Linked Location behavior currently has
fixture coverage, since this database has no `featureLocation` rows.

This completes the editorial backend slice, not the full forward projection or live
cutover. Media baseline/delivery, Location and cascade writers, staff/contributor remote
and UI flows, review/history UI, and identity-operation integration remain required.
