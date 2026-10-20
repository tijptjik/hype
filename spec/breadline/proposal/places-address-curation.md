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
