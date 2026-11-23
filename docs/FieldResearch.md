# Field research

Field research provides shared session, capture and provenance infrastructure. The Field
Entries page and its batch upload interface are maintained on the `feature/field-work`
branch; `/admin/fieldresearch` redirects to Field Sessions on preview.

## Sessions and capture

Field Sessions is available at `/admin/field-recorder`. The capture and working stack
interface described below belongs to the Field Entries branch.

Each `fieldResearchSession` has an internal editable name, a stable ID, creator,
organisation and project, creation/update/completion timestamps, status and an
optimistic revision. The destination layer is chosen once during session setup using
searchable layer suggestions with organisation icons and project labels. Session
ownership is resolved from the persisted project, not supplied independently by the
browser.

Images are processed through the shared image normalizer, two at a time, and written to
the stage's R2 originals binding. There is no fixed batch image-count cap. Each
processed image is limited to 32 MiB. Small JPEG previews support bounded map markers
and paginated gallery rendering. Capture metadata is extracted before normalization.

`fieldResearchImage` retains the original filename, capture GPS and time, content hash,
object locator, upload state and session membership. It has no Feature/gallery
association during upload. A reserved image ID and immutable object key make retries
idempotent. A failed database confirmation retains recoverable R2 bytes. Successfully
uploaded browser file references are released; failed files remain available for retry.
Leaving with queued or failed files invokes the navigation guard. After a browser
restart, reselect interrupted original files to resume their stored identities.

The session extent is `[west, south, east, north]`, extended atomically from each
successfully uploaded image's original GPS. Without GPS it remains null. Group edits,
manual placement and Feature conversion never change that capture evidence.

## Working stacks

After uploads settle, a spatial grid suggests groups within 20 metres of each group's
first capture. This is a suggestion, not identity evidence. It does not form unlimited
transitive chains. Images without GPS become separate unplaced stacks.

The full-pane map follows the user's map style. Its transparent bottom track contains
only unplaced images. Dragging a photo onto the map creates a separate stack; dropping
it onto a stack adds it to that group. Whole stacks can be merged by dragging their
numbered anchors together; highlighted rings indicate the pending merge. Dragged images
become half-transparent around a precise dot-and-ring placement target.

Hovering expands galleries, with one centered top photo for odd counts. Single-photo
stacks stay still. Clicking a stack opens its Feature type and optional name fields.
These save provisional details; they do not create a Feature yet. Existing manual groups
are retained when more files arrive. Every grouping, placement and conversion operation
checks the session revision inside its transaction.

Conversion requires a marker, an active layer in the session's project and a permitted
Feature type. Header Save converts all reviewed stacks into unpublished Features, using
an entered name or a generic fallback, the selected marker and an ordered immutable
gallery. Image registration, Feature creation, provenance and the stack's conversion
receipt commit atomically. Repeating conversion returns the same Feature. Converted
stacks cannot be regrouped; their Feature uses the existing editor. Capture rows and
session history remain available.

After a successful Save, the feature index opens filtered to `field_research` and the
session ID. These filters survive a refresh; unrelated retained filters are cleared.
Save errors use readable toasts and keep the session open. Cancel returns to the
searchable session index while retaining durable provisional work.

The API supports completing a fully converted session and reopening it for more
captures. Session listing, metadata, mutations and private assets require maintainer or
owner access to the owning project, inherited organisation owner or hub admin authority,
or SuperAdmin access. Ordinary members and translators are excluded. Session names
remain internal and are not copied into public Feature content.

## Creation provenance

`featureOrigin` records immutable creation provenance separately from editable Feature
content and later reviewers/publishers. The Feature index has a Created via filter.
Session filtering appears only for Field research, and switching origins clears the
session. Both predicates apply before pagination and exact counts.

| Origin               | Meaning                                                  | `originId` namespace             |
| -------------------- | -------------------------------------------------------- | -------------------------------- |
| `app_contribution`   | App creation flow, regardless of the actor's staff roles | Creation proposal when available |
| `admin_contribution` | Admin creation flow, regardless of staff employment      | Currently null                   |
| `field_research`     | Explicit research stack conversion                       | `fieldResearchSession`           |

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

Apply `0242_field_research.sql`, `0243_feature_origin_backfill.sql` and
`0244_field_research_stack_details.sql` in order before serving the new code. Local
verification uses synthetic images and sessions named `[Test]`; production rollout
remains a separate operation.

## Field session configuration for Hypercorder

`/admin/field-recorder` manages project-owned field sessions. Session defaults include the
Feature type, visitability, tangibility, draft and review values, plus whether each of
those fields is visible while recording. A session may enable multiple project layers;
one is required to be the default. Each layer can inherit or override the field values
and visibility independently. Property choices come from the resolved Project catalogue;
visibility, recordability and default values can be overridden per layer. Tangibility is
shown positively in the editor and stored as the existing `isIntangible` inverse.

The vetted Location list is stored independently of Feature and Location identity.
Premises, buildings and building parts can be selected. Bulk choices follow only current,
effective, accessible membership assertions, including Organisation-scoped overrides;
they do not infer containment from proximity or matching names. Establishment and other
operational Location selectors are placeholders for a later workflow. The legacy web demo is preserved on `feature/field-work`; its fixed survey fields are not
session configuration for Hypercorder.

Apply `0261_field_research_configuration.sql` and `0262_field_research_locations.sql`
before using these settings. They have not been applied to a remote database by this
change. Automatic title-number allocation and application of these settings in the
Android capture flow remain separate integration work.

## Retired web recorder data

The numbered migrations retain the original web recorder table creation history.
`0264_remove_web_field_recorder.sql` drops the web recorder tables and their rows.
It does not delete audio objects from storage. The local `feature/field-work` branch
contains `0265_restore_web_field_recorder.sql`, which recreates empty tables if the
web recorder is revisited. The removal migration has not yet been applied as part of
this change.
