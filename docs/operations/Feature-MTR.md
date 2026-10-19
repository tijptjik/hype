# Feature MTR access

Refs #194 / #213; technical domains: [migration](../../spec/breadline/proposal/03-migration.md),
[enhancements](../../spec/breadline/proposal/09-enhancements.md).

Apply schema migrations 0095–0098 before feature import. Generate private data SQL with
`bun scripts/breadline/features.ts --source <mirror.sqlite> --target <destination-snapshot.sqlite> --output <private.sql>`.
Apply the reviewed SQL in a transaction with foreign keys enabled; check integrity and
source mappings. Never reset the destination. The importer refuses changed accepted
source hashes; resolve changes explicitly before reimporting.

Run `bun scripts/backfill-feature-mtr.ts --database <snapshot.sqlite> --endpoint http://127.0.0.1:8002 --graph <graph-sha256> --output <private.sql>`
against the matching local native Valhalla engine. The script never changes its input
database. Checkpoints include geometry, graph and catalog identities. Default behavior
aborts on engine errors. `--allow-partial` explicitly emits successes only, with failure
IDs in a private sidecar and unresolved jobs retained. Do not treat a partial plan as
complete. Apply the feature import before its MTR plan. Data SQL guards source geometry.

The local engine repair backports Valhalla #6291: reverse pedestrian elevator costs
must read the predecessor edge from its own graph tile. The staged release is
`gba-2026-10-01-valhalla-6291`, graph SHA
`f775900729629bc448586a06a8dfc7b5a73b6d94bcd63ecc2e585b382a35e2b6`.
The complete rehearsal has 2,284 ready / 31 unreachable; local has 2,287 ready /
31 unreachable. Both have zero engine failures and no pending jobs after application.
Breadline is 483 ready / 2 unreachable. Do not relabel engine errors as unreachable.
Production deployment and broad entrance/association acceptance remain separate.
See the [graph-error follow-up](MTR-Graph-Error-Followup.md) for root cause, regression
matrix, immutable artifacts, backup and verification evidence.

Runtime app bindings reuse `ROUTING_SERVICE` and `ROUTING_TOKEN`. The retry Worker is
`workers/mtr-refresh/wrangler.jsonc`; provision the same environment-specific HYPE routing
client token as secret `ROUTING_TOKEN` using secure stdin, then deploy to preview and verify
before production deployment. Commands (deployment is a separate authorized release):

```
bunx tsc -p workers/mtr-refresh/tsconfig.json
bunx wrangler deploy -c workers/mtr-refresh/wrangler.jsonc --env preview --dry-run
bunx wrangler deploy -c workers/mtr-refresh/wrangler.jsonc --env preview
```

The five-minute cron processes up to five jobs, each with a 90-second budget. The app's
immediate attempt has a 25-second budget. Engine outages retain jobs with bounded
exponential backoff. Monitor `featureMtrJob` age/attempts and ready coverage; persistent
timeouts require investigation, not clearing jobs. Refresh existing data by explicitly
requeueing features when releasing a new graph/catalog.

## Catalog provenance

Source: OpenStreetMap contributors, HK extract dated 2026-10-01, ODbL 1.0
(<https://www.openstreetmap.org/copyright>). `scripts/maps/build-mtr-catalog.py` builds
`src/lib/routing/mtr-catalog.json` from an osmium XML extract of station, subway entrance
and stop-area objects. The catalog records source SHA and per-entrance station association.
Private entrances and West Kowloon high-speed-only entrances are excluded. Spatial
fallback station associations and short routing snaps remain review requirements.

## Walking-distance policy and data hold (19 October 2026)

`walk-1000m-v1` accepts only pedestrian routes of at most 1,000 metres, including
endpoint connectors. Routes above the limit leave station, exit and distance null.
The existing no-ferry and 75 m endpoint-snap rules remain. Calculation provenance
records the policy and limit; backfill checkpoint keys include policy identity so
pre-limit results cannot be silently reused. Reviewed imports retain their decision
provenance but cannot publish a walking distance over this limit.

On 20 October, the user separately authorised clearing all over-limit results.
Migration `0105_enforce_mtr_walk_limit.sql` was rehearsed and applied locally: all
84 over-limit records now have null station, exit and distance. Their prior values
remain in `mtrResolution.policyRejection`, with an explicit policy reason and timestamp;
original calculation/review provenance is retained. This is not a fresh route search.
Database triggers reject future inserts/updates above 1,000 m; exactly 1,000 m is valid.
Verification found only the 84 feature rows changed (only four MTR fields), no changes
to jobs or other data tables, and clean integrity/foreign-key checks. A private backup
and receipt are retained. Production application and the broader Breadline data import
remain on hold. Default cards omit MTR; the dedicated Breadline card enforces the cap.

Read-only validation over the current 1,759-feature local snapshot made 8,614 native
requests with zero engine errors: automatic policy results were 1,666 ready and 93
unreachable. These are automatic comparison results, not an applied backfill and not
a replacement for the 64 saved manual decisions. The pre-migration 84 stored walks over 1 km included
37 Breadline locations. No unreviewed in-limit feature changed station.
