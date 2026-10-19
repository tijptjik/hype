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
do not use it as the sole invalidation signal. The current individual Place detail route
resolves the latest snapshot, despite the collection supporting publication selectors.
Use the canonical collection with `releaseSet`, `profile=full` and all supported locales
for a pinned scan; do not assume the detail route accepts those selectors. Preserve source-to-canonical provenance.

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

The runtime still reads existing Feature columns. The user applied migration 0102
locally. The additive `getFeaturePlace` remote reads accepted revision projections
under existing Feature visibility permissions, excludes drafts and scopes private
baselines to their owning project. It never returns raw snapshots.

Project managers can configure adoption at
`/admin/projects/<project-code>#policies` in the visible Places tab after Fields. Rules use stable explanatory rows;
the distance threshold remains visible and is disabled when irrelevant. The old
`place-policy` URL redirects there. Shared FormSurface, SectionHeader, SelectField,
TextInput components follow the project editor's read/edit mode. Settings use the `placeUpdatePolicy`
authorization field and optimistic revision checks; translators and unrelated project
maintainers cannot read/write the settings. Saving a policy does not replay pending or
rejected changes. Labels and feedback are localized in English, Traditional Chinese and Simplified
Chinese. Places settings participate in the regular Project Save/Cancel workflow, with no
independent Save button. Policy drafts enable the shared dirty state and pass through
the Project form schema and authorization. Core Project changes and the policy use
one atomic database batch guarded by both revisions; a stale revision changes neither.
Successful save refreshes the accepted policy, and Cancel restores the saved values.

`src/lib/places/saanseoi.ts` validates full canonical collection records against a
publication/snapshot checkpoint. It retains the original payload and attribution,
normalizes all supported phones with explicit invalid-value issues, and preserves
brand identifiers and localized names in an array. Address references remain unresolved
until their pinned structured records have been loaded; freeform text is fallback only.

Shared Place mutation authorization, linking/manual creation, override editing,
effective-value materialization, phone property array migration, Address dependency
reads, monthly jobs and the import rebase must land before activating synchronization.
No source data matching or backfill has been applied by these runtime additions.

### Local Place creation boundary

`createLocalPlace` is an authenticated remote command for project managers. The
persisted project ancestry is authorized before a private `manual` or `unresolved`
Place is created. The identity and initial immutable revision are written in one
atomic batch; failure cannot leave an orphan identity. The baseline retains author,
project and normalized input provenance with a SHA-256 content hash.

Local input requires a name, valid Point coordinates and valid Hong Kong phone arrays.
It preserves brand arrays and localized names. Address strings remain unresolved local
evidence: clients cannot claim canonical address IDs, snapshots or structured records
through this command. Source-backed address selection requires the later verified
address read workflow. Creation does not link or rewrite any existing Feature and does
not write upstream. The manual creation UI and Feature association/override commands
remain separate work.

### Structured Address dependency validation

`resolveSaanSeoiPlaceAddress` attaches a full-profile Address detail response to a
pinned Place projection. Address publications have their own release-set identity;
the adapter checks that publication plus the exact Address ID and snapshot already
referenced by the Place. Referenced inventories must have established owner membership,
the same snapshot and the exact selected unit. Unresolved ancestor coverage is not
treated as a verified shop address.

The original structured response, locales and attribution are retained without
conversion into HYPE's legacy address object. Failures leave the input projection
unresolved; successful hydration removes only the pending-address issue. Focused tests
cover publication/identity/snapshot mismatches, owner/unit mismatches, unresolved
membership, missing/duplicate inventories and building-only references.

This is the dependency-validation boundary, not an activated fetch or synchronization
job. Pinned network reads, immutable source persistence, Feature materialization,
override/link controls and the importer rebase remain outstanding (Refs #194).

## Feature address editor migration (Refs #194, #213)

The admin Address tab stores the upstream address contract in the versioned
`feature.addressMeta.address` envelope. Its `source` uses `PlaceAddress`: selected
Address2D identity, snapshot, retained JSON:API data, publication metadata,
attribution, optional Address3D inventory/unit and localized fallback labels.
Per-feature corrections use upstream field names and locale tags in `overrides`.
Missing keys inherit; null clears; resetting a field removes its override. Retained
source records are never rewritten by corrections. An explicit formatted-address
correction takes precedence over a composed structured label.

The editor supports forward search, reverse lookup, marker/coordinate changes and
localized corrections. Moving the marker retains the settled address and marks the
match stale. Requests cannot replace a subsequently edited draft. Units are loaded
from the selected release set and offered only with established owner membership
and a matching snapshot. A failed lookup leaves existing values intact.

The admin and public contribution write boundaries project this envelope into the
existing localized display-address columns for compatibility with readers. Legacy
`addressProperties` are no longer written by the geocoder. This feature envelope is
an incremental migration; shared Place association, refresh and materialization
remain separate work under the accepted architecture above.

Migration `0107_feature_saanseoi_addresses.sql` archives existing metadata and
structured locale fields as legacy evidence, retaining their display labels as
unresolved fallback text. It does not guess upstream identity. It was applied through
the D1 migration runner to preview and production on 20 October 2026, with `0108`:
all 1,252 preview and 1,271 production features have canonical envelopes. D1 requires
an ordinary staging table, dropped within the migration, rather than a TEMP table.
The full-copy development rehearsal preserved all
1,759 feature IDs, geometries and timestamps and all 5,223 locale display values
and generation flags. All 1,759 envelopes were created and legacy structured
properties cleared. The migration test also checks safe reruns.

Deployment recovery also corrected `0099` to tolerate pending refresh jobs created
by `0096`, environment-dependent division/rollup state, and fewer reviewed relationship
assignments in preview. Exact resource identities, content counts and external-property
guards remain enforced. All 41 guards passed on both targets before application; an
isolated rehearsal preserved unrelated rows across 62 tables. Recovery bookmarks were
recorded before applying migrations. Production's post-migration foreign-key check is
clean; preview has an unrelated dangling `projectMapStyles` reference outside this scope.

Validation: 60 focused address/geocoding/feature remote tests pass. An authenticated
isolated browser check verifies geocoder-response application, correction, Save and
reload, stale-marker feedback, failed-lookup preservation and Reset. Dark and light
theme layouts were inspected; the existing admin minimum-width guard applies on
mobile. The full repository check has 10 unrelated errors and no address-file
diagnostics. Live upstream access from the test origin returns HTTP 401, so successful
lookup checks use controlled JSON:API fixtures; live geocoder acceptance is pending.

The address editor presents ranked formatted-address candidates for explicit
selection before populating the draft. Selected-address details request
`include=divisions,units` from the pinned release set; a Divisions section displays
only returned relationship memberships. It does not infer feature polygon membership.
Local corrections show optional expression rows, with one shared building-number
input and locale-specific Block/Phase inputs. Parsed components are stored alongside
the expression and reset together; unknown expressions retain their text without
guessing components. `premisesName` follows the SaanSeoi contract. Migration `0108`
renames retained source keys and corrections while leaving legacy evidence intact.
