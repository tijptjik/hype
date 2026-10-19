# Places, feature inheritance and SaanSeoi addresses

Accepted architecture, 20 October 2026. Refs #194 (migration), #213 (location and
routing), parent #180. This supersedes the external-lookup-only interpretation of
Places in the schedule proposal. The feature-only Breadline importer is a rehearsal
and must be rebased onto this architecture before production application.

## Identity and ownership

A Place is an identifiable, spatially fixed entity; a Feature is a project's
interpretation of it. A bakery is a Place and its Breadline donor role is a Feature.
One Place can support multiple Features; deleting a Feature never deletes its Place.
Places are first-class resources, not children of a project's layer hierarchy.
Non-place features may retain a null place reference.

Use HYPE's permanent `place.id`. The nullable `ssId` is the canonical Place ID returned
by SaanSeoi, not an assumption that the current Overture publisher ID is identical.
Retain accepted association history and source attribution. Never rebind a Place just
because its source ID disappears or a nearby candidate looks similar. Accepted source
identity changes retain the HYPE ID and all feature relationships.

Place states are `linked`, `unresolved`, and `manual`. Unresolved records participate
in later candidate discovery. Intentionally manual records do not. Source availability
(current, missing, review required) is independent of those states. Manual/unresolved
records have a local baseline with provenance; they never impersonate upstream records.

Source-backed Place facts are shared. Project users change Feature overrides, not the
shared source payload. Local Place administration requires explicit owner/steward
permission; private manual data must not become globally visible through a linked
Feature. Feature visibility does not confer access to other projects' feature records.

## Storage and effective values

Introduce Place identity, immutable source revisions, local baseline data, accepted
source identity history, feature links, explicit overrides and durable refresh jobs.
Preserve the upstream response, API/schema version, release set, snapshot references,
content hashes and attribution. Build typed projections for supported fields rather
than coupling HYPE to SaanSeoi's internal SQLite schema.

Existing Feature columns are initially effective read projections. Their authoritative
inputs are the Place revision, project adoption state and explicit Feature overrides.
All mutation paths must use one resolver. Store the revision inputs used to produce
an effective Feature; update its spatial indexes and derived jobs consistently.

Each overridable field has `inherit`, `override(value)`, or `clear` semantics. A missing
override means inherit. Locale fields resolve independently; explicit clear must not
fall through to another locale accidentally. Arrays replace as complete ordered
collections in the first version; no implicit concatenation or arbitrary first-item
selection. Empty array is an explicit empty value, not absence of an override.

### Phones and brands

`phoneNumber` is the existing universal HYPE property. Keep its identity and make the
supported value, validators, editing, indexing, import/export and rendering array-aware.
Migrate scalar values to one-element arrays without creating a second phone property.
Retain valid HK number normalisation and record invalid source values as evidence.
SaanSeoi's source phone array is mirrored unchanged; normalization belongs to the HYPE
projection, with omissions exposed rather than silently presented as complete data.

Brands belong to Places and are arrays, usually containing one brand for a shop.
Preserve identifiers and localized names; a label alone is not a stable identity.
The current API exposes one `identifiers.wikidata.brandId` and localized `brandName`;
normalize this to a one-element brand array, rather than assuming an upstream brand array.
Features inherit these values without redundant feature-property assignments and may
override the entire array. Retire the organisation-specific brand classifier as an
independent source of truth after converting existing assignments to Place baseline
values or explicit overrides. Preserve old option identities in migration provenance.
Do not confuse a shop brand with ownership of a HYPE organisation.

### Project-specific adoption of source changes

Every Project has a validated Place update policy. It controls adoption into that
project's effective Features, not whether the shared upstream mirror is refreshed.

Configurable dimensions:

- Coordinate updates: automatic, review all, or maximum displacement in metres.
- Address identity changes: automatic or review.
- Shop/unit changes: automatic or review.
- Establishment/name/category evidence changes: automatic or review.

The initial default is review for all location and establishment changes. Projects can
explicitly enable automatic adoption or configure a small-move threshold in metres.
Avoid a hidden global threshold. Store policy version and evidence with each decision.
Apply policy changes deliberately to pending changes; do not silently replay previously
rejected changes. Explicit Feature overrides always survive upstream updates.

The shared Place stores the latest fetched source revision. Each Feature retains an
accepted location revision when its Project requires review. Geometry, address/unit
references and their derived memberships are adopted as a consistent location group;
never combine a new unit with an old building's address. Non-location facts can advance
independently unless establishment identity is under review. Two projects can therefore
adopt different revisions of the same Place without duplicating Place identities.

## Replace the address model

SaanSeoi Addresses replace HYPE's structured address system. Do not build a permanent
second HYPE parser or map every SaanSeoi field back into the old `AddressProperties`.
Mirror/reference canonical Address identities and their exact selected snapshots,
including the relevant 2D, 3D and unit references. Use SaanSeoi's structured records and
localizations to render addresses. Address, Place and Division dependencies must resolve
against compatible publications, not independently selected latest versions.

Existing freeform and structured HYPE values are retained as migration/curation evidence,
not falsely labelled verified SaanSeoi Addresses. An unresolved address has an explicit
resolution state. Distinguish a fallback display string from a resolved address record.
Feature-specific address overrides select SaanSeoi address/unit records; access notes
and pickup instructions remain project data rather than altering the global address.

Curation order:

1. Identify the SaanSeoi Places used by HYPE.
2. Review their addresses and unit associations using existing evidence.
3. Add missing Addresses through SaanSeoi's supported curation pipeline.
4. Upsert the Place-to-Address associations in SaanSeoi and publish them.
5. Refresh HYPE from that publication, allowing all consumers to benefit.

The initial implementation uses existing SaanSeoi curation tools; authenticated
submission from HYPE is a separate extension unless directed otherwise. No public
write API is assumed and local feature edits must not cause automatic upstream writes. Manual Places may retain unresolved local address
evidence until a shared Address is available.

## Monthly synchronization and the existing changes API

The registered source changes route is:

`GET /places/v0.1/sources/changes?region=hk&fromRelease=<old>&toRelease=<new>&limit=100`

Discover resource-release IDs/codes through `/places/v0.1/source-releases`. Preserve
the returned comparison `pin` and follow `nextCursor` until null. `view=summary`
returns unfiltered source-record counts, not canonical Place differences.

This route compares publisher source records. SaanSeoi canonical identity reconciliation,
address dependencies, translations and curation can change canonical results separately.
Use the feed as change evidence plus publication-pinned canonical refresh of linked IDs;
do not use it as the sole invalidation signal. Preserve source-to-canonical provenance.

Follow DivisionSync's monthly discovery and bounded durable work pattern, with leases,
retry state, fenced writes and resumable checkpoints. Advance a publication checkpoint
only after successful application. Keep the last accepted snapshot on failed reads or
missing source IDs. Source removal does not imply closure, donor inactivity or deletion.
Rebuild affected Feature projections and caches using their own Project policies.

## Existing-feature and Breadline migration

Preserve Feature IDs, URLs, media, permissions, histories and project relationships.
Generate candidates against a pinned local SaanSeoi publication using names in both
languages, geometry, contacts and shop/unit evidence. Nearby or same-brand is insufficient.
Keep rejected candidates to avoid recurring suggestions. Match establishments rather
than their buildings; classify signs, historic objects and intangible features explicitly.

For a strong unique match, link the corresponding Place. Otherwise create an unresolved
Place, lending the current Feature's name, geometry and address as a provenance-marked
baseline. Use intentional manual status only where deliberate, not for every failed match.
Deduplicate only with evidence and preserve identity redirects if a later merge is accepted.

Equivalent values inherit; meaningful differences become explicit overrides. Preserve
original values and distinguish empty source fields from intentional suppression. Do not
freeze every inherited field as an override, which would prevent future updates flowing.

Breadline eligibility remains recorded-run history: 311 donors and all 19 dropoffs in
the reviewed export. Current schedules only limited the MTR review. Reconcile the 155
excluded donors in earlier local rehearsals without destroying original source history.
Donor `active` describes participation, not the business's operating status. Keep all
64 reviewed MTR decisions as Feature access overrides; a preferred collection entrance
need not be the nearest general entrance of the Place. Preserve the two unmapped labels.

Business opening hours belong to Places when available; pickup and dropoff windows and
runs belong to Features/events. Do not invent opening hours from pickup times.

## Implementation sequence and acceptance

1. Add Place identity/revision/override/adoption storage and resource authorization.
2. Implement inheritance, universal phone arrays and Place brands; materialize effective
   Feature values without changing established public resource identities.
3. Integrate Places and Address reads, source changes and monthly synchronization.
4. Provide basic linking, manual/unresolved creation, override/reset and review controls.
5. Rehearse existing-feature matching and the SaanSeoi address-curation round trip.
6. Rebuild the Breadline migration as Places plus donor/dropoff Features and schedules.

Require zero unintended initial changes to effective values, restartable sync, complete
pagination, preserved overrides, project-isolated adoption decisions, consistent address
references, retained attribution and working manual/unresolved records without upstream
availability. Original Feature-only SQL is not the final production migration.

### Foundation boundary

Migration `0102_place_inheritance_foundation.sql` is additive storage only: Place
identities, immutable revisions, project policies and Feature inheritance inputs. It
does not link or rewrite any existing Feature. `src/lib/places/` defines the typed
projection, explicit override resolver and validated adoption policy. Feature location
overrides are atomic geometry/address selections; cleared locations must be handled
by the later materializer rather than written into the existing required geometry.

The runtime still reads existing Feature columns. Resource authorization, policy
editing, validated source adapters, effective-value materialization, phone property
array migration, monthly jobs and the import rebase must land before activating this
model. No new local data application is part of this schema-only change; the existing
migration hold remains in force.
