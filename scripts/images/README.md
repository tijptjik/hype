# Capture annotation extraction

Refs [#194](https://github.com/tijptjik/hype/issues/194) and the existing image-date
issue [#88](https://github.com/tijptjik/hype/issues/88). Technical domain:
[Locations and Features](../../spec/breadline/proposal/01-places-features.md).

`src/lib/images/capture-extraction.ts` is the pure planner and resumable applier. These
commands inventory an explicitly selected **local SQLite file**, plan private JSONL
assertions and rehearse against private JSON copies. They never select or write a remote
environment. An inventory is not approval of its proposals.

```sh
python3 scripts/images/inventory-capture.py --database PATH_TO_LOCAL_SQLITE --out .local/capture/inventory
bun scripts/images/plan-capture.ts .local/capture/inventory/snapshots.json .local/capture/plan
bun scripts/images/rehearse-capture.ts .local/capture/plan/plan.json .local/capture/rehearsal
bun scripts/images/rehearse-capture.ts .local/capture/plan/plan.json .local/capture/rehearsal
```

The inventory resolves persisted Organisation/Project pairs and layers, including
archived records. Breadline uses its exact Donors layer; Dropoff Points are excluded.
All description locales and original descriptions/revisions are retained. Image
associations include archive/publication flags, stable IDs, object stage/path, versions
and normalized-byte hashes. The diagnostic current public gallery order uses intent and
creation time, matching the current server sorter; admin order is different. Neither
sort proves historical ordinal references. Inventory output therefore defaults
`historicalOrderVerified` to false and metadata to null. Supply reviewed immutable
import/gallery evidence and **exact-stage** R2 metadata before a plan can propose
writes. Do not renumber after filtering archived, unpublished or missing images.
Out-of-scope uses must also be inventoried.

## Metadata contract for attribution UI (Agent 5)

`ImageMetadataBasic.capture` is optional/null for old documents:

```ts
{
  value: '2025-03-14',
  precision: 'day', // year | month | day | minute | second
  endValue: null,
  endPrecision: null,
  approximate: false,
  originalText: '(1) Photographed on 2025-03-14'
}
```

Do not interpret year/month/day values as timestamps. Unzoned times stay unzoned;
explicit offsets remain expressed offsets. Intervals retain both endpoints and
precision. `capturedAt` keeps the pre-existing EXIF projection unchanged. A conflicting
or more precise EXIF value is quarantined for review, never silently replaced by a
description. Basic metadata exposes capture values; full/admin metadata additionally
exposes `captureSources` (Feature, locale, exact description hash/revision, UTF-16 span
offsets, wording and frozen gallery/order evidence). The description fingerprint is
SHA-256 of its JSON encoding, distinguishing null from empty text. Existing raw metadata
and unknown document fields survive writes. Rotation spreads the whole document;
replacement explicitly retains capture fields.

## Planner outputs and restore material

- `plan.json`: versioned frozen input, plan fingerprint, per-image assertions,
  unsupported wording, exact cleanup spans and proposed descriptions.
- `proposals.jsonl`: one proposed image assertion per line, including expected value,
  decision, provenance and precision. Unresolved mappings retain null IDs.
- `unresolved.jsonl`: capture-like wording outside the explicit grammar, kept for manual
  review. These are possible annotations, not accepted date assertions.
- `restore.json`: full original descriptions, revisions, gallery IDs, image states and
  metadata documents. Keep every original sidecar revision too.
- Rehearsal `state.json`, `receipts.jsonl` and `restore.json`: private durable operation
  receipts and original payloads. A second execution reports zero new writes. This is a
  local JSON persistence rehearsal, not a D1/R2 rollout test.

The parser accepts explicit English `Photographed on/in` and Chinese
`拍攝於/拍摄于/攝於/摄于`, ISO calendar dates, month/year precision, Chinese calendar
notation, explicit ISO-style times, approximation markers and same-precision intervals.
Parenthesized ordinals support comma lists and inclusive hyphen/en/em dash/至 ranges.
Impossible dates, ambiguous prose, unsupported timing qualifiers, markup-split phrases
and unverified historical order stay unresolved. No ordinal means a single-image gallery
only. Shared image IDs, storage aliases and matching byte hashes are reconciled
globally; contradictions block writes and cleanup.

## Application adapter contract (Agent 7 integration dependency)

`CaptureApplyStore` is required; this brief installs **no privileged remote endpoint**.
The shipped concrete adapter is the private JSON rehearsal above. A reviewed D1/R2
adapter must implement these obligations using existing authorisation,
immutable-baseline/correction, adoption and Feature write-token policies:

1. Use one explicit target environment and stage. Fail on missing objects rather than
   using `readMetadataDocument`'s cross-stage/version fallback. Read every current
   description, gallery and Feature revision before effects.
2. Store durable `prepared` receipts before metadata effects. CAS the complete expected
   metadata and image version, and allocate a new immutable sidecar revision.
   `stageImageMetadataRevision` conditionally creates and reads back that new key in an
   explicitly supplied bucket; it does not change old revisions, aliases, manifests, the
   database or cache. A failed version fence must never publish an uncommitted manifest.
   Serialize alias/manifest updates with activation; interrupted activation must resume
   by operation ID.
3. Read the **activated exact-stage** document back. Invalidate image metadata, gallery,
   image and every reused Feature query; use the existing image mutation
   refresh/reconciliation path and changed `image.version` cache keys. The applier
   awaits successful invalidation and writes `metadata-verified` receipts before
   considering prose cleanup. No cleanup on any failed write/read/invalidation.
4. CAS all affected locales for a Feature in **one transaction**, checking the original
   descriptions, gallery/association state, Feature revision/write token and activated
   image versions. Preserve other locales and all unrelated Feature fields. Baseline and
   canonical-source descriptions must use their established correction path, not direct
   SQL. Read back cleaned descriptions and record receipts. Semantically empty prose
   uses SQL NULL, not an empty paragraph.
5. Replays recognize operation receipts and exact before/after payloads. Changes from
   other writers abort rather than rebasing silently. Rollback likewise uses CAS and
   fresh metadata revisions containing saved originals; never overwrite immutable
   sidecars or roll back unrelated edits. Real application/restore rehearsal,
   active-writer fencing and final counts remain Agent 7 dependencies.

Focused verification:

```sh
bun x vitest run src/tests/image-capture-extraction.test.ts src/tests/image-capture-storage.test.ts src/tests/image-metadata-values.test.ts src/tests/image.remote.test.ts --config vitest.config.ts
```
