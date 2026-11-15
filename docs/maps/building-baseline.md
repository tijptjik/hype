# Government building premises maps

The 2026-11-15 LandsD inventory contains 689 building venues. Collection preserves all
six source layers, original response hashes and a derived bundle hash. Source pages and
bundles may be gzip compressed without changing the hashed bytes.

`scripts/indoor/collect-building-baseline.py INVENTORY OUTPUT --existing IDENTITIES`
collects bounded batches and resumes verified completed snapshots. The API can ignore
`maxFeatures` and reports remaining totals after pagination offsets; the collector
validates cumulative unique identities before completing a batch.

`scripts/indoor/verify-building-baseline.ts OUTPUT` independently verifies source
hashes, per-venue layer counts, bundle identities and publication constraints.
Publication uses `scripts/indoor/import-map-releases.ts INDEX --apply` against local
bindings only. Already published maps are preserved by default. Never use
`--refresh-import` to overwrite curated maps as part of bulk onboarding.

Buildings receive stable provisional IDs based on their source name and UUID, with the
full source UUID retained in their registry code. Source venues do not establish
canonical Location or occupancy identity. Cross-floor connections require separate
curation. Corrections are materialized before publication.

The initial validated publication set contains 688 government venues, including the
existing curated Hysan Place map. Kerry D. G. Warehouse–Kowloon Bay is withheld: unit
`81dcc345-7c70-470c-9996-51b07f0dc713` has an empty GeometryCollection upstream. Its raw
source remains archived. Multipart opening lines in Asia Trade Centre and Ever Gain
Plaza are retained and validated. The bounded publication limit is 64 MiB to accommodate
Festival City's complete approximately 29 MiB bundle.

Development source archive:
`premises-maps/source-baselines/buildings-2026-11-15-initial/`. Published immutable
assets use `premises-maps/{id}/releases/{sha256}.json`. The public review path is
`/premises/{id}`; the local database supplies provisional map discovery. Publication to
development R2 does not update a production database.
