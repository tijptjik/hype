# Revealing Arrow recording and Location

Captured from the local database on 16 November 2026 for the next production cutover:

- Feature `rx81h67xsLkz`: Revealing Arrow, including its four retained accepted
  revisions, current head, publication state, three translations, eight properties,
  property translations, origin attribution and two gallery images.
- Location `PWfsRUiasaYN`: Shopping Centre at 5 Perkins Road, including its source
  revision, translation, organisation override, shared correction, Feature binding and
  both binding-history events.
- Two immutable image assets, four image metadata revisions and eight change sets. No
  linked Field Recorder entry or field-research stack exists for this Feature.

`records.json` is the source snapshot used for exact comparison. `migration.sql`
relocates only image environments/storage namespaces from `local` to `production`. All
authored revision content, IDs, attribution and timestamps are retained. Binding history
uses new destination integer row IDs while preserving its stable version IDs. The
existing triggers rebuild membership, search, counts and background work.

## Production catalogue

The operator confirmed that tiles formed the sign. The first production lifecycle
planner adds the original Tiles option ID to the project's Material catalogue. It
maps the historical condition to Stratigraphy = Revealed. The recording keeps all four
original Feature revisions, including their original labels. A fifth revision extends
version 11 to version 12 and captures the current definitions. The production group
replays the catalogue, recording and new head atomically.
[Production adapter](../../../scripts/revisions/production/revealing-arrow.ts)

## Required release order

This is a **pending post-lifecycle data migration**, not a numbered migration. The
numbered migration stage runs before the managed lifecycle conversion and cannot read
this recording's current revision schema. The production planner selects this recording after lifecycle conversion.

1. Retain `.local/revealing-arrow/media/` with the release handoff. It contains the
   hash-verified originals and metadata objects listed in `media-manifest.json`. Image
   metadata sidecars are reproduced byte-for-byte from retained immutable revisions; the
   latest-version manifests point to those revisions.
2. Prepare the normal production schema migrations, resource enrollment and current
   Feature lifecycle conversion. The existing organisation, project, layer, contributor
   and property catalogue identities must exist; this migration does not import users or
   overwrite shared catalogues.
3. Copy all ten manifest objects to `hype-assets-raw-prod` at their exact keys,
   verifying SHA-256 and byte size. An existing different object is a conflict, not
   permission to overwrite. Retain remote verification receipts before applying SQL.
4. Add `migration.sql` as one atomic, journaled D1 batch **after lifecycle conversion
   and before activation**, under the managed deployment write fence. Do not split its
   statements across batches or execute it against the old production schema. Include
   the data group in the release's expected-state fingerprints and recovery checkpoint.
   The production adapter prepares and verifies the group on the rehearsal database.
5. Verify the retained version 11 and the new `revealing-arrow:production-taxonomy-v1` head at version 12, its
   Location binding and both image originals/metadata in production before activation.

The batch rejects existing Feature, Location, image and revision identities. Resume
through the deployment journal; do not rerun a committed batch or change it to
`INSERT OR IGNORE`. Foreign keys stay enabled and are deferred within the batch. Two
triggers are temporarily removed to preserve the retained coalesced revision sequence
and avoid inventing an extra binding-history event. Their exact definitions are guarded
before removal and restored inside the same transaction. All other guards and deployment
fences remain installed.

## Local rehearsal

```sh
dev-check python migrations/pending/revealing-arrow/rehearse.py PATH_TO_LOCAL.sqlite
```

The rehearsal takes a disposable copy, removes only the captured records and derived
fixture rows, restores the triggers, then applies the batch with foreign keys enabled.
It checks exact imported values, automatically generated gallery pins and search rows,
foreign keys, SQLite integrity, trigger restoration and duplicate-apply rejection. The
source database is opened read-only. This passed against the 16 November local schema;
it is not a production-schema or remote-media verification.

No production writes, object uploads, deployment or local source mutation were
performed.
