# Feature revision write boundaries

This is the application integration contract for the Feature phase of the
[resource revision design](Resource-Revisions-Implementation-Plan.md). It extends the
existing proposal/acceptance persistence services; it does not activate Feature
recording. Location semantics remain defined by
[Places and Features](../../spec/breadline/proposal/01-places-features.md).

## Confirmed workflow decisions

The workflow was revised on 7 November 2026; historical acceptance notes below describe
earlier checkpoints:

1. Keep policy-authorized automatic Location adoption, recording the system actor,
   policy evidence and accepted Feature revision in the same transaction. Human-review
   policies still queue a proposal. Never turn background source refresh alone into
   publication.
2. Staff Save applies accepted content immediately while preserving visibility. There
   are no staff draft proposals. Publish/unpublish only exposes or hides accepted
   content. Staff gallery uploads, replacements, metadata and rotation also apply
   immediately on both the compatibility revision-head schema and the lifecycle schema,
   with immutable asset/history pins and replay receipts; task contribution evidence
   stays in review. Translation-only staff save their permitted text immediately without
   gaining publish authority. External proposed changes are reviewed in their task flow.
   The Feature Updates tab is now read-only History. Split creates two unpublished
   successors; Merge preserves the existing primary's identity and visibility. Duplicate
   task review merges selected evidence and completes the task atomically, or discards
   it. Redirect choices persist independently of current destination visibility.
3. Save shared Organisation/Location corrections immediately when the actor has
   Organisation edit authority. Feature-only editors propose shared corrections to an
   Organisation manager; staff membership alone never grants rights to another resource.
   Keep this shared-resource operation separate from a contributor's Feature proposal. A
   linked-feature form currently can create such corrections via
   `saveLinkedFeatureForm`; this side effect must never occur while saving a proposal. A
   Feature proposal cannot implicitly approve or write a shared correction, even when
   the reviewer holds both permissions. Shared corrections retain their own explicit
   authority and accepted evidence.

Existing agreements stand: independent proposals, whole-proposal acceptance or
rejection, accepted changes immediately published, same-feature merge parents, and
explicit multi-feature merge/split receipts. A merge retains a survivor and redirects
absorbed identities. A split may retain one identity or retire it and create new ones.

## Staff edit-path audit (7 November 2026)

| Resource / entry path                                                        | Save behaviour                                                                                                     |
| ---------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| Feature form and translation endpoint                                        | Accepted content immediately, including authorised translation-only staff; visibility unchanged.                   |
| Feature gallery metadata, presentation and rotation                          | Immutable image revision and accepted Feature pin in one batch on both schemas; stale pins rejected.               |
| Gallery uploads, replacements, order, captions, alt text, intent and removal | Accepted gallery changes immediately; contributor/task uploads remain isolated evidence.                           |
| Hub, Organisation, Project and Layer forms                                   | Direct concurrency-checked writes with attributed revision capture; publication is a separate action.              |
| Hub, Organisation and Project logos                                          | Immediate immutable logo revision and resource pointer update.                                                     |
| Properties, user/account edits and operational settings                      | Existing direct authorised mutation paths; no Feature proposal routing.                                            |
| Local Location edits, accessibility and associations                         | Existing direct scoped writes; source adoption/identity operations remain distinct explicit decisions.             |
| Shared Organisation/Location corrections                                     | Direct accepted correction for Organisation managers; Feature-only editors cannot approve shared-resource changes. |

Regression coverage: `feature-revision-projection.test.ts`,
`staff-translation.remote.test.ts`, `feature-lifecycle.test.ts`, `image.remote.test.ts`,
`feature.remote.test.ts`, `admin-resource-revision-persistence.test.ts`,
`organisation-revision-persistence.test.ts`, `resource-logo-revisions.test.ts`,
`location-services.test.ts` and `location-corrections.remote.test.ts`.
`scripts/visual-checks/staff-save-check.ts` checks the actual shared-correction
component in headless Chromium and Firefox with isolated remote fixtures. Existing
proposals are retained; this change does not bulk-accept old drafts or contributor
submissions.

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

The legacy image join has no stored order, caption or alt columns. Enrolled image reads
now overlay the accepted gallery's order, text and immutable pins through
`featureGalleryRead.ts`; live relation visibility and moderation still apply. Do not
treat the source reader's deterministic image-ID sort as intended gallery order.
Baseline enrollment must capture the existing presentation order explicitly.

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
   input heads and reviewed task destinations before committing outputs/redirects.
   Import crosswalks keep their original Feature IDs, including merged or split
   identities.
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
Linked placement/property edits and inherited shared names remain protected in ordinary
editorial acceptance. Dedicated Location, gallery and detached-brand writers now capture
their approved changes through the same revision boundary. A Feature proposal cannot
silently correct a shared Location.

`featureEditorialRevision.ts` provides server-owned translation proposal create/save and
editorial acceptance commands. Bases must have publication receipts; draft saves require
exact proposal ownership and candidate IDs. Only identifiers are returned to
contributors. Acceptance rechecks live ancestry/publication, caller-supplied current
field eligibility and review permissions. Both conflict results and submitted conflict
resolutions are checked for private fields. Contributor acceptance cannot reactivate an
unpublished Feature. The storage primitive requires explicit initial-publication intent
for a root baseline and supports separate system-origin acceptance attribution; staff
Save/Publish and automatic Location adoption are integrated as described below.

The expanded focused suite passes 116 tests across 11 suites, including draft isolation,
parallel proposals, private conflicts, reference drift, child deletion/replacement,
150-property binding limits and late-failure/trigger rollback. A disposable copy of the
local database converts all 219 image-free Features and exercises proposal create, save,
submit and accept against the real triggers, plus an injected late publication failure.
Rehearsal mutations are rolled back; image-bearing Features are deliberately not
enrolled without verified image revision pins. Linked Location behavior currently has
fixture coverage, since this database has no `featureLocation` rows.

## Application integration and activation boundary

The implementation now routes enrolled Feature forms, translation proposals, image
uploads/metadata/gallery changes, task review, Location adoption, catalogue deletion and
hierarchy controls through attributed revision commands. Existing normalized
Feature/translation/property/association/gallery tables remain transactional read
projections. Unenrolled Features continue using their existing paths.

- Staff Save writes the accepted projection and its history in one guarded batch.
  Private changes use `featurePrivateCapture`; public changes advance the public head.
  Publish exposes the latest accepted comparison and never selects a pending proposal. A
  never-published contribution is reviewed through its task, including its photos.
- Policy-approved Location changes retain system attribution. Shared name/phone/brand
  correction proposals have a separate Organisation decision and cannot be accepted
  through a Feature review. Approved maintenance while unpublished enters
  `featurePrivateCapture`, with no publication receipt or implicit republication.
- Galleries pin immutable bytes and metadata, intent, publication selection, order and
  translated text. Accepted private history remains previewable only under current staff
  authority. Frozen task evidence exposes no image mutation controls.
- Revision image transformations use `ASSET_TRANSFORMER`, a private service binding to
  the existing asset Worker's `ImageRevisionTransformer` entrypoint and its jSquash/WASM
  codecs. The app verifies the retained original's digest and size, sends bytes and
  pinned rotation, then rechecks visibility before returning the result. This path reads
  no mutable sidecars and writes no shared derivatives. It uses no Cloudflare Images
  binding or paid Images fallback. Original-file requests do not require the
  transformation service.
- Merge/split proposals record exact input heads, selected output content and gallery
  order, source ancestry and a relationship snapshot. Acceptance publishes every output
  and retirement in one batch. Retired identities retain history but lose active
  Location subscriptions and property/gallery projections. Public links redirect merged
  identities or display visible split successors within the current hub.
- Identity review requires one explicit output destination for every open task. The UI
  defaults merges to the survivor and requires a choice for splits. Assignments and
  merge wishlist transfers commit in the same batch as publication. Visits, completed
  tasks and import crosswalks keep their original Feature IDs. Merge wishlist overlaps
  deduplicate without copying visit flags or timestamps; split wishlist links stay
  unchanged and expose currently visible successor guidance, including when the original
  identity survives as one child.
- `featureTaskTransfer` records each move against the accepted identity decision.
  `featureTaskUploadTransfer` links forwarded photo proposals to their original upload
  and exact previous proposal. Current task evidence resolves the latest transfer,
  including repeated moves. Pending photo proposals copy only the uploaded gallery entry
  onto the selected output revision. Original contributor attribution remains; the
  forwarding reviewer is recorded in the change set. Draft tasks remain private. A
  superseded branch is withdrawn only after no current task depends on it.
- Moved new-Feature contributions cannot publish or archive their destination through
  task review. Their photos use task-local proposal review; initial-Feature profile
  editing and layer reassignment are disabled for moved tasks. Legacy task photos
  without verified immutable upload evidence must be enrolled before their task can
  move. Other ordinary proposals against retired identities cannot publish and require a
  new successor proposal.
- New Feature creation has an independent, default-off policy. Migrations 0187/0190
  require attributed atomic form/task/identity creation once enabled. Legacy bulk SQL
  import is refused after cutover; `scripts/breadline/features.ts --revisions` provides
  the attributed offline import path, including retired-identity replay without
  remapping.

Additive migrations 0184–0191 cover upload evidence, separate Location decisions,
projection guards, initial creation, identity proposals, private captures and legacy
creation refusal and immutable task transfers. Installing storage does not enroll
existing Features. Apply and rehearse these together before enabling creation or
enrolling existing records. Pending identity proposals made before the new relationship
snapshot must be recreated; they cannot bypass the expanded task/photo/wishlist
concurrency fence.

For local transformed revision delivery, run the asset Worker with
`bun run dev:asset-service:local` alongside the app. On a future deployment, deploy the
asset Worker with its named entrypoint before the app service binding; preview and
production bindings target their corresponding asset Workers. No deployment is performed
by this implementation. The isolated Workerd check verifies the private service binding,
retained rotation, fit/fill/limit sizing and PNG/WebP/JPEG/AVIF output using the actual
WASM pipeline, with no Images or R2 bindings.

Authenticated headless browser checks on a disposable database verified staff initial
publication, contribution/photo acceptance, merge/split publication, successor routing
and retired projection cleanup. The linked identity fixtures use real local Location
records and database triggers. Contributor drafts remain unlinked by the existing
workflow: Location associations require `isDraft=0`, and frozen submitted contributions
cannot be altered by Location automation before review.

The main local database has not been enrolled or migrated by this pass. Full legacy
media enrollment still requires verified asset bytes and a complete before/after
projection comparison. Never synthesize asset hashes or select versions by timestamp.
The legacy source-preserving migration helper has revision-aware assertions but still
needs a dedicated end-to-end rehearsal before use on enrolled data. Repository-wide
validation is not clean; scoped Svelte checking retains existing diagnostics. These
activation requirements remain open under Refs #194 / #180 / #213.

Current validation: 248 tests pass across 18 focused Feature/image/task suites; the
Feature projection and Location service run passes 228 tests (overlapping coverage, not
an additional total). Seven legacy importer tests pass. Scoped Svelte checking reports
11 existing errors and no warnings. Browser checks additionally wait for decoded,
visibly rendered image evidence; HTTP success alone is insufficient. Firefox
verification at the admin shell's supported minimum width (1200px) confirms the identity
editor has no horizontal overflow and its reorder controls work. The existing shell
intentionally blocks smaller admin viewports. Merge/split browser publication also
passes with the creation guard enabled on the disposable database; the policy is
restored to disabled afterward, with no open write scopes or integrity violations.

Relationship integration verification uses isolated SQLite and a disposable browser DB.
The affected Feature/task/image suites pass 189 tests, including multi-hop photo
forwarding, shared uploads assigned to different outputs, private draft submission, late
rollback, stale relationship rejection, contributor/reviewer attribution and visit
preservation. Chromium verifies explicit split destinations and merge defaults; Firefox
verifies the review layout at 1200px and saved split guidance. Screenshots are under
`output/playwright/feature-revisions/relationships-*`. The main local database has not
received migration 0191 from this work, and no remote rollout occurred.

### Verified local enrollment tooling (6 November 2026; Refs #194 / #180 / #213)

The offline importer now composes new Feature identities, translations, properties,
Location associations, import crosswalks and attributed revision initialization in one
transaction. Existing unchanged-source mappings replay without new revisions. A mapped
merged/split identity remains the mapping, even after its Location projection is
removed. Source hash changes still require reviewed reconciliation. The existing SQL
planner remains available for fresh rebuilds and refuses revision-enabled targets.

The rollout commands accept explicit local files; none deploys or writes remote data:

```sh
# Read exact originals and exact versioned metadata into a private, resumable cache.
bun --env-file=.dev.vars --env-file=.dev.vars.production scripts/revisions/cache-media.ts SNAPSHOT.sqlite MEDIA_CACHE
# Rehearse on a separate copy. Never pass a live database with active refreshers.
bun scripts/revisions/enroll.ts COPY.sqlite MEDIA_CACHE ENROLLMENT_RECEIPT.json
# Prove reviewed Location adoption on another disposable copy with labelled synthetic source evidence.
dev-check bun scripts/revisions/rehearse-preservation.ts COPY.sqlite NEW_PRESERVATION_DIRECTORY
# After coordinating local writers, compare the exact rehearsed snapshot and activate atomically.
bun scripts/revisions/activate-local.ts LOCAL.sqlite MEDIA_CACHE ENROLLMENT_RECEIPT.json NEW_ACTIVATION_DIRECTORY
# Subsequent offline Breadline imports use the attributed writer.
bun scripts/breadline/features.ts --revisions --source SOURCE.sqlite --target LOCAL.sqlite --output PRIVATE_PLAN.sql
```

Enrollment verifies every gallery pin and pending task photo before enrolling that
Feature. Missing media, changed bytes, or ambiguous photo ownership block the complete
Feature. Draft/submitted task states and original contributors are preserved; the
migration actor records capture and retained submission status. Completed tasks and all
existing content/workflow projections remain unchanged. Legacy initial submissions with
private gallery links now compare their actual pre-publication visibility before
acceptance, so acceptance can publish their reviewed photos atomically.

The real-data copy enrolled **1,647 of 1,651 Features** and **2,093 of 2,116 images**.
Exactly **23 versioned metadata objects returned 404**, blocking **four Features**. No
metadata, hashes or rotation were invented. The remaining identities continue on the
legacy path. Per-table before/after hashes match; SQLite integrity and foreign keys
pass. Replaying enrollment creates no additional Feature revisions. The
source-preserving helper verifies unchanged effective values, one new attributed
revision/history entry, unchanged unrelated records and rejected stale replay. It
permits only expected Feature mutation tokens, semantic JSON normalization and derived
count-cache invalidation.

The full activation command succeeded on the isolated browser database. It holds a write
lock across drift checking, backup, enrollment and enabling new-Feature recording; a
changed cohort rolls back images, Feature revisions and the switch together. The main
local database was subsequently activated after refresh coordination, as recorded below.
No production changes were made. Private rehearsal receipts and verified media are under
`.local/feature-rollout-20261106/`.

Validation: 300 Feature/image/Location domain tests and 15
importer/rollout/SQLite-adapter tests pass, including late rollback, replay, retired
crosswalks, initial photo review, migration attribution and complete activation
rollback. These counts supersede earlier focused-run totals; they do not claim
repository-wide type-check cleanliness.

Chromium (1440px) and Firefox (1200px) pass authenticated Save/Publish/history checks
against the activated copy. Saving leaves the public title/head unchanged; publishing
advances the head. Both browsers decode a real enrolled image through the private asset
Worker's WASM transformer, with no client errors in the final run. Screenshots are under
`output/playwright/feature-revisions/rollout-*`. A repeated synthetic long title exposed
existing header overflow during an earlier check; no general long-title layout fix is
claimed. The final scoped TypeScript run reports three existing errors in
`src/lib/auth.ts`, `src/lib/db/index.ts` and `src/lib/db/services/layer.ts`, with none
in the changed files. The pre-activation read-back showed zero Feature/image revisions
and creation disabled; the completed local activation below supersedes that state.

### Main local activation completed (6 November 2026)

After the user confirmed the database refresh/reconciliation was finished, a fresh
snapshot and enrollment rehearsal reproduced the same cohort and exceptions. The atomic
activation command then committed against the primary local D1 file: **1,647 legacy
Feature heads**, **2,093 image revisions**, and **new-Feature creation recording
enabled**. The 23 missing exact metadata objects still exclude four legacy Features;
their current content remains available through the legacy path. No production writes,
commit, push or deployment were performed.

The pre-activation backup, guarded enrollment receipt and final verification are
retained privately under `.local/feature-activation-20261106/`. Final comparison against
that backup finds every pre-existing row unchanged across the captured content/workflow
tables. Only the labelled synthetic verification Feature and its English translation
were added; the Feature was subsequently unpublished through an attributed revision and
archived. SQLite integrity and foreign keys pass, with zero open revision write scopes.

Live Chromium and Firefox checks against the primary database verified initial
publication, Save/Publish separation and publication history. The temporary persona
server was stopped, and the normal app was restarted after SQLite/session contention
while two development runtimes shared the primary database. Subsequent image checks used
the normal `http://hype.localhost` app alone: both browsers decoded three consecutive
HTTP 200 responses, with private/no-store delivery through the existing WASM asset
Worker. The normal app on port 5175 and local transformer on port 8790 remain available
for testing. Screenshots are under `output/playwright/feature-revisions/activation-*`.

### Retained legacy authorship (2026-11-06, Refs #194)

Migration `0194_feature_baseline_attribution.sql` preserves legacy Feature authorship
separately from the immutable enrollment operation. Accepted `newFeature` tasks with
`added-feature` credit the recorded reviewer; the contributor and task IDs are retained
alongside that reviewer. Direct contributions use `feature.contributorId`. Pending or
rejected creation tasks credit their contributor, without implying reviewer approval.
Photo and missing-report reviewers do not become the original Feature author. Multiple
creation tasks remain unresolved instead of selecting an arbitrary reviewer.

The evidence is captured atomically on future migration baselines and backfilled for
existing ones. User/task IDs survive live record changes or deletion. This preserves
known original attribution, not a reconstruction of every edit before tracking began.
User-authored revisions continue using their own change-set actors. Changelog rows,
Feature publication history, Actor filters and metadata search use the retained person;
the operation origin and original enrollment receipt remain available separately.

Local backfill: 1,647 attribution rows (122 reviewed, 1,379 direct, 146 other task
contributions). All pre-existing rows were compared unchanged; integrity and foreign
keys passed. Snapshot, rehearsal, receipt and live read-side checks are retained in
`.local/feature-attribution-20261106/`. This does not apply the migration remotely.

### Explicit empty-metadata recovery (2026-11-06, Refs #194)

Missing exact sidecars still block ordinary enrollment. A user-approved recovery can now
supply `LegacyMediaOptions` to `cacheRevisionMedia` and `enrollLegacyRevisions`:
`featureIds` must name an explicit nonempty cohort, and `emptyMetadataReason` must
record the authorization. Scoped reads include that cohort's gallery and pending task
photos only. Each requested Feature ID must exist; the cohort does not expand to other
Features or unassigned images.

Only HTTP 404 permits an empty `{}` metadata baseline. Access errors, malformed existing
sidecars, missing originals and conflicting content hashes still block. Original bytes
are downloaded and hashed; no remote object or versioned sidecar is written. The
immutable image revision retains `baselineRecovery` with the missing version and reason,
and its change set records the recovery. This is a new empty baseline, not a claim that
the original rotation, credit or capture metadata was recovered. Existing image identity
presentation settings and gallery content remain. A strict retry will not silently
consume previously recovered cache evidence; the same scoped recovery authorization must
be supplied explicitly.

For a repair, first capture a consistent local snapshot, cache the scoped evidence, then
rehearse scoped enrollment on a separate copy. Compare normalized projections before
applying the same operation under a local write transaction, require the exact rehearsed
cohort, and retain the pre-repair snapshot. Recovery options do not authorize remote
writes or publishing pending contributions.

Applied locally for `awPLPBMf7CU4`, `cub_Y3hkEehV`, and `esD0FbM0MFzB`: seven originals
verified, six empty metadata baselines, three Features enrolled, no remaining blockers
in that cohort. `cub_Y3hkEehV` remains pending review with its two private photos;
`elnBook00001` was excluded. Existing projections compared unchanged, foreign keys and
integrity passed, and no Feature write scopes remain open. Snapshot, rehearsal,
application and media receipts are under `.local/feature-metadata-recovery-20261106/`.

Verification: six script/integration tests and nine baseline tests passed. Chromium and
Firefox decoded all seven originals and all five public transformed revisions; the two
pending images returned anonymous 404s. Screenshots are under
`output/playwright/feature-revisions/metadata-recovery-*`. Scoped TypeScript checking
retains only the three known errors in auth, DB adapter and layer property typing.

### Book recovery and complete local Feature enrollment (2026-11-06, Refs #194)

The user subsequently included `elnBook00001`. Its exact sidecar again returned 404; the
original downloaded and passed hashing. The same scoped recovery was rehearsed and
applied with one new empty metadata baseline and one Feature enrollment. Existing
normalized projections matched the pre-repair snapshot, foreign keys/integrity passed,
and no write scopes remain. All 1,652 current local Feature identities now have heads
(including the archived verification fixture); no Feature remains on the legacy path.
The book's organisation remains unpublished, and recovery does not grant public image
access. Receipts and the pre-repair snapshot are under
`.local/book-metadata-recovery-20261106/`.

Remaining rollout work is consolidated writer/read-path acceptance and clean validation,
then a separately authorized production rehearsal, migration/enrollment and deployment.
Full immutable pixel/metadata history for non-Feature resource logos remains separate
from their existing identity-reference history. No remote rollout is implied by local
enrollment completion.

The book original decoded in Chromium and Firefox. The actual delivery service denies
anonymous access and resolves the image under an authorized preview guard. A fresh live
HTTP recheck could not complete: the normal local app was no longer listening and the
temporary server failed to obtain a remote-routing preview token (Cloudflare 10013),
including with local R2 selected. Both temporary server attempts exited; no application
or asset data was changed to bypass this environment issue.

### Resource logo media boundary

Organisation/project/hub logo writes now compose `prepareResourceLogoRevision` with
their guarded image mutation. `resourceLogoImageHead` selects exact media, while
resource snapshots and derived immutable logo tables retain prior pins. The Feature
gallery/proposal model remains independent. Sharing an image with a logo does not
authorize a Feature writer to mutate that logo's projection outside resource capture.
Legacy logo baseline capture requires exact sidecar and original bytes; it does not
inherit the explicitly scoped empty-metadata recovery used for legacy Feature
enrollment. Historical logo delivery uses current owner editing permissions and the same
app-owned image transformer as Feature image revisions.

The subsequent
[local logo audit and acceptance follow-up](Resource-Revisions-Implementation-Plan.md#local-logo-audit-and-acceptance-follow-up-2026-11-06)
records the exact-storage audit (8 verified, 10 blocked), guarded local enrollment,
restored project/layer/hub recording switches, authenticated logo workflows, and
remaining whole-plan acceptance/production scope. All 1,652 local Feature heads remain
present. These receipts supersede earlier statements that logo browser verification or
all admin resource activation had already been established for the refreshed DB.

### Deployment boundary

[Managed revision deployment](../operations/Revision-Deployment.md) fences database
writers while migrations and Feature/image baselines are enrolled. Activation requires
complete resource coverage and exact release health. This workflow is independent of
Breadline imports and does not substitute a local rebuilt database for production.

## Review-owned task image changes

Task image editing keeps the submitted proposal and `featureUploadEvidence` pins
immutable. Reviewer changes belong to append-only `featureRevisionReview` rows whose
context is `image-review/v1`; each row references its preceding review, the exact
proposal version and the accepted Feature revision used for comparison. This uses the
existing review table rather than a provisional Feature or a second proposal. The
compatibility revision-head schema adds the context column with
`0201_task_image_review_context.sql`; the lifecycle schema already has it. New-Feature
reports review the complete initial proposal, including all of its submitted photos, as
one unit. The additive migration leaves those proposals and upload receipts unchanged.

`featureImageReview.ts` saves the reviewed gallery, excluded-image decisions and new
immutable image revisions. Rotation and presentation reuse the pinned asset; replacement
verifies decodable bytes before storing a fresh immutable asset key. Caption/alt
translations, intent, local visibility and order remain gallery choices. Excluding an
image does not delete its submitted evidence. Original bytes and metadata remain
available for comparison. Review responses expose only gallery data, not the proposal's
unrelated internal fields.

`TaskImageReview` previews saved reviewer versions in one gallery, with existing images
as read-only context. Review saves never write accepted Feature projections. Pending
saves and unsaved text block task acceptance in the editor. Server guards independently
check the exact proposal, review and target revision, current task ancestry and
unfinished task state. A changed accepted target requires an explicit comparison
refresh; overlapping changes remain blocked for resolution rather than being silently
overwritten.

Creation acceptance adopts the reviewed gallery as the new Feature's baseline.
Existing-Feature photo acceptance applies the reviewed changes through the normal
conflict-aware revision writer. Duplicate inspection includes reviewed images and
carries the inspected review ID through selection and acceptance. Migrated initial
reports also fence their image review; separately edited photo proposals must be
resolved before completing the report. Acceptance and task completion commit together,
with the accepted decision referencing the image review ID. Existing visibility rules
still apply: lifecycle creation proposals create unpublished Features, while the
compatibility initial-review path retains its existing publication semantics.

Photo-task headers provide Reject, Accept All and Accept Classified. Both acceptance
actions fence the complete pending proposal set and publish one combined gallery in the
same transaction as all proposal receipts and task completion. Accept All classifies
unclassified additions as general; Accept Classified declines them. Intent policy still
controls visibility, including private research images. If none qualify, the task is
reviewed without changing the accepted gallery. Orphan tasks with no submitted photos
show an explanation and disable acceptance.

Rejection retains the proposal, review snapshots and image assets. Private review pins
are delivered only under current staff task authority; neither anonymous access nor
being the original contributor grants access to unapplied reviewer edits. Once adopted,
normal accepted-image delivery rules apply.

Regression coverage is in `feature-image-review.test.ts` and
`task-image-review.remote.test.ts`; the headless editor check is
`scripts/visual-checks/task-image-review-check.ts`. These are implementation checks, not
evidence of a production rollout.
