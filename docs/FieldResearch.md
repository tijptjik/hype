# Field research

Field research provides shared session, capture and provenance infrastructure. The Field
Entries page and its batch upload interface are maintained on the `feature/field-work`
branch; `/admin/fieldresearch` redirects to Field Sessions on preview.

## Android capture

Recording creates an unpublished Feature and a `fieldResearchRecord` linking its ID to
the session. The device supplies a stable request ID. The server checks project access,
session status, schema version and destination layer before committing the Feature, its
first revision, its origin and its receipt together. Retrying a successful request
returns the existing record. Older mobile receipts retain a null Feature link until
explicitly retried in a configured session.

The Feature holds the title, type, flags and property values. The title uses the session
template and a transactionally allocated sequence number. A capture without placement
starts with an empty GeoJSON GeometryCollection. Researchers can select a configured
layer in the Android app. The app preselects the session default.

## Creation provenance

`featureOrigin` records immutable creation provenance separately from editable Feature
content and later reviewers/publishers. The Feature index has a Created via filter.
Session filtering appears only for Field research, and switching origins clears the
session. Both predicates apply before pagination and exact counts.

| Origin               | Meaning                                                  | `originId` namespace             |
| -------------------- | -------------------------------------------------------- | -------------------------------- |
| `app_contribution`   | App creation flow, regardless of the actor's staff roles | Creation proposal when available |
| `admin_contribution` | Admin creation flow, regardless of staff employment      | Currently null                   |
| `field_research`     | Android field capture or historical stack conversion     | `fieldResearchSession`           |

The origin key selects the related ID's namespace. Future workflows can introduce
another origin and reference resolver without adding workflow-specific columns to
Feature. Only the owning server workflow writes the reference. No dynamic table name
from a client is executed. A missing provenance row means Unknown.

Migration `0243_feature_origin_backfill.sql` applies the user-confirmed historical rules
once, without replacing existing provenance: HKFoodWorks, City Recorder, EUNIC and
Cultural & Media Education Foundation are admin contributions. Hong Kong Ghost Signs
uses admin contribution for organisation members/owners and app contribution for other
or missing contributors. The rule is a migration-time classification; future creations
record their actual entry point and later membership changes do not rewrite provenance.

## Field session configuration for Hypercorder

`/admin/field-recorder` manages project-owned field sessions. Session defaults include
the Feature type, visitability, tangibility, draft and review values, plus whether each
of those fields is visible while recording. A session may enable multiple project
layers; one is required to be the default. Each layer can inherit or override the field
values and visibility independently. Property choices come from the resolved Project
catalogue; inclusion and default values can be overridden per layer. The historical
visibility and recordability keys are normalized to a single inclusion choice.
Tangibility is shown positively in the editor and stored as the existing `isIntangible`
inverse.

The vetted Location list is stored independently of Feature and Location identity.
Premises, buildings and building parts can be selected. Bulk choices follow only
current, effective, accessible membership assertions, including Organisation-scoped
overrides; they do not infer containment from proximity or matching names. Establishment
and other operational Location selectors are placeholders for a later workflow. The
legacy web demo is preserved on `feature/field-work`; its fixed survey fields are not
session configuration for Hypercorder.

## Configuration schema versions

Migration `0266_field_research_features.sql` adds a stored schema version, a recording
sequence and a unique Feature link. Existing sessions start at version zero. New
sessions use the version declared in `src/lib/fieldResearch/configuration.ts`. Bump that
constant alongside an incompatible configuration change.

The admin editor checks the version before decoding settings or layer overrides.
**Review migration** previews the source and target versions, settings that cannot be
carried over, and keys receiving defaults. **Apply migration** validates the reviewed
result against current project properties, Feature types and layers. The server checks
the session revision and preview token, retains the previous settings in
`fieldResearchConfigurationHistory`, and changes only that session. A newer schema
requires a compatible application.

Register a pure transformation for a source and target version in
`researchConfigurationMigrations` when a rename or semantic change needs one. Each
upgrade finishes by validating individual fields against the target schema. Missing
required fields use the target defaults. Removed layer overrides inherit the migrated
session settings. Keep historical transformations while sessions on those versions
remain in storage.

## Retired web recorder data

The numbered migrations retain the original web recorder table creation history.
`0264_remove_web_field_recorder.sql` drops the web recorder tables and their rows. It
does not delete audio objects from storage. The local `feature/field-work` branch
contains `0265_restore_web_field_recorder.sql`, which recreates empty tables if the web
recorder is revisited. The removal migration has not yet been applied as part of this
change.
