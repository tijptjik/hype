# Breadline donor and drop-off synchronization

Refs #194, parent #180. Parent specification: [Migration](03-migration.md). Eligibility
and reviewed source corrections remain governed by
[Donor import policy](donor-import-policy.md).

## Initial import and accepted baseline

`scripts/breadline/sync-features.ts` prepares private, hash-pinned plans for donors and
dropoffs using their stable source IDs. The complete source mirror must contain both
place tables and runs from one successful export. Raw runs determine donor eligibility;
user-attribution views are unnecessary for a place-only export.

The deployed production schema uses `place`, `placeRevision` and `featurePlace`. The
explicit `features.ts --legacy-place` adapter retains the same eligibility, coordinates,
phone normalization, localized titles, publication rules and reviewed MTR decisions as
the current importer. It emits immutable source evidence compatible with that deployed
schema. It refuses a destination containing the newer `location` table. This loads
actual data before the later Location and Feature revision migrations; it does not
deploy application code or apply those migrations.

The Place-era Feature address writer uses `addressSnapshotId` and `records`, as required
by the deployed strict reader. Newer `snapshotId`, `rawSource` and authored address
structure are retained under `address.legacy.breadlineLocationAddressSource`; localized
display labels and coordinates remain unchanged. The apply boundary rejects stale plans
containing incompatible Feature address sources before sending writes. Address
compatibility must be checked against the deployed reader, not just the newer importer's
Location schema. A repaired remote row requires refreshing the private target baseline
before accepting a new sync plan; never bypass its conflict guards.

The accepted state contains the complete source snapshot and the generated source
projection for each imported Feature. It remains private under `.local`, alongside the
accepted target SQLite baseline, immutable plans, backups and resumable journal.
Preserve these artifacts together. A changed schema requires adapting the writer; do not
force this legacy adapter through the Location cutover.

## Incremental reconciliation

Fresh exports distinguish new identities, changed fields, missing rows and eligibility
changes. Unchanged exports generate zero Feature mutations. A name or other transformed
field changes only when its Hype value still matches the previous source projection (or
already equals the incoming value). Independent Hype edits remain intact; conflicting
changes block application and appear in the private plan.

Changed source definitions append immutable Place evidence and advance the association.
Missing source rows and newly excluded imported donors require review; they never
implicitly delete Features. Reviewed MTR decisions remain bound to their source hash and
coordinates, so changed reviewed donors require revalidation before planning. Split
Place revision associations also require explicit review.

`scripts/breadline/apply-features-production.ts` verifies the plan hash and configured
production binding, holds an operator lock, and rehearses the plan against an isolated
copy before writing. Each Feature and its Place, translations, phone and crosswalk are
one atomic D1 batch. Before-or-after guards on importer-owned fields reject concurrent
edits and make lost-response retries idempotent. Automatic division projections and
unreviewed MTR calculations remain owned by background workers and do not invalidate a
retry. Geometry updates invalidate those derived values through the deployed triggers.
The private journal records completed groups. A failure may leave earlier complete
groups applied; resume the same plan rather than creating a replacement. Accepted source
state advances only after remote completion and local baseline promotion. No production
sync bookkeeping tables are introduced.

## Operator commands

Use the managed local check wrapper for private/local-state operations. Replace the
paths and explicit target with the selected export and durable accepted baseline.

```sh
dev-check bun --env-file=.dev.vars scripts/breadline/sync-source.ts \
  --mirror .local/breadline/features/source.sqlite \
  --table donors --table dropoffs --table runs --full

dev-check bun run breadline:features:sync \
  --source .local/breadline/features/source.sqlite \
  --database .local/breadline/features/baseline.sqlite \
  --state .local/breadline/features/state.json \
  --target production:DATABASE_ID \
  --out .local/breadline/features/plans

dev-check bun run breadline:features:apply-production \
  --plan .local/breadline/features/plans/PLAN.plan.json \
  --expect-hash REVIEWED_SHA256 \
  --database .local/breadline/features/baseline.sqlite \
  --state .local/breadline/features/state.json \
  --target production:DATABASE_ID
```

Inspect aggregate counts and private exceptions before applying. Verify production
crosswalk counts, associations, exact planned row values and reviewed MTR job cleanup
after application. Replan the same export to verify zero writes.

## Production import, 13 November 2026

The complete source export at `2026-11-13T08:24:07.623Z` contains 466 donors, 19
dropoffs and 68,687 runs. The accepted run-history policy imports 311 donors and all 19
dropoffs; 155 donors remain excluded. Definitions match the retained November 6 export,
and all 64 reviewed MTR decisions still match their source hashes.

The initial 330 Feature groups were applied to production using the deployed schema.
Each has an immutable Place baseline and source crosswalk. A repeat plan has zero
mutations and zero exceptions. The 64 reviewed MTR records have no pending automatic MTR
jobs. Production background division enrichment is independent of imported fields.
Read-back checked 2,970 rows with zero mismatches in importer-owned fields; 20 Features
had automatic division enrichment at verification time. Focused importer tests and
scoped TypeScript validation passed, including retry after enrichment and preservation
of newly reviewed MTR access after a geometry change.

A scoped production-schema rehearsal applied every group, retried without additional
writes and passed integrity checking without introducing foreign-key violations. The
reference-only rehearsal has intentionally incomplete unrelated reference hierarchies;
it is not a full production database export or a claim of global production integrity.
No application deployment, schema migration or user import was needed. The
implementation remains local on `preview`; production data application does not imply a
source push.

The private accepted-state manifest is
`.local/breadline/features/production/accepted-sync.json`. Keep its referenced baseline,
state, source export, plan, journal and verification artifacts for later syncs.
