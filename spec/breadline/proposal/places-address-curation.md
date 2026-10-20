# Places Address curation hand-off

Refs [#194](https://github.com/tijptjik/hype/issues/194). Parent design:
[Places and Features](01-places-features.md#replace-the-address-model).

HYPE retains source records and Feature corrections; shared Address curation belongs
to SaanSeoi. A Feature correction is not permission to publish an upstream correction.
The initial workflow uses SaanSeoi's existing interactive curation pipeline.

## Establish the identity and evidence

Select the canonical Place using the HYPE identity comparison flow before curating its
Address. Keep the HYPE Place ID, canonical SaanSeoi ID, exact Place publication pin,
selected snapshot, source resource release, and underlying publisher Place ID together.
The curation ledger's `placeId` is the publisher ID, not the HYPE ID or canonical `ss-`
ID. Obtain it from the retained source evidence; do not strip a prefix to guess it.

Keep original Breadline/local addresses alongside the candidate's current Address,
unit, coordinates and reviewed external evidence. A name/proximity match alone is a
suggestion. Conflicting establishment or unit evidence stays unresolved. Pickup notes,
access instructions and project-specific corrections remain Feature data.

## Use the SaanSeoi review pipeline

The current implementation is in:

- `../saanseoi/apps/harbour-cli/src/lib/pipeline/places/placeAddressCurationUi.ts`
- `../saanseoi/apps/harbour-cli/src/lib/pipeline/places/supplementaryPlaceAddress.ts`
- `../saanseoi/fixtures/meta/curations/overture-place-address.jsonl`
- `../saanseoi/docs/datasets/sources/overture/places.md` (Matching policy and review operation)

Run the source release's upload/assembly against a disposable **local** target with its
selected ALS and Division dependencies. The CLI's `upload <file> --target local`
operation invokes Address analysis during Places assembly. Use the exact retained
input file, dataset, source version and cohort from the release being reviewed;
`../saanseoi/scripts/init/places-overture.fish` records the actual dataset/source
arguments. Run interactively, without `--yes`, to resolve review-required rows.
Do not start a full `init:places:overture` on the sealed production mirror: that command
owns a complete family rebuild. A completed publication is immutable; use a draft
revision rather than trying to modify its published snapshot.

Analysis retains its review evidence under
`.local/harbour-sql/releases/local/{releaseCode}/overture-place-address-review.json`.
The interactive choices have these effects:

| Choice | Retained decision |
| --- | --- |
| Save unchanged ALS candidate | `link_existing` with an available official Address ID |
| New Address, or edit candidate components | `create_supplementary` with structured locale values and optional ALS base |
| Keep accepted identity | `keep_existing` |
| Deliberately leave unlinked | `leave_unlinked` |
| Skip as Unresolved | No accepted link; review remains pending |

The UI supplies the exact observation fingerprint, publisher release, previous Address
ID and reason. Preserve those guards; do not generate a fingerprint from HYPE's freeform
text or fabricate an Address ID. A supplementary Address retains provenance and obtains
its deterministic identity from its structured values. Save & Override Lat/Lng additionally
changes the canonical Place point and should only be used for reviewed location evidence.
Floor/unit fragments are not proof of a canonical Address3D unit; retain them as unresolved
source evidence until an actual Address3D identity is available.

Replay the draft assembly after saving decisions. Unresolved review cases block final
assembly, including under `--yes`. Retain the resulting Place and supplementary Address
snapshots and dependency pins. Only a separate, authorized publication makes the
correction available to other consumers. This thread authorizes local rehearsal only.

## Verify the round trip into HYPE

Read the resulting canonical Place with exact `filter[id]` and its publication pin.
Use the normal HYPE candidate import/refresh path, which independently pins and hydrates
its Address dependency. Verify that the selected Address ID, snapshot, owner and optional
unit match the Place references; a display string alone does not prove resolution.

Confirm that refresh retains the HYPE Place ID and Feature associations, preserves
explicit Feature overrides, and follows each Project's location-adoption policy.
Identity acceptance, facts adoption and location adoption remain separate decisions.
Record before/after evidence and replay without producing duplicate identities.

The existing local hydration rehearsal proves consumption of an already-published
structured Address. It does **not** yet prove a new HYPE-originated curation through
SaanSeoi assembly/publication and back. That full round trip and actual establishment
matching remain open acceptance work.

## Reproducible source-service integration rehearsal

With the sibling SaanSeoi checkout and both repositories' dependencies installed:

```sh
bun scripts/places/rehearse-address-curation.ts
```

The script creates in-memory source META/CURRENT and HYPE databases. It uses
SaanSeoi's current schema migrations, curation parser/analyser, deterministic
supplementary Address row builder, snapshot and release-set publication services,
and actual Address detail API service. It materialises the reviewed rows before
publishing their snapshots. The request transport calls that service in process;
it makes no network request and writes no mirror, source fixture or production data.

A synthetic canonical Place is materialised with the supplementary Address role and
exact dependency, then published through the actual Place release service. The real
Place collection service supplies discovery and exact-ID pinned reads to HYPE; no
Place API response is assembled by hand. Its publication carries the official and
supplementary Address snapshots plus the Division dependency. HYPE's real hydration path discovers the Address publication, rereads with
its independent pin, preserves native components and attribution, and persists one
shared Place/revision. Replay must return the same identities with no extra revision.
The shared resolver must preserve an explicit Feature name override while inheriting
the structured Address. A mismatched snapshot must remain unresolved for review.
Source and HYPE foreign-key checks must pass. The Place publication must resolve
its real field-mapping fixture with those dependency publishers present.

Verified against SaanSeoi commit `5dfb3b471`: supplementary curation, exact-snapshot
hydration, two pinned/discovery requests, source attribution, one persisted HYPE Place
and revision, unchanged replay, preserved name override, and mismatched-snapshot
review all pass. This is cross-repository service integration evidence, extending the
existing read-only real-mirror hydration rehearsal. It does not exercise CLI upload
or interactive prompt orchestration, automatic Project adoption, or establish any
real donor's canonical identity. Those boundaries remain separate acceptance work.

The expanded rehearsal verifies two real Place collection service requests in addition
to the two Address service requests. Both publication families use the in-memory source
catalogue. HYPE validates the exact canonical ID and Place snapshot before hydrating
the curated Address. The synthetic records still do not establish a real donor identity
or exercise the interactive CLI; this closes the hand-built Place-response boundary.

## Persisted Feature adoption after Address hydration

The same command now persists the unhydrated Place revision first and associates
two synthetic Features in different Projects with that stable Place ID. Both have
explicit name/phone overrides and pickup descriptions. It then persists the exact
Address-hydrated revision and calls the real refresh adoption service with persisted
Project policies: one permits automatic Address/unit adoption; the other retains
the default review policy.

The automatic Project receives the native Address envelope and formatted display
label. The review Project retains its original display address and accepted location
revision. Both keep the same Place association, explicit overrides and descriptions;
geometry remains unchanged. Repeating both adoption calls leaves all Place, revision,
Feature, translation, association, history, proposal and decision rows unchanged.
There is one shared Place and two immutable source revisions; foreign keys pass.

This verifies delayed dependency hydration within the same pinned publication,
including independent Project adoption. It does not claim a new-publication refresh
or execution of the scheduled Worker. The fixture uses actual Feature schema column
order and Place migrations in memory; it does not reset the application database.
The helper is `scripts/places/lib/rehearse-curated-adoption.ts`.

## Hydrate an existing reviewed Place from sealed local exports

For a source Address already published, no curation write is necessary:

```sh
bun scripts/places/hydrate-local-place.ts \
  LOCAL_D1.sqlite HYPE_PLACE_ID SOURCE_EXPORT_DIRECTORY CURRENT.sqlite \
  .local/places/NEW-hydration-report
```

The default writes only private projection evidence and a receipt. Add `--apply-local`
to retain a full HYPE backup and persist the hydrated revision, guarded against a
changed latest revision or identity. Only local D1 targets are accepted. Exact replay
must return the same revision without increasing its count; every Feature-owned
table must remain unchanged. Source adoption remains a separate Project decision.

The in-process transport in `scripts/places/lib/local-source-api.ts` runs the actual
SaanSeoi Atlas API against explicitly selected read-only SQLite exports. It opens
no listener and sends no network request. All META/current/history/source shards
must be sealed; a nonempty WAL is rejected. A zero-length WAL has no unapplied
frames. The supplied CURRENT database must match the checked-out API schema; use
a disposable migrated copy if the retained production mirror predates a schema rename.
Do not modify the sealed source mirror to make a rehearsal work.

Verified for donor #4's reviewed Place with the retained September publication:
two real API reads resolve its supplementary Address and exact snapshot, with no
remaining hydration issues. The command passed on an isolated copy and then on
primary local state. One hydrated source revision is stored; persistence replay is
idempotent. All 23 Feature-owned tables stay exact, including the local location
override and MTR access. Integrity/FKs pass, and private backups/receipts are retained.
No upstream Address curation was needed or performed for this record.
