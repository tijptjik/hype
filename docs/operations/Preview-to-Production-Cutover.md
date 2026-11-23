# Hype preview-to-production cutover plan

**Decision on 24 November 2026 — hold the production deploy.** Promote a single reviewed
application release and migrate the existing production D1 database in place. The
release needs a repaired, resumable revision runner, a manifest covering the data
conversions, and a full rehearsal. A push to either deployment branch starts a live
workflow.

## Starting point

| Read-only observation                                                                                                                                                                                                                                                                                                          | Consequence                                                                                                                                                                       |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Local `preview` at `f683e2e1a` is 1,595 commits ahead of GitHub `preview` at `555ae5843`. GitHub `main` at `feea898f0` and local preview have 16 and 1,597 commits unique by ancestry respectively. Fifteen local commits landed during planning. They leave the migration files and rollout runner unchanged.                 | Select the release in an isolated clean checkout. Review equivalent fixes by behavior. Include newer work only by an explicit change to the candidate.                            |
| Cloudflare reported production Worker version `3e0a06f7-5755-4dd4-b62c-57bfa83aac38` at 100% traffic. The deployment listing did not establish its Git SHA.                                                                                                                                                                    | Record the mapping to source or a retained deployable artifact, live bindings, routes, workers and traffic assignments before cutover.                                            |
| Production D1 has 120 migration ledger entries. Of the candidate's 272 top-level numbered SQL files, 117 match by full filename and **155 are pending**, through `0264`. The ledger includes historical `0000`–`0002` entries absent from this tree. Production has the entries through `0108`, plus `0159`–`0163` and `0168`. | Recompute the set difference at freeze. Preserve the historical entries and the selectively applied migrations. Several prefixes occur twice. The maximum number is insufficient. |
| Production has 1,658 Features, 330 Places, 330 Feature–Place links, 330 Breadline Feature crosswalk rows and 13,499 Breadline user crosswalk rows. The Feature table lacks `currentRevisionId` and the release journal is absent.                                                                                              | This is a **first lifecycle transition** on populated data. Preserve crosswalks, source evidence, independent Hype edits, credentials, sessions and claims.                       |
| Remote preview D1 has 115 ledger entries, ending at `0109_flexible_card_style.sql`, and also lacks the current lifecycle and journal.                                                                                                                                                                                          | Run preview-specific preparation. A successful release on that data alone cannot establish that production's selectively applied migrations, media and imports will convert.      |

These counts describe the planning read. Re-read them at preparation and under the write
fence. Use the final frozen inventory to judge the release.

## 1. Freeze the candidate and control deployment

1. Reconcile GitHub main into an isolated candidate. Inspect the two recent
   duplicate-save fixes and earlier signup, Facebook, image, user-index and map
   hotfixes. Record which already have equivalents and test those paths. Include the new
   Location/MTR matcher and Feature revision fixes in the candidate validation. Confirm
   the freeze against any subsequent commits in the shared checkout.
2. Pin commit, clean tree, lockfile, patches, build inputs including static assets, app
   and consumer artifacts, migration filenames and hashes, and private data manifests.
   The current source inventory includes uncommitted source and scripts. Build once per
   target from the selected tree and retain the specific production bundle for retries.
3. Agree who can activate the release, who verifies database/media conservation, and who
   holds recovery access. Hold the GitHub `prod` environment or otherwise gate the
   deployment workflow **before** merging. Select one operator and run directory. The
   stock CI job invokes `deploy:prod` with a fresh run and can deploy
   asset-memory-repair earlier in the same job. Tie execution to the approved
   preparation and put affected sidecar deployments within the agreed window. A fresh CI
   retry must not start a competing cutover.
   [Deployment workflow](../../.github/workflows/deploy.yml)

## 2. Fix the runner and write the dependency manifest

These are prerequisites for a production rehearsal using the normal release entry point.

| Observed in the candidate                                                                                                                                                                                                                                                       | Required change and proof                                                                                                                                                                                                                                               |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| The legacy schema helper loops over all missing SQL files before resource enrollment and lifecycle conversion. `0207_former_bookstore_occupancy.sql` reads `feature.currentRevisionId` and accepted history. The development rebuild explicitly defers it on a legacy database. | Assign each migration its actual prerequisites. Run lifecycle-dependent SQL after conversion and any required taxonomy/storage changes. Account for every one of the 155 files exactly once. A ledger row is written only when its work succeeds.                       |
| `pause()` installs fences from the original table list on resume. Lifecycle conversion replaces or removes tables. The CLI's re-export condition also matches a later lifecycle group that has a table list.                                                                    | Read journal, phase and cursor **before** installing fences or rebasing. Verify fences against the live phase. Permit fresh ID capture only at declared schema boundaries. Demonstrate resume after lifecycle conversion and after activation with queues still paused. |
| A database that already has `feature.currentRevisionId` takes an early path limited to editing-window policy and draft cleanup.                                                                                                                                                 | Make later releases discover and apply all outstanding numbered migrations on the current schema. Test the first transition, a no-op replay, and a second release with a new migration.                                                                                 |
| Independent split, curation and pending-data scripts have different target and transaction contracts.                                                                                                                                                                           | Give each required conversion a guarded, journaled place in the plan, including its preconditions, expected effects and replay contract. An external writer cannot run through the deployment fence. Keep the fence installed while the runner owns a transaction.      |

Compile a manifest keyed by filename or data-package ID. For every entry retain source
hash, applied SQL or transformer hash, input IDs and before-state fingerprint,
destination, prerequisites, expected row/revision changes and verifier. Record whether
it is already satisfied, required before activation, or explicitly deferred with an
owner. Flag destructive DDL, generated IDs, rebuilt tables, replaced guards, and
operations approaching the runner's batch budget **including** guard, fence and cursor
statements. Review the changed, already-applied `0107` address JSON contract against
real rows and use a guarded forward conversion for any outstanding differences.

[Release runner](../../scripts/revisions/rollout.ts) ·
[Schema planner](../../scripts/revisions/production/prepare-schema.py) ·
[Enrollment planner](../../scripts/revisions/production/prepare.ts) ·
[Journal and fences](../../scripts/revisions/production/contract.ts)

## 3. Put the data work in dependency order

The table gives the ordering constraints. The exact split between numbered migrations
must be proven on the production snapshot.

| Work                                       | Order and acceptance condition                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| ------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Legacy schema and historical setup         | Preserve live Place IDs and associations through the Location transition. Run the reviewed historical-layer setup before `0152`. Preserve the audited production preference default in `0169`. Verify migration guards against actual production data, including selective hotfixes.                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| Existing Hype Features without Locations   | Once the required Location schema exists, classify every Feature as already linked, eligible for an unresolved Location, explicitly excluded, or needing review. Prepare the split from the exact target and run the resolved plan before capturing baselines that depend on placement. Verify original geometry, ownership, effective names/addresses/properties, and one association history per split. Preserve existing Breadline links and intangible/draft exclusions. Resolve any overlap with later curated placements, including the former bookstores. [Places handoff](../../spec/breadline/proposal/places-migration-runbook.md)                                                                                                                       |
| Revision and media enrollment              | Stage exact referenced originals and versioned metadata. Enroll Features, gallery/task image revisions and pins, resource logos, Organisation/Project/Layer/Hub heads, and the applicable property catalogues. Preserve contributor/reviewer attribution independently of the migration actor. A missing or ambiguous required object blocks its group. Verify actual bytes, references and hashes. [Revision deployment](Revision-Deployment.md)                                                                                                                                                                                                                                                                                                                  |
| Feature lifecycle and subsequent SQL       | Convert accepted heads, visibility/private history and unfinished creation drafts. Retain task/proposal IDs, reviews, evidence, image pins, and before-images for removed provisional rows. Verify every current head and sequence. Install the schema-appropriate `0203` editing-window guards, and check title/translation guards against the final schema. Run `0207` and other dependent migrations only once their data and storage prerequisites pass.                                                                                                                                                                                                                                                                                                       |
| Existing Breadline onboarding and curation | Preserve both private accepted-sync manifests and their referenced artifacts. Compare users and donor/drop-off crosswalks by stable ID. Rehearse a zero-write replay or a reviewed incremental delta using a writer adapted to the target Location/revision schema. For donor identity, naming and original-template reconciliation, regenerate snapshot-specific plans against the target, check all prerequisites including the catalogue seed, and compare every affected localized title and assignment. Keep authored overrides, claims and source history. Report unimplemented schedule/event imports separately. [Feature sync](../../spec/breadline/proposal/feature-sync.md) · [Donor naming](../../migrations/pending/breadline-donor-naming/README.md) |
| Revealing Arrow                            | After lifecycle conversion, verify all ten manifest objects at their exact production R2 keys and sizes/hashes. Integrate the SQL as one fenced, journaled group before activation. Verify the expected Feature head, version 11, Location binding and both gallery originals. A conflicting existing object or identity requires reconciliation. [Package and expected IDs](../../migrations/pending/revealing-arrow/README.md)                                                                                                                                                                                                                                                                                                                                   |
| Catalogue, indoor and field data           | Verify the `0247` catalogue and the referenced logo assets in the production delivery path. Inventory reviewed Location kinds/policies, station/operator/shop drafts, premises releases and their R2 manifests, and Field Sessions data selected for publication. Record any approved local-only data that needs promotion with a source, owner and verifier. Retain unresolved station-shop matches as pending reviews. Local seeds, example personas and synthetic records belong outside the production manifest. Inventory rows and retain a before-image before `0264` drops the four retired web-recorder staging tables. Its SQL leaves audio objects in storage. [MTR shop onboarding](../maps/mtr-shop-onboarding.md)                                     |
| Ghost Signs Stratigraphy                   | Preserve the existing single-select taxonomy and assignments through the cutover. Apply the pending cardinality package only after `0263` **and** the compatible application are deployed. Verify singleton reads and multi-select writes and history through the application. [Ordered package](../../migrations/pending/ghost-signs-stratigraphy/README.md)                                                                                                                                                                                                                                                                                                                                                                                                      |

## 4. Rehearse end to end

1. Take a **fresh private export of production** on the deployment machine. D1 exports
   can briefly block requests. Use the canonical-table export and schema sidecar,
   restore views/indexes/triggers, rebuild derived FTS, and verify the restored backup.
   Record a D1 Time Travel bookmark and retention, deployment versions and source/media
   manifests. Verify the private local SQLite copy and the retained run directory on
   this machine. Use the local-backup option for preparation and every apply or resume
   of this cutover. [D1 backup procedure](D1-Backups.md) ·
   [D1 Time Travel](https://developers.cloudflare.com/d1/reference/time-travel/)
2. Run the fixed planner against a private copy. Preserve before/after fingerprints per
   table, plus ID-level reconciliation for each intentional addition, transformation or
   removal. Include auth and ownership tables, publication/visibility, revision heads
   and predecessors, task evidence, translations, image pins, crosswalks,
   search/count/spatial projections, triggers and foreign keys. Require zero unexplained
   differences, successful integrity checks and zero foreign-key violations. Prove
   replay adds no revisions or imports.
3. Exercise the **same entry point** on isolated remote D1 with representative volumes
   and schema drift, private media and test-only routes/queues. Keep production
   credentials, personal data and outbound deliveries out of public preview. Use an
   access-controlled production-shaped rehearsal target where exact private data is
   required. Verify D1 batch behavior, permissions, local recovery, queue pause/resume
   and release health. Stop the runner after schema, enrollment, lifecycle, verification
   and activation. Resume each time from retained artifacts and the D1 cursor. Include a
   lost batch response and a competing write.
4. Validate the pinned source through managed lint, tests and typecheck on Li. Exercise
   real Chrome interactions on the managed runner. Verify authenticated admin access, an
   existing user's access and role, public search, a multilingual Feature edit and
   history, a contribution review, image upload/readback, and a representative consumer
   job. Use disposable rehearsal records. Exercise the production-only hotfix paths as
   well.
5. Record the observed results and outstanding exceptions. A historical rehearsal of 84
   migrations through `0197` on the November 6 export covers only part of this
   candidate.

**Go/no-go.** Require the pinned release, complete package manifest, exact-target
preparation, proven recovery and resume, full conservation report, passing browser flows
and named operators. Any unresolved discrepancy in identity, history, permissions,
required media or rollback capability holds the release.

## 5. Execute one approved production run

1. After those gates pass, prepare a production run using
   `bun run revisions:prepare:prod --local-backup` from the frozen checkout. Review its
   release ID, target database, input hashes, counts and exceptions. Retain its private
   run directory. Preparation exports live data and writes private local artifacts.
   Confirm the local backup, deployment permissions, bindings and access to required R2
   objects.
2. Announce maintenance. Record current Worker versions/routes, queue and scheduler
   states, D1 bookmark, and external writer state. Quiesce or drain writers with side
   effects, including crons, messaging/webhooks, importers, and scheduled indoor
   publication where enabled. Preserve retryable inbound work. Protect reads that depend
   on tables being rebuilt. The runner currently discovers only the two producer queues
   in the app environment.
3. Run the repaired operator once, using the reviewed directory. The current invocation
   shape is
   `bun --env-file=.dev.vars scripts/revisions/rollout.ts production --apply --local-backup --run-dir .local/revision-deployments/RUN`.
   Check the retained build and verified local backup before closing writes. Verify
   fencing, recheck source fingerprints, and re-export/replan under the fence if
   production changed. Stop if the resulting plan exceeds the reviewed scope.
4. Apply each group's data, guard restoration and D1 cursor in the same transaction.
   After schema operations that allocate IDs, re-export the **actual migrated production
   state** and derive dependent references from it. Advance through the rehearsed
   dependencies and confirm receipt/fingerprint parity at each boundary. Keep reads in
   maintenance wherever old readers are incompatible.
5. Verify the complete target under the fence. Deploy the reviewed asset service,
   division/location consumers and retained application, plus other changed workers
   identified in the manifest at their compatible boundary. Read back each affected
   route/binding. Require `/api/health/revisions` to report the exact selected release,
   contract and readiness while maintenance is still closed. Verify the local backup and
   retain the selected plan and queue state.
6. Activate revision recording. Confirm active health and make a controlled production
   write/readback through the application with an agreed account and record. Restore the
   original delivery states of queues and other writers. Verify actual consumption,
   retries and backlog recovery. Run the approved post-deploy packages in their declared
   order.

## 6. Recover or close out

| Last durable state                                                  | Operator action                                                                                                                                                                                                                                                                                                      |
| ------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Preparation failed, or fenced with no migration/enrollment mutation | Retain the failure evidence. If fenced and cancellation is chosen, use the managed `--abort-before-migration --run-dir …` path. Verify the previous app can write, and restore every writer to its recorded state.                                                                                                   |
| First mutation committed, application still fenced                  | Keep maintenance closed. Read the journal and receipts, fix the cause, then resume the same retained plan. Restart the runner from the retained directory on this machine. If the plan itself is wrong, use a separately reviewed forward repair or an explicitly authorized disaster recovery.                      |
| Activated or new writes accepted                                    | Check active release health first and finish queue restoration. Prefer forward repair. A point-in-time restore requires an incident decision, a new freeze, accounting for writes and external side effects since the bookmark, and restoration of a compatible app/worker set. A Worker rollback changes code only. |

Close the release after authenticated access, public read/search, revision history,
media delivery, domain routes and queue processing pass in production, and scheduled
jobs have completed an agreed observation cycle. Reconcile data again against frozen
expectations plus legitimate post-activation writes. Retain private recovery artifacts,
the new accepted sync baselines, and a redacted release receipt with hashes, deployment
IDs, migration/package outcomes, timing, outstanding deferrals and owners.
