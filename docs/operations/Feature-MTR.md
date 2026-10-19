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
