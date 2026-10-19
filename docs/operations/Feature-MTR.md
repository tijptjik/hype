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

Current blocker: the checked release archive and pinned Valhalla 3.8.3 image produce
`GetTags: offset exceeds size of text list` on some routes. Do not relabel these engine
errors as unreachable. Repair/rebuild the graph upstream and rerun the backfill with its
new SHA before claiming full coverage. See the
[graph-error follow-up instructions](MTR-Graph-Error-Followup.md) for reproduction,
isolation steps and completion criteria.

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
