# Field research

Field research is an internal project-management workflow at `/admin/fieldresearch`. It
reuses the batch upload dropzone. Its working stacks are not part of the general Feature
editor.

## Sessions and capture

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
