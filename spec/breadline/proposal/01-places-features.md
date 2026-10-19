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

Explicit unlink preserves the existing effective Feature columns and ordered brand
arrays. Migration 0112 adds a Feature-owned detached-brand projection; an empty
array remains an explicit empty value and cannot revive a legacy classifier.
The internal unlink service guards both Feature and association revisions, stores
the detached brands, advances the Feature timestamp and removes the association in
one atomic batch. Association history records the authenticated unlink actor;
Feature-cascade deletion remains unattributed. Place identities and immutable
source revisions survive. Initial relinking reads detached brands into its baseline
before a link trigger removes the detached copy.

The Feature Place section exposes explicit unlink only while editing a clean form.
The command authorizes all inherited field groups against persisted Feature ancestry,
uses the authenticated actor, and rejects stale Feature/association tokens. Its
response refreshes the Feature, accepted association and detached brand query before
the editor continues.

Detached brands remain editable through the regular Feature Save/Reset, with replace
and clear choices but no source-inheritance option. The detached revision and Feature
timestamp guard one atomic form batch; failures roll back parent, brand and relation
changes together. Reads use normal Feature visibility and persisted project scope.
Brand arrays suppress legacy classifier presentation, including when explicitly empty.

Browser rehearsal on an isolated imported donor verified unlink and two successive
regular-form brand saves with no page errors. Database comparison confirmed unchanged
source revisions and Feature geometry/address, plus one actor-attributed unlink.
Screenshot: `output/playwright/place-unlink-editor.png`. The primary local database
received migration 0112 only; split/import application remains outstanding.

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

The adoption planner derives evidence from stored accepted facts/location revisions
and an explicit candidate revision. It compares names, brand arrays, canonical
category/taxonomy and operating status; compares address content independently
from the selected unit; and excludes publication metadata and unrelated unit rows
from premises-change decisions. Project policy is read with its concurrency revision.
Missing establishment evidence or source identity changes hold both revision groups;
invalid-phone omissions cannot silently erase inherited contacts. Unresolved canonical
address dependencies hold the location group even under an automatic policy.
Explicit overrides survive resolution unchanged.

The database preview is read-only, scope-checked and unavailable for missing source
Places. It returns the Feature timestamp, association token, policy revision and
proposed effective values for the applying workflow. Local sequence checks prevent
rewinding accepted ingestion revisions, but do not establish upstream publication
chronology: the sync workflow must select a verified forward publication explicitly.
Migration 0113 adds immutable proposal snapshots and separate append-only facts/location
decisions. Proposals retain the Project policy and revision, Feature timestamp,
association token, candidate identity and comparison evidence. Repeated sync proposals
reuse the retained assessment, including its rejection decisions. Explicit
`reevaluatePending` appends a new assessment while at least one group is undecided;
reads carry forward all candidate decisions across assessments. It never rewrites
evidence or reopens a decided group. Superseded assessments cannot be
rejected through the current decision service. Concurrent inserts and decisions are
guarded at the database write boundary.

Rejection records the authenticated actor and reason without changing effective values,
source revisions or association history. Evidence survives Feature deletion, while
normal reads require the surviving Feature's current authorized Project scope.
The local schema upgrade passed integrity and foreign-key checks. Persistence tests
verify retries, explicit pending re-evaluation, policy changes after rejection, stale
tokens, scope isolation and immutable audit retention.

The internal application service now accepts one group atomically: association
revision/history, effective Feature fields, locale rows, targeted universal-phone
values and the applied decision commit together. It retains explicit overrides and
unrelated descriptions/properties. Location adoption updates geometry plus the
SaanSeoi address envelope as one group; actual geometry changes rebuild the spatial
index and enqueue MTR work through the existing database triggers. Overridden
locations advance their accepted source revision without moving the Feature.

Automatic calls require an unchanged policy revision and the retained assessment's
adopt decision. Reviewed calls may accept a policy review, but cannot bypass missing
source evidence or unresolved address dependencies. Every write also checks current
Feature/association tokens, source identity/availability, newest assessment identity
and the candidate's durable group decisions. After facts apply, location can be
accepted or rejected independently. An intervening Feature edit requires explicit
pending-group re-evaluation; previous applications/rejections remain visible and final.
A failure at the last decision insert rolls back effective values, association history
and routing jobs together.

95 focused tests verify these paths, including late failure injection, stale/policy
conflicts, multilingual description preservation, override retention, facts-only
routing avoidance, location routing, rejection after partial adoption, and explicit
re-evaluation after an unrelated edit. Full type-check retains the existing baseline.
The review remote APIs now provide bounded, cursor-paginated discovery, evidence reads,
explicit pending re-evaluation and separate accept/reject commands. All require inherited
field-editing authorization against persisted Feature ancestry before reading evidence.
Project/actor identity comes from the server; clients cannot supply source values,
arbitrary candidate revisions for re-evaluation, or automatic-adoption mode. Incomplete
evidence returns a review result, while stale decisions return a conflict. Routing is
woken only after successful geometry application.

Assessment snapshots now include source-before/source-candidate values as well as the
Feature's effective before/candidate values, so overrides do not conceal source changes
from reviewers. Discovery returns the newest assessment per candidate, up to twenty
per page, and carries group decisions across assessment versions. Older assessments
remain readable by authorized reviewers. Preview and proposal creation themselves never
apply updates. Monthly orchestration remains to be connected.

The Feature editor now exposes source-update review in its Place section. Reviewers
load bounded assessment pages explicitly, compare source names, phones, brand identities,
category/taxonomy, operating status, coordinates and addresses, and expand the effective
Feature values to see retained overrides. Facts and location each require a reason and
have separate accept/reject actions. Dirty forms and unresolved dependencies block
application; pending evidence can be explicitly re-evaluated without reopening decisions.
The panel remains mounted across accepted-Place refreshes so a reviewer can decide the
second group after accepting the first.

Validation on an isolated local fixture: the browser accepted facts and then rejected
location with separate reasons and no page errors. Database inspection confirmed both
decisions, independent accepted revisions, unchanged geometry and SQLite integrity.
The 93 focused planner, persistence and API tests pass; the full type-check remains at
the existing 10 errors / 19 warnings. Synthetic fixture records are development-only
and are not canonical matches or migration input.

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

The read-only collector is available as:

```sh
bun --env-file=.dev.vars scripts/places/collect-source-changes.ts FROM_RELEASE TO_RELEASE RECEIPT_NAME [PAGES_PER_RUN]
```

It retains private numbered pages and a hash manifest under `.local/places/`,
validates the resolved comparison pin, cursor chain and unique source identities
on resume, and reports partial checkpoints separately from completed comparisons.
The optional page budget bounds each invocation. Interrupted page persistence is
replayed only when its bytes match. It performs no HYPE database writes.

Canonical collection pagination accepts either exact totals or historical
`hasMore` metadata, rejects contradictory or ambiguous completion, and advances
by retained row count. Historical scans remain pinned to their publication;
publisher comparison release IDs are a separate contract.

This route compares publisher source records. SaanSeoi canonical identity reconciliation,
address dependencies, translations and curation can change canonical results separately.
Use the feed as change evidence plus publication-pinned canonical refresh of linked IDs;
do not use it as the sole invalidation signal. The current individual Place detail route
resolves the latest snapshot, despite the collection supporting publication selectors.
Use the canonical collection with `releaseSet`, `profile=full` and all supported locales
for a pinned scan; do not assume the detail route accepts those selectors. Preserve source-to-canonical provenance.

Canonical publication discovery is implemented in `src/lib/places/publication.ts`.
It makes one bounded collection request and validates the catalogue timestamp, cohort,
API family/region and permalink selectors together. The local mirror command uses the
same parser. The sync comparison distinguishes exact replay, initial discovery and
forward publication: same-cohort curation is eligible when the catalogue timestamp
increases; older cohorts, backwards numeric cohort revisions, equal-time identity
conflicts and changed release identity within the same cohort require review. Local
Place revision sequence is never used as proof of upstream chronology. This discovery
boundary does not activate a scheduler or apply Feature updates.

Follow DivisionSync's monthly discovery and bounded durable work pattern, with leases,
retry state, fenced writes and resumable checkpoints. Advance a publication checkpoint
only after successful application. Keep the last accepted snapshot on failed reads or
missing source IDs. Source removal does not imply closure, donor inactivity or deletion.
Rebuild affected Feature projections and caches using their own Project policies.

The durable scan stage is implemented in `src/lib/places/refresh.ts`, with migration
`0114_place_refresh.sql`. Monthly discovery snapshots the linked Place identity set and
pins a full canonical catalogue scan. Each bounded page retains only tracked candidates
and commits them with its offset in one transaction. Lease tokens and expiry checks
fence writes; failures retain the previous offset and use bounded retry backoff.
Cross-page duplicate tracked IDs and changing totals stop advancement. Missing IDs are
explicit run items, never inferred deletions or donor inactivity.

A completed scan enters `ready` without advancing the accepted publication or modifying
Features. Candidate ingestion, per-Feature policy processing, final checkpoint completion
and the scheduled Worker entrypoint remain to be connected. Source changes-feed evidence
is also separate from this canonical scan. Migration 0114 is applied to the primary local
database with integrity/foreign-key checks passing and all 1,271 Features unchanged.
SQLite-backed tests cover page resumption, late-write rollback, lease loss/expiry, retry,
monthly discovery, publication regression and missing source identities.

The per-Feature refresh adoption coordinator is implemented in
`src/lib/db/services/placeRefreshAdoption.ts`. It uses the retained candidate assessment,
checks facts and location independently under Project policy, refreshes concurrency
tokens between groups, preserves explicit overrides and durable rejections, and resumes
partial applications without duplicate decisions. A mandatory trusted run/lease guard
is also included in the proposal/application SQL, so losing ownership prevents writes.
Policy changes and unrelated edits do not trigger silent re-evaluation. Successful
geometry adoption retains the existing transactional MTR job trigger.

This coordinator still needs the run-item ingestion/cursor stage and scheduled Worker
entrypoint; it is not yet a running monthly refresh. SQLite-backed tests cover both
automatic groups, policy review, rejection replay, lease loss between groups, atomic
write fencing, association scope changes and policy edits after assessment.

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

### Pinned source ingestion and migration candidates (Refs #194)

`readSaanSeoiPlacePage` reads canonical collection pages with a fixed release set,
catalog revision and `knownAt` from the publication permalink. Every page verifies
publication identity, offset, bounds and duplicate IDs. Full records retain source
attribution and explicit invalid-phone/address-pending issues. The source API key is
server-side; redirects are rejected rather than forwarding credentials elsewhere.

`persistSaanSeoiPlace` atomically creates a shared Place identity and immutable source
revision. A canonical evidence hash makes retries idempotent. Existing HYPE identity
wins over generated identity, and later source changes append revisions without
changing any Feature's accepted revisions. Source mirroring is not project adoption.

The local-only `scripts/places/mirror-source.ts` takes a captured publication response,
a private checkpoint path and an optional taxonomy filter. Checkpoints advance after
all records in a page persist and retain revision receipts. Restart verifies receipts
against the target database; missing receipts after a local reset replay the source.
This is a rehearsal/ingestion command, not the monthly scheduler or a production deploy.

`place-candidates.py` compares eligible Breadline records with a read-only SaanSeoi
CURRENT mirror whose selected snapshot matches the captured publication. It applies
the existing recorded-run import policy and reviewed coordinate corrections, searches
nearby and exact-name candidates, and writes private review evidence. Neither nearby
brands nor exact names alone establish identity; all suggestions remain unaccepted.
No candidate scan creates Feature links or silently changes existing values.

For fresh HYPE mirrors, D1's full export currently rejects FTS virtual tables. Export
an explicit canonical-table list excluding virtual/shadow tables and retain a separate
`sqlite_schema` JSON inventory. `scripts/dev/restore-d1-export.ts` reconstructs a new
local SQLite file from those inputs, restores secondary schema, rebuilds the known
search index and checks integrity/foreign keys. Unknown virtual tables fail closed.
Production export files, local snapshots and candidate evidence remain private under
ignored backup paths and `.local/places/`.

### Initial association baseline preservation (Refs #194)

`preserveFeaturePlaceBaseline` compares a complete persisted Feature projection with
its proposed accepted Place facts and location. Equal values inherit; differences
become explicit overrides. Existing source translations missing from the Feature
are suppressed, explicit locale clears survive, and newly introduced source locales
can inherit. Empty arrays remain explicit empty overrides, distinct from suppression.
Object key order is irrelevant; array order and the atomic location group are retained.
The caller must derive the baseline from persisted rows and authorize and atomically
commit the association with concurrency checks. This pure comparison does not yet
activate Feature linking or change any existing Feature rows.

Migration `0109_place_association_scope.sql` enforces association scope at the SQLite
write boundary. Private Places require a non-draft Feature in their owning project;
shared Places can serve multiple projects. Link updates, Feature project/draft changes
and Place ownership changes cannot invalidate that invariant. The migration fails if
pre-existing associations violate scope, rather than silently deleting evidence.
Applied to the fresh local mirror: all four triggers installed, integrity and foreign
keys valid, and bidirectional comparisons of Feature, translation and property rows
against the production snapshot found no changes. Association commands, concurrency
history and materialization remain required before linking is exposed to clients.

Migration `0110_feature_place_history.sql` adds association revision tokens and
append-only snapshots for initial links, updates and removals. History survives
Feature deletion, prevents token reuse after unlink/relink, and records the actor
for link/update writes. Deletion evidence intentionally has no actor: a cascade
must not be attributed to the previous editor. An explicit unlink command still
needs its own authenticated action evidence.

`prepareFeaturePlaceAssociationWrite` prepares a trusted internal conditional write,
guarded by persisted project scope, non-draft status, Feature `modifiedAt` and the
expected association revision. It returns the new token and a batchable query.
Subsequent materialization statements must require that token to exist; a failed
compare-and-swap returns no rows and must not update effective Feature values.
Tests cover that stale-batch invariant, transactional rollback including history,
immutable evidence and token reuse. Accepted Place reads now expose the concurrency
token. This primitive is not a client linking command: authorization, persisted
baseline extraction and full effective-value materialization remain to be connected.

Local application of `0110` passed integrity and FK checks with no Feature,
translation or property differences from the production snapshot. The focused
Place/service/remote suites pass 40 tests. The broader type check retains ten
pre-existing diagnostics outside these changed files; no deployment was performed.

### Persisted baseline extraction and initial linking (Refs #194)

`readFeaturePlaceBaseline` reads persisted Feature names, Point geometry, canonical
Address envelope/corrections and relevant property assignments. It maps HYPE locale
keys to SaanSeoi tags. The universal phone field is identified by key plus the `core`
hub scope; this is not a project or organisation phone definition. Valid scalar or
array phone values retain their existing spelling and order. Legacy brand options
retain `hypePropertyValueId` and localized names, without implying a canonical brand
identity. Ambiguous properties, invalid phones/addresses/brands require review rather
than silent omission. Draft, intangible and non-Point Features are excluded.

`linkInitialFeaturePlace` derives initial overrides from this persisted baseline and
an explicitly selected, scope-accessible immutable Place revision. It uses both
Feature and association concurrency guards, and does not rewrite effective Feature
columns or timestamps. It remains internal until ordinary editing writes inheritance
inputs and materialized values together. Full structured Address corrections remain
in the existing Feature envelope; linking does not replace that evidence.

The local-only read-only `scripts/places/assess-features.ts private-output.json`
reports readiness and exclusion reasons without selecting any establishment identity.
On the fresh production mirror, 1,190 of 1,271 Features have ready baselines; 56 are
intangible and 25 are drafts. No Place links are created by this assessment. Tests
exercise baseline preservation, exact legacy identifiers, arrays, structured address
corrections, stale edits, private sources and unchanged Feature rows after linking.

### Phone collection editing and presentation (Refs #194)

PhoneField writes now validate every member and persist an ordered E.164 JSON array
in the existing text-valued property storage. Legacy scalar values remain readable;
this change does not bulk-rewrite the production mirror. Empty text remains optional
null and an explicit empty array remains `[]`. JSON arrays and one-number-per-line
form input are supported; malformed arrays, invalid members and classifier bypasses
reject the whole write. Validation uses persisted property component definitions.

The Feature editor displays stored arrays as individual lines and preserves unfinished
input, including trailing newlines. Generic property displays format all numbers,
and Breadline cards create a separate call link for each. Component tests exercise
array loading, input callbacks, trailing-newline preservation and malformed text kept
for correction. Normal Feature edits now persist these phone collections alongside Place overrides.
Place brand storage and reset/adoption materialization remain separate work.

### Linked edit preparation and atomic relations (Refs #194)

`applyFeaturePlaceEdits` compares persisted and submitted effective facts, preserving
all existing override choices and leaving untouched inherited fields absent. Edited
locales are independent; removed translations become clears; arrays replace as a
whole; geometry/address changes replace the atomic location group. Reset-to-inherit
remains an explicit action rather than an implicit consequence of matching source.

`prepareFeaturePlaceRelations` builds translation/property replacement statements
for the same atomic batch as the association and Feature update. Every delete and
insert requires the new association token. One-row inserts keep parameter counts
bounded without splitting the transaction. Tests cover a 151-property replacement,
property translations, checkbox transport, a late injected failure, stale tokens and
unrelated-Feature isolation. Normal linked form saves use these helpers together
with persisted and submitted effective-value projection.

Baseline extraction now accepts persisted kebab-case locale keys as well as form
camel-case keys. The corrected live local assessment retains 1,190 English names and
1,163 names each in Traditional and Simplified Chinese. Readiness remains 1,190
Features, with 56 intangible Features and 25 drafts excluded. No links are created.

### Normal linked Feature form integration (Refs #194)

The authorized `featureForm` update handler now routes linked Features through
`saveLinkedFeatureForm`. Submitted baseline projection uses persisted property
definitions and verifies legacy brand option ownership; client-hydrated property or
brand metadata is not used as identity evidence. Existing overrides are compared
against the proposed effective values, then association/history, parent Feature,
translations and changed properties are written in one conditional D1 batch. Stale
writes and review-required changes do not fall through to the legacy save path.
Unchanged geometry is omitted from the update to avoid unnecessary spatial/MTR work.
Project transfers and non-Point geometry changes require review. Feature-owned
status flags can change without changing the physical Place identity.

Service tests cover a real linked edit, unchanged inherited names, phone arrays,
stale saves and full rollback on a child-write failure. Remote tests cover linked
success/conflict/review routing and absence of legacy relation writes. Seventy-five
targeted service, remote, import and contribution-guard tests pass. An isolated copy
of the fresh local mirror also passed initial linking and a normal description edit:
only parent modifiedAt changed, effective Place facts stayed identical, and replay
with the old timestamp was rejected. The primary mirror still has zero associations
and zero Feature/translation/property differences from the production snapshot.

Normal creation, unlinked saves and contribution drafts use the atomic services
described below. Reset/adoption materialization, Place brand storage and source
synchronization remain outstanding. No remote database mutation or deployment was performed.

### Initial-link/form-save serialization (Refs #194)

Migration `0111_feature_form_write_token.sql` adds a server-owned Feature form token,
excluded from public/select, insert and update Zod schemas. Unlinked normal form
saves now use `saveUnlinkedFeatureForm`: parent and relation changes share one D1
batch, the parent checks both modifiedAt and absence of an association, and every
child statement requires the newly generated token. If linking wins first, no form
rows change. If saving wins first, linking must use the completed new baseline.
The unique token avoids treating a coincidentally equal timestamp as a winning write.
Linked and unlinked handlers receive the same authorized form snapshot.

Tests cover both orderings, rollback of token/parent/children after a late failure,
translator access without property replacement, and affected import/contribution
and spatial read paths (117 tests pass). Actual local D1 rehearsal on an isolated
copy also passed stale-save rejection, stale-link rejection, current-baseline linking
and rejection of an unlinked save after linking. The primary mirror's original
Feature columns, translations and properties remain identical to production; its
new tokens are all null and integrity/FK checks pass. Migration 0111 is local only.

### Atomic creation and contribution lifecycle (Refs #194)

`createFeatureForm` commits new Features and their complete translation/property
snapshots in a single batch. Normal creation and user-contribution creation use it;
a child failure cannot leave a half-created Feature visible for initial linking.
Contribution draft edits use `saveUnlinkedFeatureForm` with an atomic `isDraft=true`
precondition, so a draft finalized during validation cannot be overwritten.

The application write-path audit found that task review, bulk state changes and
hierarchy cascades update Feature-owned state or ancestry, not inherited Place facts.
Reported-missing reviews can mark a linked Feature intangible without changing its
physical Place. Subsequent linked edits remain supported; initial migration still
excludes intangible records without an existing association. Drafts and non-Point
records remain ineligible for initial links. Tests cover creation rollback, duplicate
identities, finalized-draft rejection and editing after a reported-missing status.

### Authorized initial-link command (Refs #194)

`linkFeaturePlace` accepts only a Feature ID, selected existing Place/revision IDs
and the editor's Feature timestamp. It probes persisted ancestry and authorizes all
inheritable field groups with the existing Feature update policy. Translators cannot
link Places through translation-only access; unrelated project managers and anonymous
sessions are also denied. Client-supplied project scope, overrides or baseline facts
are rejected by the strict input schema.

The command delegates to baseline-preserving initial linking, returning a new
association token. Stale/existing links return 409, unavailable/private-incompatible
sources return an indistinguishable 404, and ineligible/review baselines return 422.
Raw source evidence is never returned. Backend linking is now available; source
selection UI, relinking/unlinking, override resets, source adoption and the migration
rehearsal remain outstanding.

### Live source discovery (Refs #194)

`searchFeaturePlaces` now searches SaanSeoi's latest published Hong Kong index after
checking full inherited-field edit authorization against persisted Feature ancestry.
Queries are limited to 200 characters and 20 results; credentials and the upstream
endpoint are server-owned. Missing configuration and upstream failures are distinct
from a successful empty result, and upstream diagnostics are not exposed.

Discovery returns ranked source identities and localized names/brands, explicitly
labelled `saanseoi-latest`. It does not write Places or create associations. SaanSeoi's
search endpoint does not supply canonical geometry or publication pins, so candidate
resolution must retrieve verified canonical evidence before offering an import/link.
The bakery-only local mirror must not be presented as the complete Places index.

Twenty-four focused source/remote tests pass. A read-only live search returned three
validated candidates. Type checking reports the existing 10 unrelated errors and
19 warnings, with no diagnostics in this change. Candidate resolution and the basic
selection UI remain the next implementation step; no deployment was performed.

### Verified candidate resolution (Refs #194)

`getFeaturePlaceCandidate` resolves a selected SaanSeoi ID and resource release to
an accessible immutable mirrored revision. It requires full inherited-field edit
permissions, derives project ancestry server-side, and excludes missing/review source
identities and private records owned by other projects. Only validated projected
facts are returned, never raw source payloads. Discovery labels cannot supply facts.
A missing exact release returns `source-import-needed`; no nearby match, older release
or latest-only detail response is substituted. Resolution does not create links.

The canonical collection currently lacks a Place-ID filter, while the detail endpoint
is latest-only. Efficient canonical import of a previously unmirrored search result
still requires a source API extension or complete publication mirror; the current
bakery mirror supports previews but is not the full source catalogue. This remains
an explicit implementation gap, not a completed selection/import workflow.

### Basic Feature Place selection UI (Refs #194)

The Feature Address facet now contains a Place section using the shared SectionHeader,
TextInput and Button components, with English/Traditional Chinese/Simplified Chinese
messages. Editors can search the live source, preview a mirrored canonical candidate's
names/address/coordinates and explicitly link it. The preview explains baseline
preservation; unsaved Feature edits disable linking. Existing associations are shown
read-only until relinking/reset controls are implemented. Unmirrored candidates show
an import-needed state rather than becoming manual Places or unverified links.

Browser verification used the installed Playwright package and Chrome against the
isolated local rehearsal database: live Bakehouse search returned nine candidates,
the first resolved to mirrored facts, and an unsaved title edit disabled linking.
No unrelated establishment was linked and no test edit was saved. The local server
was stopped after verification. The initial automated coordinate-input check raced the focus transition. A follow-up
with settled focus verified that the coordinate edit persists, enables Save and
disables Place linking; no coordinate-control code change was required. External map tiles also returned 401 in this local
session. These do not invalidate the verified search/preview/title-edit guard.

61 focused service/source/remote tests pass. Type checking remains at the existing
10 unrelated errors and 19 warnings, with no changed-path diagnostics. Full source
import-on-selection, manual creation, relinking/reset and migration acceptance remain
outstanding; this is basic selection UI, not completion of the Places migration.


### Private local Place creation UI (Refs #194)

The Feature Place section now offers explicit local creation using the existing
project-authorized command. Editors choose unresolved (eligible for later source
matching) or intentionally manual, supply a localized name and optional address text,
and use the saved Feature coordinates. Unsaved Feature changes disable creation.
Local addresses remain unresolved without invented canonical IDs. Creation is a
separate action from linking: it creates a private project-owned resource and displays
its preview; only explicit confirmation associates it with the Feature. Linked local
Places display their manual/unresolved state.

An isolated local browser rehearsal created an unresolved Place, previewed and linked
it, and confirmed the association after reload. Database inspection verified project
ownership, null ssId, local revision provenance, one history event, and unchanged
original Feature columns. No edit or association was made in the primary mirrors.
Manual/unresolved resource discovery and administration are still needed for reuse
when an editor leaves after creation without linking; no upstream submission occurs.

### Reusing private local Places (Refs #194)

Feature Place search now also queries the owning project's manual/unresolved Places,
with project scope derived from persisted Feature ancestry and full inherited-field
edit authorization. It searches all localized names on the latest local revision,
treats wildcard characters literally and returns at most twenty validated projections.
Other projects' records and raw provenance never appear. Local results show their
manual/unresolved intent and can be previewed before the existing explicit link action.

Upstream and local searches settle independently: source unavailability cannot hide
usable private records, and partial failures are labelled separately from no matches.
Explicit search refreshes local results so newly created Places can be rediscovered.
This closes the creation-without-linking discovery gap; full local Place administration
and editing remain future work.

56 focused service/remote tests pass, including cross-project isolation, latest-only
matching, literal wildcards, localized names, result bounds and authorization. A local
browser rehearsal deliberately blocked upstream search and still found and previewed
private Places. No unrelated Feature link was made. Type checking remains at the
existing 10 unrelated errors and 19 warnings, with no changed-path diagnostics.

### Explicit Feature reassociation (Refs #194)

`relinkFeaturePlace` changes one Feature's selected Place/revision after full
inherited-field edit authorization. It requires both the persisted Feature timestamp
and association revision, uses the existing atomic association guard/history triggers,
and derives scope and actor server-side. Missing/private destinations and stale tokens
produce no writes. The destination must have current source availability.

Reassociation preserves effective facts by deriving overrides against the destination,
then retaining every existing explicit override/clear even if equal to the new source.
New source locales absent from the Feature are explicitly cleared. Feature columns and
spatial jobs remain untouched because no effective location changes. The original
Place is retained and other Features are unaffected. This is not identity merging,
manual-Place promotion or SaanSeoi ssId churn reconciliation; those remain separate.

The UI offers an explicit Change Place mode and destination confirmation. It captures
the association revision when editing begins and blocks changes with unsaved Feature
edits. Search, local creation and previews reuse the existing selection workflow.

59 focused service/remote tests pass. An isolated browser rehearsal changed a local
association and confirmed it after reload. Database checks verified a different Place
ID, unchanged Feature row, retained original Place and exactly one added history row
with previous revision and actor. No primary mirror or production data changed. Type
checking remains at 10 unrelated errors/19 warnings, with no changed-path diagnostics.

### Existing-Feature split manifest (Refs #194)

`bun scripts/places/plan-feature-split.ts .local/places/feature-split-plan.json`
reads the refreshed default local mirror and produces a private manifest without
writing associations. Every unlinked eligible Feature receives a deterministic Place
and baseline revision identity, project ownership, expected timestamp, unresolved
facts, preservation overrides and legacy address/property provenance. Already-linked
records are excluded and proposed Place identity collisions fail explicitly.

This is the unresolved fallback plan, not a claim that source identity matching is
complete. Reviewed canonical matches must supersede the relevant fallback proposals
before final application. Intangible Features and drafts remain excluded; nameless,
invalid or non-preservable baselines require review rather than synthetic names.
Canonical address IDs are not claimed by a local Place: complete old address evidence
remains in provenance and any necessary atomic location override. Phone normalization
in the Place projection cannot silently rewrite the effective Feature spelling.

The primary mirror produced 1,190 proposals, 56 intangible exclusions and 25 draft
exclusions. Every proposal passed exact resolver equality against its persisted
baseline. Independent SQLite checks verified unique identities, project scope and
Feature timestamps for all 1,190 records; primary associations remain zero. Three
focused planner tests cover deterministic preservation, legacy address/phone/brand
handling, null/clear semantics and invalid baseline review. Type checking remains at
10 unrelated errors/19 warnings. The manifest contains private source data and is
ignored; only planner code is committed. Transactional application/replay rehearsal
and the Breadline importer rebase are still outstanding.

### Atomic split application and full local rehearsal (Refs #194)

`applyUnresolvedFeatureSplit` recomputes each proposal from current persisted values
before writing. It rejects altered manifests, changed baselines, existing identity
collisions and later association edits. Place, immutable local revision and initial
association/history are one guarded D1 batch per Feature. A concurrent save winning
before that batch leaves no orphan records; a late history failure rolls everything
back. Exact completed splits replay without new history. Original Feature values and
spatial jobs are never updated by this operation. The actor is retained in provenance
and association history.

`apply-feature-split.ts <manifest> <isolated-state> <receipt>` deliberately restricts
execution to existing `.local/places/*-state` directories, with remote bindings disabled.
It stops at the first conflict and writes a private receipt. The manifest is resumable,
not one transaction across all Features: completed individual splits remain committed.
This rehearsal CLI does not provide production execution authorization or a deploy step.

`verify-feature-split.ts <manifest> <baseline.sqlite> <result.sqlite>` compares all
original Feature, translation, property and property-translation rows in both directions,
then resolves actual accepted revision facts and overrides independently of the apply
receipt. It checks planned identities, private project ownership, local provenance,
exactly one history entry per split, foreign keys and SQLite integrity.

A fresh isolated SQLite backup of the existing primary mirror applied all 1,190 plans.
A second complete run returned 1,190 `already-applied` results. Verification passed both
before and after replay: original rows unchanged, effective values preserved, one history
per split, integrity `ok`, zero foreign-key violations. The primary mirror remains
unassociated. Forty-eight focused service/planner tests cover normal application,
replay, changed source values, manifest tampering, identity collisions, concurrent-save
ordering, later overrides and late transaction failure. Private databases/manifests/
receipts remain ignored. Reviewed source matching, final migration packaging, Breadline
importer rebase and remaining source lifecycle work are still outstanding.

### Breadline Places import rebase (Refs #194)

`scripts/breadline/features.ts` now generates a linked private unresolved Place and
immutable local revision for each newly eligible donor/dropoff Feature. Brands live
in Place arrays; the importer no longer seeds classifier options or assigns legacy
brand properties. Known brand translations and curated independent-shop identities
are retained with provenance identifiers; unclassified `independent` is not invented
as an establishment brand. The original source brand code remains in the snapshot.

| Breadline source | HYPE destination |
| --- | --- |
| `donors.id` / `dropoffs.id`, source row hash | Stable Feature ID and `breadlineImportFeature`; deterministic Place/revision IDs |
| `name_en`, `name_zh` | Place localized names and Feature titles; existing Traditional-Chinese fallback for both Chinese locales retained |
| display/full address fields | Unresolved SaanSeoi-shaped Place address and Feature `addressMeta.address`; legacy display strings retained |
| longitude/latitude plus reviewed correction | Place Point and effective Feature geometry/spatial index |
| donor `phone` | Normalized Place phone array and universal `gPropPhNum01` JSON array, including explicit empty arrays |
| donor `brand` plus curated identities | Place brand identifiers/names; no new `WhWlW8KcN2wq` Feature assignments |
| donor recorded runs | Import eligibility; schedules and active status do not substitute for run history |
| donor `active`, privacy/location-review exceptions | Feature visitability/publication/review state |
| reviewed MTR decisions | Existing core Feature MTR fields and resolution evidence; matching routing job cleared |
| complete source row, hash, import policy/correction | Private immutable Place revision provenance; never asserted to be canonical SaanSeoi data |

Full local rehearsal on a separate copy of the split database imported 311 donors and
19 dropoffs, excluding 155 donors without recorded runs. All 330 imports have private
Place associations, matching geometry/address/phone arrays, and one history event.
All 64 reviewed MTR results were independently compared to stored core fields/evidence;
#558/#727 retain their accepted labels without invented entrance mappings. In this
fresh export #171 has no recorded runs and is excluded; #658 remains unpublished.

Regenerating against the imported copy matched all 330 mappings and created zero new
records. Reapplying that generated replay SQL added no association history. Existing
Feature/Place rows and property catalogs remain unchanged; integrity is `ok`, with
zero FK violations. Two integration tests cover run eligibility, linked Place facts,
array phones, absence of legacy brand assignments, regeneration/replay and rollback
on association-history failure. Tests use Python sqlite3's fail-fast transactional
runner: Bun multi-statement `exec` was observed skipping an intermediate failing
statement and must not be used to apply generated migrations.

The private generated SQL and rehearsal databases are ignored. Final reviewed source
matching, structured-address curation, inherited brand presentation and production
migration packaging remain outstanding; nothing was deployed or remotely mutated.

### Accepted Place brand read projection (Refs #194)

Feature list, detail and query hydration now project brand arrays from the accepted
`featurePlace.factsRevisionId`. The projection honors explicit override and clear,
checks private Place ownership, and excludes drafts. It does not read a newer source
revision before adoption or create duplicate Feature classifier assignments. JSON is
decoded in read-only response contracts, not writable Feature input schemas.

Breadline cards and shared Feature rows consume this projection. A single recognized
brand keeps its bundled logo and localized name; multiple brands retain all names
without arbitrarily choosing one logo. An empty array suppresses legacy classifier
fallback; an unassociated Feature retains that fallback during migration.

Validation: 144 tests pass across Place services, brand presentation, Feature query
services, remote APIs and query integration. The full type-check reports the existing
10 errors and 19 warnings outside this change. A browser check against an isolated
copy of the imported rehearsal database opened the Maison Kayser donor and its
unresolved Place association. List-logo visual acceptance remains unverified: the
admin Features index returned an empty list in that session. Brand override editing
and complete retirement of the legacy classifier UI remain outstanding.

### Imported-list browser acceptance and initialization race (Refs #194)

The empty admin list observed above was an account-initialization race. A request
started before session hydration could finish after the account scope changed and
mark admin initialization complete, suppressing the replacement request. Admin
initialization now marks only the scope it actually loaded as ready; the layout
retries after a superseded attempt settles. A regression test changes account scope
while the first request is pending and verifies a second initialization request.

Browser verification on the same isolated imported database now shows 1,565 visible
Features. Searching Maison Kayser renders all eight imported donor rows with the
bundled Kayser logo, confirming inherited Place brands reach actual list presentation.
The local screenshot is `output/playwright/place-brand-index.png` (not committed).
All 11 context-boundary tests pass; type-check remains at 10 unrelated errors and
19 warnings. This closes the earlier list-logo acceptance gap, not the remaining
brand editor, source lifecycle or migration requirements.

### Feature brand corrections and explicit inheritance (Refs #194)

The Feature Place section now offers accepted-Place inheritance, a local brand-array
correction, and explicit suppression. Corrections edit English and both Chinese names
while retaining other source locales and identifiers; users can add or remove brands.
These changes use the regular Feature Save/Reset flow, not an independent save button.
The read projection exposes only the brand mode alongside effective facts, not raw
source payloads or the full override object. Linked Features hide the legacy classifier
field; attempts to change its assignment through the normal save are rejected.

The form carries an explicit brand choice and the association revision viewed by the
editor. The existing property-edit permission is required before relation hydration;
translator-only access cannot set, clear or reset brands. Creation and unlinked saves
cannot silently discard this intent. The association/history and ordinary Feature
changes commit in the same conditional batch, guarded by both Feature timestamp and
association revision. Reset inherits the accepted facts revision, never the newest
unreviewed source revision. Brand corrections do not mutate Place snapshots.

Browser rehearsal on the isolated imported database exercised clear, reset, localized
correction and reset again through the header Save action. Persisted overrides and
unchanged source brand facts were checked directly. The legacy empty catalog field
exposed a baseline validation bug: an unassigned empty classifier is now treated as
absent, while malformed/nonempty assignments still fail validation. A local screenshot
is retained at `output/playwright/place-brand-editor.png` (not committed).

75 focused tests pass, including malformed form envelopes, empty arrays, stale
association rejection, transactional rollback, all three brand modes, translator
rejection and legacy classifier rejection. Full type-check retains its existing
10 unrelated errors / 19 warnings baseline. General name/phone/location inheritance
reset controls, unlinking, source adoption/sync and final migration work remain open.

### Name, phone and atomic location inheritance resets (Refs #194, #213)

The Place section now lets an editor select individual supported name locales, the
phone collection, or the complete location/address group for reset on the regular
Feature Save. Selection can be toggled off; the normal form Reset discards it. Reset
intent contains only field identities and the viewed association revision, never
client-supplied source facts. Selected resets take precedence over same-field edits
in that submission; other locale values and descriptions are retained.

The server reads the association's exact independently accepted facts/location
revisions under private Place ownership checks. It restores source names, performs
a targeted universal-phone property write, and replaces geometry plus canonical
address together, clearing local address corrections. Missing source names, invalid
Hong Kong phone arrays, ambiguous universal-phone definitions and missing canonical
address dependencies fail before any writes. Accepted source snapshots remain
immutable. Phone spelling/order remain equal to accepted facts.

Authorization covers every affected field group before source reads: translators
cannot reset phone or location fields. Feature timestamp and association revision
guard the batch containing override history, parent, translations and properties.
Actual materialized geometry changes determine spatial-index rebuilding and MTR
scheduling; the existing geometry triggers clear stale MTR results and queue routing.
A name/phone-only reset does not rewrite geometry or enqueue routing.

78 focused tests pass. They cover independent accepted revisions versus a newer
unaccepted revision, source validation, malformed intent, translator denial, stale
writes, targeted preservation of unrelated properties/translations, and rollback of
parent/history/MTR effects after an injected final phone-write failure. Browser
rehearsal saved name/phone/location resets on an isolated imported donor; direct DB
checks confirmed inheritance modes and effective phone/geometry equality with the
accepted source. Local screenshot: `output/playwright/place-reset-editor.png`.
Full type-check retains the existing 10 unrelated errors / 19 warnings baseline.

Source import/matching and address curation, monthly sync and adoption,
identity lifecycle, and final migration application/acceptance remain unfinished.
No production mutation or deployment was performed.
