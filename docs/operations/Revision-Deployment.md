# Managed revision deployment

The normal `bun run deploy:prod` and `bun run deploy:preview` commands now run
`scripts/revisions/rollout.ts`. This is an independent revision cutover: it never opens
a Breadline source, imports users or features, or reconciles a crosswalk. Existing
production data is preserved and enrolled, including existing Breadline records.
Development database rebuilds are a separate operation.

## Prerequisites

The default CI path uses Bun, Node, Python 3, tar, GnuPG and the locked dependencies.
Its encrypted R2 checkpoints require `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID`,
`R2_S3_ACCESS_KEY_ID`, `R2_S3_SECRET_ACCESS_KEY`, and `REVISION_RECOVERY_PUBLIC_KEY`.
The latter contains one ASCII-armored GPG public encryption key. Retain its private key
outside CI; verify recovery with that key before approving the first live rollout. R2
credentials need read access to original media and conditional write access for
encrypted recovery objects in the environment's raw bucket. CI receives these values
through environment secrets. Missing encryption configuration stops the default R2 path
before queues or D1 are paused.

For a workstation cutover with a local database backup, pass `--local-backup` at
preparation. The runner restores the canonical export to `initial/source.sqlite`, checks
integrity and foreign keys, and records SHA-256 hashes of the export, schema and SQLite
file. It checks those hashes before pausing writers and at subsequent checkpoints. The
run directory retains this choice across retries and contains the private database,
selected plan, source, build and queue states. Resume on the same machine from that
directory. R2 read access for the original application media is still required.

Exact image originals and metadata must exist. Missing media blocks preparation; this
workflow does not synthesize metadata or silently exclude resources.

## Sequence

1. Export the target D1 database, restore it privately and rehearse pending SQL
   migrations and domain baseline enrollment. Build and retain the application.
2. Save original queue states, source files, plans, exports and bundle in an encrypted,
   hash-verified R2 recovery checkpoint. Plaintext artifacts remain private under
   `.local/revision-deployments/`; never upload them to CI artifacts.
3. Pause configured queue delivery and atomically fence normal D1 writes. Fence
   installation is staged while inert, then coverage is checked at the switch. Reads
   from the old app may continue; its writes are rejected by the database.
4. Check that source rows and schema still match. If they changed during preparation,
   export and rehearse again under the write fence.
5. Apply each schema migration with its journal cursor in a single D1 batch. Reinstall
   fences lost through table rebuilds in that same batch.
6. Export the actual migrated database under the fence and prepare enrollment again.
   This is necessary because migrations can generate random identities; offline
   rehearsal identities must never replace actual production identities.
7. Apply domain enrollment batches, verify projection fingerprints, schema, foreign
   keys, all resource heads, logo pins and catalogue coverage.
8. Deploy asset and database consumer Workers and the retained app. The app reports its
   exact release hash at `/api/health/revisions`, but serves maintenance responses until
   activation. Save another encrypted recovery checkpoint.
9. Activate recording, verify active health and restore each queue's original delivery
   state. A previously paused queue stays paused.

Pending repository migrations still apply normally. No Breadline importer is called by
this sequence. It does not replace the live database with a locally rebuilt or
demo-seeded database.

## Preparation, resume and recovery

Read-only remote preparation (local artifacts are written):

```sh
bun run revisions:prepare:prod
```

Apply an approved prepared run, or resume it after interruption:

```sh
bun --env-file=.dev.vars scripts/revisions/rollout.ts production --apply --run-dir .local/revision-deployments/RUN
```

Use `preview` for the other environment. Resume with the same source and retained
artifacts. D1 owns the cursor: a lost response cannot cause a committed batch to be
reapplied. Different release plans cannot take over an unfinished rollout.

Cancellation is available only before the first migration or enrollment mutation:

```sh
bun --env-file=.dev.vars scripts/revisions/rollout.ts production --abort-before-migration --run-dir .local/revision-deployments/RUN
```

After any mutation, repair the problem and resume forward. Schema-only replanning
retains this irreversible boundary. Never redeploy an older app or restore a stale
snapshot automatically over new revisions. A failure after activation can leave queues
paused even though the app is active; resume verifies health and restores queue
delivery.

If the runner is lost, retrieve the latest `deployment-recovery/revisions/RUN/`
checkpoint from the same-environment raw bucket. Verify its ciphertext SHA-256 against
the object name/receipt, decrypt with the privately retained key, and extract into a
private directory. Restore the retained source tree in an isolated checkout of the
original commit, install locked dependencies and use the retained run directory. The
archive contains private production data after decryption. Original media remains in R2
and is excluded from recovery archives. Partial preparation before a plan exists can
safely start in a new run directory because no database mutation has happened.

## Verification boundary

The local test suite covers journal retry/rollback, schema rebuild fencing, enrollment,
activation, maintenance responses and queue restoration. The encrypted archive test uses
real GPG encryption/decryption with simulated object storage. These checks do not
constitute a live Cloudflare cutover. The first deployment still needs its
target-specific media preflight, configured recovery key and remote rehearsal/health
evidence.

Offline production-schema rehearsal passed all 84 pending migrations from the retained
November 6 production export through migration 0197, including schema parity and
foreign-key checks. Its largest captured migration batch used 927 statements before the
final coverage assertion. This is schema replay evidence, not full production-media
enrollment or remote D1 execution evidence.

### Unfinished Feature contributions after lifecycle conversion

New contribution acceptance creates an **unpublished** Feature. Reviewers clean up that
record through the regular editors and publish separately. Publication is not part of
accepting the task, including after migration.

`scripts/dev/feature-lifecycle/convert-drafts.ts` converts unfinished legacy
contributions into the ordinary creation-proposal workflow. The task and initial
proposal IDs remain stable. Proposed content includes the exact retained upload pins;
asset versions, image revisions, original files and task-image links are not copied or
deleted. The converter removes the redundant provisional Feature and its private
projection/history rows only after recording their complete before-images in an
immutable `revisionChangeSet.legacyEvidence` receipt with format
`legacy-creation-conversion/v1`. This includes original proposal/review rows and
Feature-image pins, so cleanup does not erase attribution or historical evidence.

Cleanup is deliberately conservative. Public history, reviewed proposals, additional
tasks, social links, Location associations, identity lineage, foreign revision
references, ambiguous photo evidence, or oversized evidence abort preparation. These
cases require a separate reviewed migration; they are never silently discarded.

The lifecycle rehearsal runs this conversion on its private copy. For an already
converted database, the managed release planner detects `feature.currentRevisionId` and
produces one atomic cleanup group per draft, using the existing maintenance fence, exact
source fingerprints, durable cursor, final verification and activation protocol. The
group temporarily removes only the relevant immutable-history guards inside the same
transaction and reinstalls their exact definitions before commit. It never removes
deployment fences. A failed group rolls back its data, guards and cursor together.
Replanning after a completed conversion produces no duplicate work.

This cleanup plan expects the lifecycle schema cutover and normal resource/logo baseline
enrollment to be complete. It does not replace either stage or weaken activation checks.
Preparing or rehearsing a plan does not apply it to development or production. The app
has no separate legacy draft editor after conversion.

### Managed lifecycle schema transition

The rollout snapshot explicitly selects the current Feature lifecycle. On legacy
schemas, the planner first completes numbered migrations and resource/logo enrollment,
then prepares a lifecycle target on an isolated copy. A dedicated portable schema group
replays that target with foreign keys enabled and deferred checks. Referencing tables
are included in the rebuild to preserve rows affected by CASCADE or SET NULL; Feature
and change-set identities receive additive columns without replacing their rows. Exact
target rows and foreign-key integrity are checked before draft cleanup begins.

Only the leading numbered-schema groups belong to the initial migration/re-export phase.
The lifecycle schema group follows enrollment, with maintenance fences restored in the
same transaction. A failure rolls back the group and leaves its resume cursor unchanged.
Activation of the current schema does not access the removed legacy creation policy
table. Local contract tests cover both the legacy and current activation paths; they do
not establish that a live D1 release has occurred.

Managed enrollment requests only media referenced by Feature galleries, task evidence,
resource logos or existing immutable image history. Unreferenced image rows remain
unchanged. A missing versioned sidecar may use an unambiguous immutable image revision
only when image identity, asset namespace/key, metadata version and original-file hash
agree. The cache records that revision ID and revalidates it on reuse. Enrollment reuses
the exact existing pin when byte size, media type, metadata and current presentation
also agree, preserving prior recovery provenance. This does not authorize new empty
metadata recovery or removal of old files.

### Reassessment after lifecycle integration — November 7

The managed transition remains appropriate: SQL alone cannot verify R2 originals,
construct domain baselines, convert contribution evidence and coordinate application
activation. Breadline import/reconciliation remains independent. However, the current
orchestrator is not yet ready for production execution; component tests and the older
84-migration rehearsal do not establish recovery of the latest complete lifecycle run.

Resolve these implementation gaps before live cutover:

- Resume must inspect the existing journal before reinstalling initial-schema fences.
  `pause()` currently uses every table in `plan.initial`; lifecycle conversion removes
  some of those tables, so restarting after conversion can fail before reaching the
  durable cursor.
- Re-export/rebase must occur only at the numbered-migration boundary. The CLI still
  tests whether any group has `tables`, which also matches the later lifecycle group.
  Resuming after enrollment can therefore attempt a prohibited rebase beyond the schema
  boundary instead of continuing the retained plan.
- Already-converted databases must still rehearse and apply pending numbered migrations.
  Their current early return selects cleanup-only planning before the numbered migration
  runner, leaving future migrations outside the normal deploy path.

Keep a single deployment entry point, with an explicit first-transition path and a
steady-state path that always checks pending migrations and performs only required data
work. Add orchestrator-level interruption tests after schema migration, enrollment,
lifecycle conversion, verification and activation, plus a subsequent release containing
a new numbered migration. Then rehearse the complete latest plan on a fresh production
snapshot and validate it on remote preview D1, including recovery from a lost runner and
measurement of the write-maintenance window. Only that evidence should qualify the
production cutover.

## Editing-window policy rollout

Apply `0203_revision_edit_windows.sql` before enabling the coalescing writers. It is
additive for window/selection storage and replaces only snapshot mutation guards;
existing snapshots have no editable window and stay frozen. No historical payloads are
rewritten. The lifecycle rehearsal installs its matching `idle-windows.sql` extension
and seals pre-cutover Feature windows.

Before deployment, run the focused revision persistence and idle-window tests. Verify
that a same-actor edit inside five minutes retains its snapshot ID, that its concurrency
token advances, that no-op saves preserve the timer, and that five idle minutes or a
workflow boundary produces a new snapshot. Check gallery/logo pins and transaction
marker cleanup after both successful and deliberately failed saves. History feeds must
order a coalesced entry by its latest edit time so unread checkpoints remain correct.

Old application code remains append-only on the new schema. Reverting to it is safe: its
inserts advance heads and supersede editable revisions. Do not restore unconditional
immutable triggers while coalescing application code is still serving requests.

For an already-converted lifecycle database, use the managed rollout: its
`revision-idle-policy` group installs the shared guards and lifecycle extension
atomically, then records migration 0203. Do not run the compatibility Feature SQL
directly against a database whose accepted head lives on `feature.currentRevisionId`.

### Pending Revealing Arrow recording

The requested local Feature `rx81h67xsLkz` and Location `PWfsRUiasaYN` are retained in
[the Revealing Arrow migration](../../migrations/pending/revealing-arrow/README.md).
This data package must follow the current lifecycle conversion and verified production
media transfer. It is not discovered by the numbered migration runner; include its
atomic data group and expected fingerprints in the prepared cutover before activation.
See that package for prerequisites, media hashes and the passing local rehearsal.
