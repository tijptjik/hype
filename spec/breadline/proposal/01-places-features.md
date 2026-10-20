# Places, feature inheritance and SaanSeoi addresses

Accepted architecture, 20 October 2026. Refs #194 (migration), #213 (location and
routing), parent #180. This supersedes the external-lookup-only interpretation of
Places in the schedule proposal. The Breadline importer now creates unresolved Places
and associated donor/dropoff Features; local application and replay are verified.
Schedule import remains dependent on #195/#196, and production application is pending.

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

Active Place states are `linked`, `unresolved`, and `manual`; absorbed identities use
`redirect` and cannot receive new Feature associations. Unresolved records participate
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

The [Address curation hand-off](places-address-curation.md) describes the current
source-tool workflow and the outstanding round-trip acceptance.

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
only after each item has an applied or durable review outcome. This run checkpoint is
not a Feature acceptance: retain each Feature's last accepted snapshot on failed reads or
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
Features. The ready phase now ingests one retained candidate or assesses one Feature per
step through `placeRefreshProcess.ts`. Only after every item has a durable outcome does
the completed-publication checkpoint advance. The scheduled Worker now invokes this
workflow. Source changes-feed evidence
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

Migration `0115_place_refresh_processing.sql` adds ingestion/Feature cursors and run
outcome receipts. It is applied locally with integrity and foreign-key checks passing;
all 1,271 original Features remain unchanged. Source writes and per-Feature processing
are fenced, and the outcome/cursor commit atomically. Failed cursor writes replay
already-applied groups without duplicating decisions or routing jobs. Missing sources
and identity changes retain explicit source review outcomes. Per-Feature publication
checks prevent a long-running scan from rewinding a newly linked Feature; absent
chronology or conflicting records within one publication require review. Identical
canonical records with only different collection page metadata remain eligible.

The scheduled Worker is implemented but not deployed, so monthly refresh is not yet
running remotely. SQLite-backed tests cover both
automatic groups, policy review, rejection replay, lease loss between groups, atomic
write fencing, association scope changes and policy edits after assessment.

`workers/place-refresh` invokes one durable step every five minutes; upstream publication
discovery remains monthly. It uses a primary D1 session and then attempts one pending MTR
job, including after a failed refresh step. Routing failures retain the durable job and
do not roll back completed Place processing. Logs include only stable task/status codes.
Preview and production configs select their matching SaanSeoi, D1 and routing bindings;
local configuration has no remote routing binding. Required secrets are `SAANSEOI_API_KEY`
and `ROUTING_TOKEN`. No deployment or secret provisioning has been performed.

Validation: `bun run check:place-refresh` passes, both environment bundles build with
Wrangler `--dry-run`, and the compiled Worker runs in isolated Miniflare with outbound
requests blocked (ready-run completion, then idle, with the lease released). Scheduler
failure/routing tests and existing locale/Place tests pass. Pure locale record helpers
now live in `src/lib/i18n/localeRecords.ts`, with existing app exports preserved, so
Worker bundling does not pull in SvelteKit remote translation APIs.

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

The network reader and its candidate/refresh integration are defined below under
“Pinned structured Address hydration”. The adapter remains the pure validation boundary;
upstream curation and publication are separate from accepting an address in HYPE (Refs #194).

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

Existing Feature candidate discovery is reproducible with
`scripts/places/match-feature-places.py --plan <private-split-manifest> --saanseoi
<current-mirror.sqlite> --publication <captured-response.json> --output <private-report>`.
Use `--immutable-snapshot` only for a sealed standalone export without a WAL. The
read-only scan verifies the selected snapshot, retains the split-manifest hash and
Feature concurrency timestamps, and searches exact localized names, contact numbers
and nearby coordinates across the full canonical scope. Exact addresses and shared
versus unique phone evidence remain explicit. Nearby-only suggestions remain unresolved;
independently corroborated candidates are prioritized for review, never automatically
linked. No report decision changes the migration's baseline-preservation guarantees.

The retained 1,190 eligible Feature baselines have 335 exact-name candidate sets (203
within 25 metres); none contains phone evidence or an exact freeform-address match.
The other 81 Features remain excluded as drafts/intangible records. These findings are
candidate evidence, not 335 approved identities. Reports include source/candidate names,
coordinates and addresses privately under `.local/places/`; no raw exports are committed.

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

`apply-feature-split.ts <manifest> <isolated-state|--primary-local> <receipt>` defaults
to existing `.local/places/*-state` directories. The explicit `--primary-local` target
uses `.wrangler/state/v3` and rejects `HYPE_DEV_STATE`; take a backup before applying.
Remote bindings are disabled for both targets.
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

### Primary local split and Breadline application (Refs #194)

The refreshed primary local database now contains 1,601 Features, 2,850 Places and
1,520 Feature–Place associations. The pre-application SQLite backup is retained
privately. All 1,190 existing eligible Features were split into private unresolved
Places; the independent split verifier confirmed unchanged original Feature,
translation and property rows, preserved effective values, one history entry per
split, integrity `ok` and zero foreign-key violations. The 81 intangible/draft
exclusions remain unassociated.

The importer was regenerated against that post-split state and applied in a
fail-fast SQLite transaction: 311 donors with recorded runs and 19 dropoffs were
imported; 155 donors without runs were excluded. Existing rows and property catalogs
were preserved. Imported Place facts, accepted revisions, geometry/address, publication
and MTR fields match the independently verified rehearsal. Regeneration matched all
330 imports with zero creations, and replay added no association history. The two
importer integration tests pass. Private SQL, databases and receipts remain ignored.

This completes primary-local application of the unresolved fallback migration, not
canonical identity review or production rollout. Canonical matching/promotion, address
curation and lifecycle acceptance remain necessary; no production mutation or deployment
was performed.

### Reviewed Place identity transition primitive (Refs #194)

Migration 0116 adds append-only identity history, including the previous source binding,
reviewer/reason and exact immutable source revision. `acceptPlaceIdentity` supports
manual/unresolved promotion and reviewed ssId corrections while preserving the HYPE
Place ID, private ownership, all Feature links, accepted revision groups and overrides.
Identity acceptance does not implicitly accept new source facts or location; the existing
adoption review remains responsible for those changes.

The trusted service requires a captured state/source/owner/history baseline. Its atomic
batch rechecks that baseline, writes the canonical revision and review evidence, then
updates the source binding. History-tail fencing rejects stale reviews even after an
ssId round trip. A late identity-write failure rolls back the source revision and history.
Another Place's current or historical claim returns `merge-required`; this primitive
never silently moves Feature relationships or merges immutable histories. Source ingestion
also refuses to recreate retired IDs and fences revision writes against concurrent identity
changes. Canonical source revisions use the same deterministic hashing as ordinary ingestion.

The caller must separately authorize Place ownership or global stewardship and supply
server-verified publication-pinned source evidence. This is not yet exposed as a remote
command or UI: authorized review presentation and explicit merge/redirect handling remain
outstanding. No unconfirmed source match has been accepted in the primary database.
Migration 0116 is applied locally. Focused service, refresh, source-client, Worker and remote
coverage passes 125 tests; Worker type-check passes and the app retains its existing
10 errors / 19 warnings baseline. No deployment or production mutation was performed.

### Authorized retained identity reviews (Refs #194)

`placeIdentity.remote.ts` exposes preparation, read and acceptance of an immutable
identity comparison. Preparation accepts only a HYPE Place ID, candidate ssId and a
pinned canonical collection page selector (publication and offset). The server fetches
that bounded page and requires exactly one matching canonical record; search labels,
client facts, credentials and arbitrary source URLs are not accepted. Source errors
remain explicit and are sanitized. No source identity is claimed during preparation.
This API is not yet wired to the Feature editor's discovery/review interface.

Private Place management delegates to the persisted owner's project-management policy;
shared Place identity administration requires a core hub administrator. Feature edit
permission and non-core hub administration do not grant shared identity control. Each
read/acceptance reauthorizes current ownership. The projected comparison contains facts,
source identifiers, issue kinds and stale state, while raw payloads stay server-side.

Migration 0117 retains the original baseline and source projection, with immutable
review evidence. Accepted identity history references the exact review ID. Acceptance
uses only that retained projection plus the authenticated actor and required reason.
The baseline includes ownership, state, ssId, source availability, latest source revision
and history tail. A concurrent revision change inside the D1 batch leaves neither an
identity revision nor history entry. Each identity event has its own revision ID to
prove which guarded write succeeded; ordinary ingestion reuses the earliest exact
source-content revision, retaining idempotence after promotion.

All 134 focused service, remote, source-client, refresh and Worker tests pass. Worker
type-check passes; full application checking retains 10 existing errors / 19 warnings.
Migration 0117 is applied locally; integrity is `ok`, foreign-key violations are zero,
and all 1,601 Features / 1,520 associations remain unchanged. No unconfirmed identity
review or acceptance was applied to primary data. Merge/redirect handling, a usable
review/discovery UI, address curation and broader acceptance work remain outstanding.
No deployment or production mutation was performed.

### Feature-editor identity comparison (Refs #194)

The Feature editor's Address tab now offers a Place identity review section only when
current persisted ownership and roles permit identity management. Review controls expand
explicitly, and reuse the established source search and exact mirrored-revision preview.
Users do not enter publication IDs or collection offsets. A new server command captures
that selected canonical revision after checking source availability, current ssId and
shared/same-project ownership; local baselines, obsolete identities and another project's
private source evidence are rejected. Retained raw payloads remain server-side.

The comparison shows the current Place and proposed source side by side, including
localized names, phones, brands, coordinates and structured address displays. A reason
is required before confirmation. Dirty Feature forms cannot capture or accept identity
comparisons. The UI explains that Feature values/overrides remain unchanged; successful
identity acceptance refreshes the ordinary form. Async results cannot replace another
Feature's review after navigation, and settled comparisons remain visible during loading.
English, Traditional Chinese and Simplified Chinese messages are included.

Already-claimed source IDs produce an explicit merge-required outcome without changing
identities. This is not yet a merge UI: merge/redirect implementation is still required
before those comparisons can be resolved. Source candidates not mirrored yet retain the
existing import-needed message; interactive ingestion/discovery integration remains open.

Browser verification on an isolated copy of the primary local database searched Maison
Kayser, loaded the comparison, verified the disabled confirmation without a reason, and
observed the merge-required outcome after confirmation. No browser errors occurred.
Independent SQLite comparison proved Feature, association/history, Place/revision and
identity-history tables unchanged; only one retained comparison was added. Private
screenshots are at `output/playwright/place-identity-comparison.png` and
`output/playwright/place-identity-merge-required.png`. The dev server was stopped.
136 focused tests pass and the full app check retains 10 existing errors / 19 warnings.
No primary identity acceptance, deployment or production mutation was performed.


### Reviewed merge and permanent redirects (Refs #194)

Migration 0118 retains absorbed Place IDs as immutable redirects rather than deleting or
reusing them. Redirect resolution follows multiple merges and checks the final survivor's
owner before returning its identity. Reactivation, redirect editing/deletion, cycles through
retired targets and new Feature associations to redirected Places are prohibited. Existing
Feature queries still resolve only live associations; stale candidate links must be refreshed.

`capturePlaceMergeReview` captures both independently authorized Place baselines, the exact
canonical source evidence already reviewed, and an ordered association/ancestry token with
an affected-Feature count. `applyPlaceMergeReview` rechecks all of them in its atomic batch.
It retains the target HYPE Place ID and ownership, copies source revisions with unchanged
facts/payloads into that survivor, and moves source associations to their corresponding copied
facts/location revisions. Explicit overrides, effective Feature fields, timestamps and MTR
values remain unchanged. Association history records the move; original source revisions
remain immutable under the absorbed identity. Identity history links to the source comparison,
and the permanent redirect records the merge review, actor and reason.

The first guarded redirect insert is a unique transaction receipt for every subsequent write.
A concurrent Feature edit or Place/source change therefore leaves no partial merge. Later
errors roll back revisions, associations, redirects and identities together. Historical source
claims follow their surviving alias set, and source ingestion remains idempotent after merging.
An exact replay is a stale conflict, never a second merge.

Privacy is preserved: a private source cannot be widened into a shared or differently owned
survivor, and another project's Features cannot be moved into a private Place. Such cases
return `scope-conflict` and require a separate visibility/ownership decision. The caller must
administer BOTH Places; these are trusted domain services, not yet remote merge commands.
The editor still reports merge-required until the two-Place authorization/impact review and
explicit merge confirmation are wired into its existing identity comparison.

The parent-table rebuild was rehearsed through local D1 against a populated copy. All 77
existing application tables were unchanged, with integrity `ok` and zero FK violations.
The migration preserves RESTRICT relationships, verifies actual foreign keys before clearing
SQLite's stale deferred counter, and never disables `foreign_keys`. It is now applied to the
primary local database after a fresh backup, with the same 77-table preservation check and
zero primary merges. A local D1 runtime rehearsal used synthetic source evidence and one
existing Feature in the isolated copy: all Feature fields stayed unchanged, redirect resolution
worked, and replay was rejected. No unconfirmed primary identities were merged.

141 focused tests pass, including independent revision groups, overrides, stale and concurrent
association edits, late-failure rollback, privacy conflicts, multiple redirect steps, and
post-merge source ID correction. Worker type-check passes; full application checking retains
10 existing errors / 19 warnings. No deployment or production mutation was performed.

### Explicit two-Place merge workflow (Refs #194)

The identity editor now offers a separate merge-impact review after an identity comparison
reports an already-claimed source. Preparation, reading the impact and final confirmation
independently authorize the current owners of both Places. The second Place comes from
retained evidence; clients cannot supply source identity, ownership or actor authority.
Shared source identities still require core administration. Revoked roles, missing reviews,
stale state and privacy conflicts do not execute any merge writes.

The impact view shows the affected-Feature count, retained visibility, redirect behavior
and history preservation. It requires a second reason and explicit Confirm merge action;
confirming an establishment identity alone does not merge Places. Dirty forms cannot prepare
or confirm a merge. Successful completion refreshes the ordinary Feature form and reports
preservation of the surviving HYPE ID and Feature values/overrides. Messages cover English,
Traditional Chinese and Simplified Chinese. Captured impact remains readable with stale and
applied status, but raw baselines and affected Feature contents stay server-side.

An isolated browser rehearsal exercised live source discovery, identity comparison, the
separate merge review, disabled confirmation without a merge reason, and completed merge
confirmation. The selected mirrored source had zero existing Feature associations; the prior
local D1 runtime test separately covered moving one association. Independent SQLite checks
confirmed unchanged Feature/localization/property/association/history and MTR-job rows,
preserved original source revisions, one redirect and the original target Place ID as survivor.
This was a UI-flow rehearsal only, not an accepted match in primary data. No browser errors
occurred; screenshots are private at `output/playwright/place-merge-impact.png` and
`output/playwright/place-merge-complete.png`. The local server was stopped.

145 focused tests pass, including denial on the second identity, role revocation between
review and submission, rejected client authority fields, mandatory merge reason, private
scope incompatibility and saved-impact projection. Worker type-check passes; the full app
retains its existing 10 errors / 19 warnings. Unmirrored-source ingestion, address curation,
source changes-feed integration and the final acceptance audit remain open. No primary
identity decision, deployment or production mutation was performed.

### Canonical candidate loading by exact ID (Refs #194)

Both Feature selection and identity-review selection request canonical ingestion when a
selected source result is not mirrored. `importFeaturePlaceCandidate` authorizes inherited
fields using persisted Feature ancestry before contacting SaanSeoi. It discovers the
publication server-side, verifies the selected source identity and resource release, and
returns only the scoped candidate projection. Client facts, project scope and source URLs
are rejected. Missing records, release drift, source failures and inaccessible identities
remain explicit failures; raw upstream/database diagnostics are not returned.

Candidate lookup uses the canonical collection with `filter[id]`, full profile and the
server-discovered release-set, catalog-revision and known-at selectors. SaanSeoi applies
the exact ID predicate to current records/counts and historical journal selection, retaining
normal publication readiness, geography, locale, pagination and permission handling. The
response echoes `meta.filters.id`; HYPE requires that acknowledgement, at most one exact
matching record and complete pagination. An older server ignoring the filter fails explicitly.
Latest-only detail is not accepted as pinned canonical evidence.

This replaces collection binary search: a live collection-page request timed out during
rehearsal despite successful discovery and the first page. The direct filtered lookup against
the existing read-only production mirror returned that same canonical candidate in about
7 ms after discovery (55 ms). These are local measurements, not production latency claims.
The source API filter (SaanSeoi commit `5dfb3b471`) must be released before HYPE's unmirrored candidate path can work
against the hosted API; neither application has been deployed by this work.

`persistPlaceCandidate` includes an ownership predicate in every ingestion write, preventing
updates to another project's private identity even if ownership changes between the initial
read and the write batch. Retired-source identity protections remain in force. Selection
does not link, merge, accept identity or adopt facts/location. Feature preview callbacks
are invalidated on unmount.

For local source rehearsals, launch HYPE with `HYPE_PLACE_SOURCE_URL=http://127.0.0.1:8787`
(or the local SaanSeoi API port). Vite exposes this setting only during development; builds
receive an empty override and use the hosted endpoint. The server validates a loopback HTTP
origin without credentials, path, query or fragment. It sends a dummy development key to
that local API, never the hosted credential. All Places source commands share this setting.

Validation: 174 focused HYPE tests pass, including ID-filter acknowledgement, current and
historical responses, permission boundaries, exact release checks, private ownership and
concurrent scope changes. Worker checking passes; application checking retains 10 existing errors / 19 warnings.
SaanSeoi has 55 passing focused route,
history and tutorial tests and a passing API type-check; its required Markdown formatting
was run. Browser rehearsals against the real local API and read-only production mirror
verified both identity comparison and Change Place preview for previously unmirrored records,
with zero page errors. Reopening a mirrored result did not call import again. These deliberately
different establishments were selected only to exercise the UI; neither was accepted as a
match or linked to the Feature.

The isolated HYPE database gained exactly two Places, two source revisions and two retained
identity-review records. Every Feature table, property/localization/image record, spatial and
search index, Feature–Place association/history and MTR job remained identical to primary.
No adoption or identity decision, merge or redirect was created. Integrity is OK with zero
foreign-key violations. Screenshots are private at `output/playwright/place-candidate-import.png`
and `output/playwright/place-candidate-replacement.png`. Both servers were stopped. Address
curation, source changes-feed integration and the full acceptance audit remain open.


### Pinned structured Address hydration (Refs #194)

`hydrateSaanSeoiPlaceAddress` now connects the existing dependency validator to the Address
API. It discovers an Address publication as of the Place publication time, validates the
response metadata/permalink, and rereads the exact Address ID with that independent release
set, catalogue revision and known-at pin. The Place and Address catalogues have different
identities. Every request uses the configured trusted endpoint; response-controlled hosts
are never fetched and redirects are rejected. Full records, all requested locales, sources,
coverage and included unit inventories are retained natively.

Exact Address snapshot, owner, inventory and unit validation remains mandatory. An incomplete
reference, missing record, publication mismatch or dependency mismatch retains unresolved
location and stable `addressHydration` review evidence; it does not invent a structured match.
A successful read removes the pending-address issue and replaces any previous hydration review
status. Transient transport/server failures throw for retry without persisting a partial
source revision. Each referenced Address requires at most two 30-second requests; Places
without Address references make none.

Canonical candidate import and explicit source-page identity review hydrate before retaining
source evidence. Both editor selection paths also request ingestion for previously mirrored
candidates whose referenced Addresses remain unresolved. Resolved mirrored selections are
reused. The normal Place replacement preview uses the same structured-address formatter as
identity comparison, with freeform display retained only as fallback.

Monthly refresh hydrates one tracked item during processing, before immutable source
persistence; scanning a 100-record page does not fan out Address requests. Existing lease and
identity predicates fence writes after the network calls. An expired lease creates no revision
or checkpoint. Semantic Address mismatches retain the existing location-review blocker while
eligible facts can still be adopted independently. Successful hydration alone does not link,
accept identity, merge or adopt a Feature location.

Validation: 199 focused tests cover canonical lookup, Address transport/validation, remote
permissions, source persistence, refresh and worker behavior. Tests include pin drift, future
publication, missing/mismatched snapshots/units, retry, resolved-to-unresolved invalidation,
repair, independent fact adoption and expiry during Address reads. The worker check passes;
application checking retains its existing 10 errors / 19 warnings.
A local read-only API rehearsal returned an actual hydrated canonical record with matching
snapshot and no pending-address issue. The saved source mirror predates SaanSeoi's existing
`20261019184429_tired_valeria_richards` rename; that migration was applied only to a reflinked
isolated current-database copy. The original mirror was not changed or refreshed.

The isolated browser rehearsal imported the resolved candidate and displayed its structured
address with zero page errors. Reopening it did not import again. The isolated HYPE database
gained one Place, one immutable source revision and two retained comparisons. All Feature
fields/locales/properties/images, indexes, associations/history and MTR jobs remained identical
to primary state; no adoption, identity acceptance, merge or redirect occurred. Integrity is
OK with zero foreign-key violations. The screenshot is private at
`output/playwright/place-address-hydration.png`. Both local servers were stopped. Address
curation/upsert handling, source changes-feed integration and final acceptance remain open;
no primary or production data was changed and nothing was deployed.


### Durable publisher comparison collection (Refs #194)

Canonical refresh now enqueues a separate publisher-evidence transition. Migration
0119 retains the discovered inventories, comparison plan, resolved publisher pin,
complete response pages, cross-page source identities and resumable cursor. The
worker collects one bounded page per invocation; feed failures retain a stable retry
code and do not block canonical refresh or MTR routing. Source removals are evidence
only and never delete Places or alter Feature adoption.

Inventory discovery has no catalogue/time pin, so its actual response is retained
without claiming historical canonical proof. Duplicate inventory roles collapse only
when release, variant and availability agree. Ambiguous, missing or unavailable
publisher sources require review; an initial baseline does not invent a comparison.
Evidence and progress commit atomically, and immutable-page triggers plus uniqueness
constraints reject duplicate identities and cursor cycles. Lease loss prevents writes.

Local validation on 2026-10-20: migration 0119 passed a backup-copy rehearsal and
was applied to the primary local database, preserving 2,850 Places, 1,601 Features
and 1,520 associations, with integrity and foreign-key checks passing. A separate
local-API rehearsal against sealed source mirrors discovered the August-to-September
publisher comparison and retained two pages (200 changes: 12 added, 188 changed).
This is explicitly a partial feed, still in collection, not a completed comparison.
Focused collector/refresh/scheduler tests cover atomic rollback, pagination, pin
continuity, lease loss/expiry and failure isolation. Worker type-checking passes;
the app check retains its baseline 10 errors and 19 warnings.

Full feed completion, structured-address curation, actual identity decisions,
first-layer browser verification and the broader import acceptance audit remain
outstanding. No production migration or deployment was performed.

### Publisher evidence verification

`scripts/places/verify-source-evidence.py` opens a retained collector database read-only
and checks SQLite integrity, foreign keys, discovery/comparison cardinality, contiguous
page numbers, cursor continuity, exact resolved pins, cross-page identity indexes,
counters and terminal-page completion. It emits aggregate counts and a digest of the
ordered retained evidence without printing publisher payloads. `--require-complete`
rejects empty, queued, collecting and review states. `--summary` additionally requires
one exact-pin match to an independently obtained source API summary and equal added,
changed and removed counts.

Run it after stopping the local SQLite writer, or against a consistent SQLite backup:

```sh
python scripts/places/verify-source-evidence.py DATABASE --require-complete --summary SUMMARY_JSON
PYTHONDONTWRITEBYTECODE=1 python -m unittest discover -s scripts/places -p test_verify_source_evidence.py
```

Obtain `SUMMARY_JSON` from `/places/v0.1/sources/changes` with `view=summary`,
`resourceType=place`, `region=hk` and the comparison's exact `fromRelease` / `toRelease`.
A summary is verification evidence; it cannot replace retained record pages. The local
source API rehearsal uses the existing sealed publisher mirrors, not a fresh production
export. Avoid long read transactions against a running rollback-journal SQLite writer:
they can block its commit. If a collector stops, confirm termination, preserve its
checkpoint and wait for its lease to expire before resuming.

### Complete publisher-feed and navigation rehearsal (2026-10-20)

The August-to-September Overture Place comparison completed against the local source
API over the sealed mirrors: 1,406 pages, 6,811 additions, 131,725 changes and 2,061
removals (140,597 unique change records). The read-only verifier passed with
`--require-complete --summary`, proving retained cursor/pin/identity consistency and
exact agreement with the independently fetched API summary. Evidence digest:
`3bcf878ed979ca78af41d046358f3dbd82c66898c64ebe93d769327845cc9d56`.
The interrupted local run resumed after lease expiry without lost or duplicate evidence.
This closes the partial-feed rehearsal gap; it does not establish canonical identities.

Chromium against an isolated HYPE database copy verified Features navigation from
`/admin/projects`: an initially empty selection became the first displayed layer,
“2025 - 2nd Edition”; a separately selected Donors layer remained the only selected layer
when navigating to Features. Evidence used the rendered pin buttons' `aria-pressed`
state before and after navigation, with private screenshots retained. This verifies
navigation/selection only, not Feature-card data loading or empty-layer-list behavior.
The initial automation locator waited on a collapsed label; retrying the actual visible
navigation link succeeded. The dev server and browser were stopped after verification.

Validation also includes six verifier tests, 216 combined Places tests, and two added
collector tests for discovery rollback and in-flight migration seeding (18 collector
tests total). Actual Address curation/assembly round-trip, canonical identity decisions,
final import acceptance and production packaging remain open. No deployment occurred.


### Donor/dropoff importer acceptance and preflight

The importer validates the entire eligible cohort before generating SQL. Receipt version
3 reports `created`, `matched`, `skipped` and `quarantined`; malformed eligible rows
produce a blocked receipt with source table/ID, field, stable diagnostic code and
remediation. It checks positive integer identities, duplicate IDs, retained source
hashes, finite numeric coordinates, the required English title, localized text types,
exact 0/1 activity flags and valid UTC mirror timestamps. Excluded donors do not block
the cohort. Invalid phone values retain the existing evidence/warning policy rather
than silently becoming accepted phone numbers.

A failed plan invalidates its previous SQL output, including failures caused by changed
accepted source hashes. The output must be a separate `.sql` file. Both read-only input
database handles close after planning. Destination prerequisites require the exact
universal `gPropPhNum01` core-hub PhoneField; a same-named organisation/project property
is not an acceptable substitute. Brand and coordinate-correction errors identify the
source record and required review. Existing IDs and accepted mappings remain protected.

The current source mirror replay matched all 330 imported records, skipped 155 donors
without recorded runs, quarantined zero, and retained 64 reviewed MTR decisions.
Applying the generated replay in a fail-fast transaction on an isolated current-database
copy left exact row fingerprints unchanged across Feature, translation, property,
Place, revision, association, association-history, import-mapping and property-catalog
tables. Integrity and foreign-key checks pass. Ten focused importer/MTR tests cover
initial import/replay, history rollback, malformed eligible versus excluded rows,
stale-source protection and rejection of an incorrectly scoped phone property.

This proves the Places/Features portion of importer replay and reporting. Schedule
and time-window import is not implemented: the schema remains a proposal under
[#195](https://github.com/tijptjik/hype/issues/195) and
[#196](https://github.com/tijptjik/hype/issues/196), described in
[Schedules and events](04-schedules-events.md). Pickup text is retained as source
provenance, never promoted to business opening hours. Consequently the broad #194
acceptance item covering time-window/numeric event validation stays open.

### Curated Address service round trip

`scripts/places/rehearse-address-curation.ts` now supplies reproducible cross-repository
integration evidence using synthetic data and in-memory databases. A guarded SaanSeoi
curation decision produces a deterministic supplementary Address, which is materialised
before source snapshot/release-set publication. The actual Address API service feeds
HYPE's independent pinned hydration and immutable Place persistence. Native components
and publisher attribution survive, exact replay creates neither another Place nor another
revision, and the shared Feature resolver preserves its explicit name override. A wrong
snapshot remains unresolved for review. Source/HYPE foreign-key checks pass.

The initial canonical Place response was hand-built; the expanded rehearsal now
materialises and publishes a synthetic Place and reads it through the real collection
service, including an exact-ID publication-pinned request. This is not evidence for
a real bakery match, full CLI upload orchestration or automatic Project adoption.
See the [reproducible curation rehearsal](places-address-curation.md#reproducible-source-service-integration-rehearsal)
for the command and proof boundary. No production or primary local data was modified.

### Reproducible export-to-import rehearsal

The [migration runbook](places-migration-runbook.md) and
`scripts/places/rehearse-migration.ts` now reproduce the local schema upgrade, existing
Feature split, donor/dropoff import and both replay checks from explicit input exports.
The script creates a new private artifact directory, snapshots its inputs, records code
and migration hashes, applies missing migrations with fail-fast transactions, invokes
the actual split domain service and independently verifies the resulting data. Source
inputs and primary local state are not modified. A failed run has no success receipt.

The retained production export rehearsal passed with 11 pending migrations, 1,190 splits,
56 intangible/25 draft exclusions, 330 new donor/dropoff Features and Places, 155 excluded
donors without runs, all 64 reviewed MTR decisions, and zero creates on import replay.
Final counts are 1,601 Features, 1,520 Places and 1,520 associations. Original Feature
rows and effective values are preserved; domain/history/property-catalog rows are
unchanged on replay. SQLite integrity and foreign-key checks pass. Two adapter tests
prove rollback after a late batch failure and literal preservation of bound text.
The production data-split execution path and deployment remain separate open work.


### Guarded release execution path

`execute-feature-split.ts` now provides the explicit remote/local data-split execution
path described in the [runbook](places-migration-runbook.md#guarded-data-split-executor).
It defaults to offline description, verifies the manifest hash and exact configured DB,
and requires `--apply` for execution. The remote proxy isolates one explicit remote D1
binding, disables local persistence/env files and uses primary-session reads. No schema,
donor import or application deployment is implicit in this command.

Execution reuses the guarded split service and retains atomic per-Feature outcomes in
an append-preserving, exclusively locked receipt. Local verification applied and replayed
all 1,190 records. An injected third-record conflict left the first two intact; retry
replayed those two and applied the remaining 1,188. Independent preservation/history/
integrity/FK checks pass. Eight focused tests verify target/hash checks, remote binding
configuration, offline default behavior, receipt lifecycle and batch rollback. No remote
execution was attempted; live release verification still requires separate authorization.

### Standalone Place resources (Refs #194)

`place` is registered in the first-class resource, path, reference and cache contracts,
with `/admin/places` and `/admin/places/[id]` routes. It is deliberately absent from
`HierarchicalResource` and its parent/sequence mappings. Resource ID/ref resolution
uses the Place API rather than deriving ownership from a Feature or layer.

The directory searches latest retained names and exact HYPE/SaanSeoi IDs, with bounded
25-row ID pagination. Its default scope contains shared Places; an explicit Project
adds that Project's private Places only after current persisted Project management
permission is checked. Detail access probes persisted ownership, authorizes it, then
fences the data read to that scope. Anonymous reads are denied. Client scope strings
separate native query caches across account/role changes and confer no authority.
Raw source payloads, private provenance and associated Feature identities are omitted.

The basic read-only pages show source status, names, phone/brand arrays, coordinates
and the shared structured-Address formatter. Latest source facts are explicitly
separate from each Feature's accepted revisions and overrides. The admin menu and
linked Feature section provide entry points. Project choices use the existing paginated
resource client, with traversal/retry, rather than the legacy filtered Project rows.
Place creation and identity/adoption decisions remain in the established Feature flows;
the standalone pages expose no unimplemented creation action.

Validation: 152 focused service, authorization and navigation tests pass. App checking
retains its existing 10 errors / 19 warnings, with no new diagnostics. Chromium against
an isolated database copy verified 25-to-50 shared pagination, Breadline-scoped name
search, private Place detail navigation and rendered phone/brand/address values. Final
run had no page errors; private screenshots were inspected, and the server was stopped.
An earlier browser run exposed a legacy Project-list dependency and missing scroll/header
configuration; both were corrected before final verification. No primary local source
facts, identity decisions, production data or deployment were changed.

### Breadline identity discovery with contact evidence (Refs #194)

The Breadline candidate exporter now uses the same evidence matcher as existing Feature
splits. It reads full source addresses and complete Hong Kong phone strings, discovers
phone matches outside the spatial window, and ranks contact/address evidence ahead of
nearby-only businesses. Shared publication phone matches remain candidates, not unique
establishment evidence. Even an exact name plus unique phone within 50 metres remains
a review priority, never an accepted identity. Compound/unusable phone text is flagged;
partial numbers are not extracted. Candidate reports expose evidence counts rather than
raw source phone strings. Version 2 nests evidence consistently with the Feature report.

Reproduction against the retained sealed source export:

```sh
PYTHONDONTWRITEBYTECODE=1 python3 scripts/breadline/place-candidates.py \
  --breadline .local/breadline/mirror.sqlite \
  --hype .local/places/hype-production-20261020.sqlite \
  --saanseoi ../saanseoi/.local/d1-bootstrap/production-20261018/bundle-ordered/DB_CURRENT.sqlite \
  --publication .local/places/saanseoi-first-page.json --immutable-snapshot \
  --output .local/places/breadline-place-candidates-v2.json
```

The same 139,522-Place publication yields phone candidates for 89 eligible records,
including 41 with a publication-unique phone within 50 metres; 16 have exact-name
candidates and one has an exact freeform-address candidate. None satisfy the strict
exact-name-plus-unique-phone priority rule. There are 104 records with identity-related
review evidence and 226 with nearby-only candidates. One source phone is unusable.
These counts overlap and do not imply 104 confirmed matches.

Independent comparison verifies unchanged source hashes, names, reviewed coordinates,
publication, 311-donor/19-dropoff cohort and all 155 exclusions. Twelve focused Python
tests cover shared phones, branch-name differences, distant contact discovery, unusable
phones, dropoffs without phones, stale coordinate corrections and crowded nearby results.
No HYPE identities, Feature links, source facts or production records were modified.

### Opening migration candidates by exact source ID (Refs #194)

Candidate exports now include `lookupQuery: "id:<canonical ID>"`. Paste that value
into **Place name or SaanSeoi ID** in either **Review source identity** or **Change Place**.
Canonical `ss-UUID` values may also be pasted without the prefix. The authorized server
search discovers the current publication and uses the existing exact-ID, pinned collection
reader. It never substitutes a similarly named result when the requested ID is absent.
Missing IDs return no candidates; source failures stay explicit. Publication IDs and
candidate facts come from SaanSeoi, not the pasted text. This opens current evidence,
not a claim that an older migration report's publication is still current.

Search performs no persistence, linking, merge or acceptance. Selecting a result still
uses the existing import/preview/review path, including release-change checks. Full
source identity acceptance remains a separate explicit decision; ordinary Change Place
continues to mean reassociating a Feature. Both keep their existing permission boundaries.
Hosted use depends on release of SaanSeoi's canonical `filter[id]` support, as before.

Validation: 65 focused remote/source-reader tests and 12 matching tests pass. App checking
retains the baseline 10 errors / 19 warnings. Browser verification used the isolated HYPE
copy and read-only local SaanSeoi API: donor #1's phone-matching source candidate appeared
in both identity and association search. Final run had zero page errors and zero source
import, link, review-capture or acceptance requests. The screenshot was inspected privately;
both servers were stopped. No identity decision or deployment was made.

### Retained negative establishment decisions (Refs #194)

Migration `0120_place_identity_rejection.sql` adds append-only rejection evidence tied
to a server-captured identity review, Place, exact source ID, actor and mandatory reason.
**Not this establishment** uses the same current Place management authorization as
identity acceptance. The write fences ownership, source availability, identity, latest
revision and history; stale or accepted comparisons cannot be rejected. Exact retries
preserve the original reason. SQL guards and triggers prevent accepting or merging the
same rejected comparison, including a rejection arriving between reads and an atomic
acceptance batch. Rejection changes no Place identity or Feature facts/associations.

Ordinary source-name discovery omits rejected IDs for the Feature's current scoped
Place. The query does not expose other Projects' rejection reasons or actors. Explicit
`id:` lookup remains available and displays a previous-rejection reminder. Deliberate
reconsideration captures a new immutable comparison and still requires its own acceptance
reason; the old rejection is never deleted. A subsequently accepted source identity is
no longer suppressed as rejected. Explicit searches refresh their native query, so a
new decision is visible immediately rather than reusing cached discovery results.

Local migration passed a backup-copy rehearsal, integrity and FK checks, and preserved
2,850 Places/revisions, 1,601 Features and 1,520 associations. Primary local rejection
and identity-decision counts remain zero. Backup and receipt are private under
`.local/places/`. There were 174 passing focused service/remote/source tests, including
scope denial, exact replay, immutable reasons, acceptance races and invalidation of a
prepared merge. Worker checking passes; app checking retains 10 errors / 19 warnings.

An isolated browser rehearsal captured and rejected a source comparison with an explicit
test-only reason. Repeating its exact lookup showed the rejection reminder, with zero
page errors and no acceptance/link requests. An initial run revealed stale native search
caching, corrected before the final run. Independent DB comparison found all 26 Feature
and acceptance/redirect tables unchanged, with one isolated review/rejection, valid
integrity and no FK violations. The private screenshot was inspected and both servers
stopped. This test decision is not an actual bakery identity judgment. Nothing deployed.

Full export-to-import rehearsal at `6961b424` also passes with all 12 pending
migrations through 0120: 1,190 existing Feature splits, 56 intangible/25 draft
exclusions, 311 donors and 19 dropoffs imported, and 155 donors without recorded
runs excluded. Replay matches all 330 imported records with zero creates and
unchanged domain rows. Final rehearsal counts are 1,601 Features, 1,520 Places
and 1,520 associations; integrity and foreign-key checks pass. All 64 reviewed
MTR decisions survive, including the retained unmapped labels for #558/#727.
This isolated rehearsal changes neither primary local state nor production.
