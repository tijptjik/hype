# Hype preview-to-production cutover plan

**Production cutover completed on 24 November 2026.** The application at `c0fb7f8b5`
activated after D1 committed 154 initial schema groups and 5,681 subsequent groups.
Production readback verified all 172 final application tables, zero foreign-key
violations, and a guest session written and read through the app. Both render queues
resumed and both scheduled refresh Workers completed a run. The local
`cutover-receipt.json` in the run directory below records the release and Worker
versions. The first cutover is closed. Breadline curation has a
[separate acceptance checklist](../../migrations/pending/matching-and-branding/acceptance-checklist.md).

The following sections are the historical plan. The operator and file paths refer to
cutover commit `c0fb7f8b5`. For current deployment commands, see
[Application deployment](Revision-Deployment.md).

## Starting point at planning time

| Read-only observation                                                                                                                                                                                                                                                                                                          | Consequence                                                                                                                                                                       |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Local `preview` at `f683e2e1a` is 1,595 commits ahead of GitHub `preview` at `555ae5843`. GitHub `main` at `feea898f0` and local preview have 16 and 1,597 commits unique by ancestry respectively. Fifteen local commits landed during planning. They leave the migration files and rollout runner unchanged.                 | Select the release in an isolated clean checkout. Review equivalent fixes by behavior. Include newer work only by an explicit change to the candidate.                            |
| Cloudflare reported production Worker version `3e0a06f7-5755-4dd4-b62c-57bfa83aac38` at 100% traffic. The deployment listing did not establish its Git SHA.                                                                                                                                                                    | Record the mapping to source or a retained deployable artifact, live bindings, routes, workers and traffic assignments before cutover.                                            |
| Production D1 has 120 migration ledger entries. Of the candidate's 272 top-level numbered SQL files, 117 match by full filename and **155 are pending**, through `0264`. The ledger includes historical `0000`–`0002` entries absent from this tree. Production has the entries through `0108`, plus `0159`–`0163` and `0168`. | Recompute the set difference at freeze. Preserve the historical entries and the selectively applied migrations. Several prefixes occur twice. The maximum number is insufficient. |
| Production has 1,658 Features, 330 Places, 330 Feature–Place links, 330 Breadline Feature crosswalk rows and 13,499 Breadline user crosswalk rows. The Feature table lacks `currentRevisionId` and the release journal is absent.                                                                                              | This is a **first lifecycle transition** on populated data. Preserve crosswalks, source evidence, independent Hype edits, credentials, sessions and claims.                       |
| Remote preview D1 has 115 ledger entries, ending at `0109_flexible_card_style.sql`, and also lacks the current lifecycle and journal.                                                                                                                                                                                          | Run preview-specific preparation. A successful release on that data alone cannot establish that production's selectively applied migrations, media and imports will convert.      |

These counts describe the planning read. Re-read them at preparation and under the write
fence. Use the final frozen inventory to judge the release.

### Local preparation on 24 November

The private `20261124-initial-inspection` run retained the production database on the
deployment workstation. The SQLite restore passed integrity and foreign-key checks. The
planner applied 154 numbered migrations to its private copy. It deferred `0207` until
accepted Feature revision heads exist. A separate Location rehearsal verified 1,018
splits, with original Feature rows and effective values preserved, one history entry per
split, and a clean replay. All 330 existing links were retained.

The local rehearsal enrolled all 2,112 referenced images. Seven originals had verified
bytes and lacked their versioned metadata. The operator approved a marked recovery
baseline for each. The rehearsal matched all seven recovered rows to their approved
image IDs, original hashes and metadata versions. All 16 focused media tests passed.

The next fresh copy enrolled all 1,670 Features. The operator approved retaining the two
published Independent Bookstores records and their submitted creation tasks. The
converted tasks point to submitted proposals with the original contributor and the exact
gallery image revision. One bookstore remains archived and one remains active. The staff
review service opened both. Four local transactions exercised acceptance and rejection
for each bookstore, preserved the visibility and archive flags, and rolled back. The
private receipt is in `approved-bookstores-verified/bookstore-verification.json`.

The draft conversion retained all 66 unfinished creation tasks as drafts. Their
before-images retain 58 admin and eight app creation origins. Replay produced zero
further draft conversions. Migration `0207` then recorded 42 former-bookstore revisions.
All 42 had been excluded from the 1,018 Location splits. The local database passed
SQLite integrity and foreign-key checks.

**Breadline reconciliation is deferred until after activation.** Prepare this cutover in
a fresh run directory with `--local-backup` and omit `--curation-package`. Enroll the
existing production records and links as the starting revision history. The combined
matching and branding package includes Breadline, MTR and catalogue work, so its
database changes follow in a subsequent release. The approved R2 upload has completed.
All 769 required objects passed SHA-256 readback. Use the frozen dev curation for
matches and branding and the Breadline production export for donor phones. Retain
unrelated production domains, authentication records and existing identity references.
Generate a new post-cutover target plan and verify the resulting current values,
relationship history and zero-write replay.
[Matching and branding runbook](../../migrations/pending/matching-and-branding/README.md)

**Revealing Arrow is included in the first production lifecycle cutover.** The tiles
formed the sign. The current record uses Material = Tiles and Stratigraphy = Revealed,
and the four original Feature revisions retain their exact authored content. A fifth
revision records the catalogue conversion. The ten required objects were missing in the
production raw bucket at preflight. Stage them with create-only writes and verify their
hashes and sizes before fencing production.

### Rehearsal results for candidate `c0fb7f8b5`

The hosted D1 rehearsal accepted the 948-statement transaction and rejected a lifecycle
payload exceeding its 32 MiB RPC limit. The repaired runner stages revision data behind
the database write fence. It then changes the schema, restores the guards and removes
the staging table in one transaction. A 35.9 MB synthetic rehearsal passed on hosted D1.
It resumed after interruption, activated, and verified delivery from both test queues.
The temporary database, Worker and queues were removed after readback.

The private production-copy rehearsal of this candidate applied 154 numbered migration
groups, replanned from the migrated rows and completed 5,681 subsequent groups. The
result reached `active` with a clean integrity check, zero foreign-key violations and
zero unexplained differences across 172 tables under the recorded clock comparison. Both
bookstore submissions remained open with their prior visibility and archive flags. The
seven recovery baselines matched their approved original hashes and reasons. Revealing
Arrow retained four authored revisions and both gallery pins. Its version 12 head
records Material = Tiles. All ten required production media objects have since been
staged and verified by SHA-256 readback.

The private run directory is `.local/revision-deployments/20261124-candidate-c0fb7f8b`.
Its `initial/release/receipt.json` identifies the prepared plan and its `replay/`
directory holds the independent local activation and comparison receipts. Production
activation requires its own live journal and health readback.

Li built the exact candidate and passed its production Wrangler dry run. Full typecheck
returned zero errors and four warnings. The run directory retains that build under
`application/`, its archive under `exact-build/`, and its SHA-256 and provenance in
`application.json`. The original production export, schema sidecar and restored SQLite
file matched the local backup receipt again.

All five managed Chrome checks passed against the candidate. They covered brand
catalogue filters and navigation, station draft editing, and the 98 station release
files in the local development fixture. The test now checks the catalogue's own Status
and Independent controls when returning from the Feature filters. The production-copy
replay has zero premises maps. At 11:32 HKT on 24 November, neither live database had a
premises map table. Publishing the local maps would require a separate selection of
records, release objects and verification of their references.

In a local Workers runtime, the retained build returned HTTP 503 for application
requests during maintenance. Its health endpoint recognized the verified and active
release. On a separate copy of the activated replay, the public Revealing Arrow page
rendered its title, anonymous sign-in created one user, and the new session was read
back through the app and D1. The run directory records those results under
`maintenance-test/receipt.json` and `maintenance-test/active-copy.json`.

At the production fence, migration `0169` exceeded hosted D1's CPU budget. The operator
rebuilt its dependency check from the frozen schema using a separate foreign-key lookup
for each table and moved the parent user insert ahead of dependent inserts. The original
and repaired transactions produced equivalent rows across 92 tables, schema definitions
and sequence values. An unexpected foreign-key dependency still caused rollback.
Enrollment then planned against the actual production IDs. The private repair receipt
and selected plan are referenced by the cutover receipt. The local freeze backup and its
checksums are in `freeze-backup/`.

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

Cutover sources are retained in Git at `c0fb7f8b5`, including
`scripts/revisions/rollout.ts` and its `production/prepare-schema.py`,
`production/prepare.ts` and `production/contract.ts` modules.

## 3. Put the data work in dependency order

The table gives the ordering constraints. The exact split between numbered migrations
must be proven on the production snapshot.

| Work                                       | Order and acceptance condition                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| ------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Legacy schema and historical setup         | Preserve live Place IDs and associations through the Location transition. Run the reviewed historical-layer setup before `0152`. Preserve the audited production preference default in `0169`. Verify migration guards against actual production data, including selective hotfixes.                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| Existing Hype Features without Locations   | Once the required Location schema exists, classify every Feature as already linked, eligible for an unresolved Location, explicitly excluded, or needing review. Prepare the split from the exact target and run the resolved plan before capturing baselines that depend on placement. Verify original geometry, ownership, effective names/addresses/properties, and one association history per split. Preserve existing Breadline links and intangible/draft exclusions. Resolve any overlap with later curated placements, including the former bookstores. [Places handoff](../../spec/breadline/proposal/places-migration-runbook.md)                                                                                   |
| Revision and media enrollment              | Stage exact referenced originals and versioned metadata. Enroll Features, gallery/task image revisions and pins, resource logos, Organisation/Project/Layer/Hub heads, and the applicable property catalogues. Preserve contributor/reviewer attribution independently of the migration actor. A missing or ambiguous required object blocks its group. Verify actual bytes, references and hashes. [Revision deployment](Revision-Deployment.md)                                                                                                                                                                                                                                                                              |
| Feature lifecycle and subsequent SQL       | Convert accepted heads, visibility/private history and unfinished creation drafts. Retain task/proposal IDs, reviews, evidence, image pins, and before-images for removed provisional rows. Verify every current head and sequence. Install the schema-appropriate `0203` editing-window guards, and check title/translation guards against the final schema. Run `0207` and other dependent migrations only once their data and storage prerequisites pass.                                                                                                                                                                                                                                                                   |
| Existing Breadline onboarding and curation | At cutover, enroll existing production identities and associations. After activation, prepare the combined package against that active schema using frozen dev values for Breadline-owned fields. Verify stable crosswalks, claims, affected names and assignments, and zero-write replay. [Curation package](../../migrations/pending/matching-and-branding/README.md)                                                                                                                                                                                                                                                                                                                                                        |
| Revealing Arrow                            | Stage and verify all ten production R2 objects before fencing. After lifecycle conversion, apply the recording and catalogue update as one journaled group. Verify the four authored revisions through version 11, the version 12 head with Material = Tiles and Stratigraphy = Revealed, the Location binding and both gallery pins. [Package and expected IDs](../../migrations/pending/revealing-arrow/README.md)                                                                                                                                                                                                                                                                                                           |
| Catalogue, indoor and field data           | Verify the `0247` catalogue and the referenced logo assets in the production delivery path. Inventory reviewed Location kinds/policies, station/operator/shop drafts, premises releases and their R2 manifests, and Field Sessions data selected for publication. Record any approved local-only data that needs promotion with a source, owner and verifier. Retain unresolved station-shop matches as pending reviews. Local seeds, example personas and synthetic records belong outside the production manifest. Inventory rows and retain a before-image before `0264` drops the four retired web-recorder staging tables. Its SQL leaves audio objects in storage. [MTR shop onboarding](../maps/mtr-shop-onboarding.md) |
| Ghost Signs Stratigraphy                   | Preserve the existing single-select taxonomy and assignments through the cutover. Apply the pending cardinality package only after `0263` **and** the compatible application are deployed. Verify singleton reads and multi-select writes and history through the application. [Ordered package](../../migrations/pending/ghost-signs-stratigraphy/README.md)                                                                                                                                                                                                                                                                                                                                                                  |

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
