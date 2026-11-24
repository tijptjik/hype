# Rebuilding the development database

Refs [#194](https://github.com/tijptjik/hype/issues/194). Domain:
[Locations and Features](../../spec/breadline/proposal/01-places-features.md).

Development and browser acceptance use the normal `hype-db-local` database in
`.wrangler/state/v3/d1/miniflare-D1DatabaseObject`. Do not set `HYPE_DEV_STATE` or
maintain a separate acceptance database for this workflow.

For a production-only local mirror, stop the development server and run
`bun run db:mirror:prod:to:local`. It exports HYPE and installs the verified SQLite
restore, retaining a private backup of the previous local database in `sql/backup`. It
does not apply local migrations, reconcile Breadline, or create development fixtures.
Run `bun run db:mirror:post:local` separately if those local migrations, map styles,
division preparation and reserved personas are needed. The mirror refuses installation
when the export has foreign-key violations or the local database is open. The mirror
replaces local data; save any local-only work before running it.

Prerequisites: the configured Cloudflare read credentials and Breadline source
connection in `.dev.vars`, plus the reviewed private inputs
`.local/breadline/users/production/accepted-sync.json` and
`.local/breadline/local-users.json`. The production manifest selects the accepted source
state and reviewed user decisions, including distinct-person phone overrides. The local
identity seed is created once and retained across rebuilds. These private inputs are
copied into each rebuild receipt directory; they are not production mocks.

Stop the development server, then run:

```sh
bun run db:prepare:local
```

This obtains fresh read-only HYPE and Breadline exports, prepares and validates the
replacement, backs up the current development database, then installs into that same
database. It never writes production. The temporary prepared file is an installation
artifact, not a separate development environment.

The sequence is:

1. Export canonical HYPE tables and schema metadata. Restore indexes, triggers and
   views; rebuild the derived FTS index. Preserve HYPE identities and content.
2. Export the complete Breadline source into a new private SQLite mirror.
3. Apply pending migrations using the D1 ledger. Before `0152`, execute the reviewed
   historical-layer setup required by that migration. Verify history/media retention and
   replay; do not bypass its guard. Local preparation of `0169` preserves the known
   production default with empty fallback locales by adapting both its exact default
   guard and recreated column in a retained local SQL copy. Shared migrations remain
   unchanged; receipts retain the original and applied hashes. Unknown defaults or
   changed migration SQL still stop preparation.
4. Split eligible existing HYPE Features into unresolved Locations through the existing
   preservation planner, without changing their effective facts. Verify application and
   replay against a before-image. Drafts and intangible records remain explicit
   exclusions. Reconcile Breadline users against the mirrored HYPE users using the
   production manifest's accepted source state, reviewed decisions and persisted local
   ID seed. The source checkpoint is copied to the local target; production's accepted
   state is untouched. Apply nonconflicting new users, source-owned profile updates,
   identity changes, source membership grants and related-record fingerprints. Preserve
   established HYPE owners, credentials, runtime claims and independent profile edits.
   Require zero exceptions and a zero-write replay before proceeding. Import eligible
   donors and dropoffs through the existing reviewed Feature converter. Retain reviewed
   exclusions and any blocked identity cases in private evidence; a failed
   reconciliation stops the rebuild before installation.
5. Apply the reviewed dataset Location kinds and six exact relocation policies and sync
   local map styles.
6. Seed reserved development personas and ingest development-only latent-user fixtures
   and the unpublished A–Z Location fixtures, including their map cells. The latter use
   the existing ELN review scope. Their presence is starting data, not proof that every
   scenario passes operational acceptance. `scripts/dev/seed-tasks.ts` then creates
   separate unpublished `task-demo-*` Features covering Missing, New Photo, New Feature,
   facts, position, identity, and merge tasks in the normal queue. Location examples
   retain real comparison evidence; replay preserves review decisions. Run it against an
   explicit local SQLite path with `--apply` while the development server is stopped; it
   saves a before-image beside that database.
7. Check integrity, foreign keys and repeat imports. Back up the current database using
   SQLite backup, preserve Miniflare metadata and install the checked result.

Private exports, plans, input hashes, conflicts, counts and the before-image live in
`.local/dev-rebuilds/<timestamp>-<id>/`. Keep these artifacts private. The identity seed
and user decisions are inputs too: losing the seed can change imported IDs.

User reconciliation is a required rebuild stage, including when recovering a failed
refresh manually. `receipt.userReconciliation.status` must be `passed`, with a
zero-write replay, before the refreshed data is reported as ready. Its plan, original
source baseline, accepted local source state and aggregate counts are retained with the
rebuild. A copied production user table or a completed donor/dropoff import does not
establish that users were reconciled. When resuming a partial refresh, rehearse the same
reconciliation stage against a current local backup and apply its guarded plan to the
live local target; do not reinstall an older prepared database over newer development
work. Retain the accepted source state for subsequent local syncs.

For preparation without installing, or to reuse explicitly retained exports:

```sh
bun run db:rebuild:local
bun run db:rebuild:local --inputs .local/dev-rebuilds/RUN/inputs --apply
```

`--inputs` requires `hype.sql`, `schema.json`, and `breadline.sqlite`; it is an explicit
replay, not a fresh export. Never copy a live SQLite file without its WAL; use a
completed export or SQLite backup. Existing migration names are retained in the ledger.
The command refuses alternate environments, alternate development state, ambiguous
database files, and installation while the database is open.

Start the usual development server after installation. `bun run dev:agent admin` uses
this same database and initializes the existing reserved local admin persona. Map styles
and cells are already prepared. Additional local division preparation can be run with
`bun run db:mirror:post:local`; its division refresh needs the configured SaanSeoi
service.

## Production boundary

Reviewed existing-user adoption is opt-in through
`--identity-review /absolute/private/review.json`, with the adjacent immutable
`cases.v1.jsonl`. The identity contract and stale-state fences are described in
[Breadline user import](../../spec/breadline/proposal/02-user-import.md). Use the
reviewed retained `--inputs` checkpoint; do not replace the identity seed. Before
installation, compare current local data with the preparation before-image. Newer local
tasks, reviews and content must be preserved by preparing against a fresh local backup
instead of overwriting them with an older exported rebuild. Stop all local Vite/workerd
writers; retain an exact pre-install backup and verify the installed crosswalk, normal
user-import replay, integrity and foreign keys.

Production uses the same schema migrations and reviewed real-data conversions. The
historical-layer setup dependency is a real collection configuration, not mock data.
Production must **not** run `db:prepare:local`, the local persona launcher, latent-user
fixtures, or lifecycle seeding. `--no-mocks` prepares a local comparison without mocks;
it does not turn this command into a production deployment tool.

The general Breadline stage registry is still empty. This command explicitly wires the
existing user and donor/dropoff converters; schedules, events and other source tables
are retained in the export but are not silently claimed as imported.

## Revision testing after a fresh rebuild

Use `dev-check bun run db:rebuild:local --no-mocks` to export both sources and rehearse
the base rebuild without replacing the current development database. Numbered SQL
migrations alone do not enroll revision baselines or perform the current Feature
lifecycle conversion. A successful rebuild receipt is therefore not revision-readiness
evidence.

For older exports the local rebuild calls `scripts/dev/prepare-local-revisions.ts` on
its private database copy. It verifies original media, enrolls revision baselines and
converts unfinished contributions into creation proposals. Missing sidecars require
explicit retained recovery evidence; do not fabricate original metadata or skip affected
Features. The scoped recovery procedure is documented in
[Feature revision write boundaries](Feature-Revisions-Write-Boundaries.md).

Run `dev-check bun scripts/dev/feature-lifecycle/smoke.ts PATH/TO/prepared.sqlite`
against the converted candidate. This reads every Feature history and exercises edits,
contribution review, split and merge on a disposable copy. Require integrity,
foreign-key and service checks before installation. Retain the base rebuild's accepted
user reconciliation checkpoint alongside the converted candidate. Compare and back up
the current development database before replacing it, including local-only Features,
tasks and reviews.

Use the [application deployment workflow](../operations/Revision-Deployment.md) for
numbered migrations and Worker deployments to preview and production.

To recover, stop local writers and use SQLite's backup API to restore the retained
`before-development.sqlite` to the receipt's exact destination. Check for subsequent
local edits first; restoring replaces them. Never delete WAL/SHM files from an open
SQLite database.

Task demo presentation: the seven `task-demo-*` Features reuse an existing canonical
Feature photo. Untouched address-review examples append populated old and new address
snapshots and retain their original immutable evidence. Replays preserve decisions and
authored changes. Both the task comparison and the ordinary Feature address tab can
therefore be inspected with representative content.
