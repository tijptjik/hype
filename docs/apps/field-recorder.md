# Field Recorder demo

> **Development status:** The web-based Field Recorder demo is paused for now. Current
> recorder development is focused on the Android client in `apps/recorder`. The web demo
> and its staging data are retained for reference; they are not the Android app's
> capture implementation. The Android device sign-in and account endpoints remain in
> use.

The web demo's entry points are `src/routes/admin/field-recorder/` and
`src/routes/recorder/[session]/`; its UI lives in
`src/lib/bits/patterns/fieldRecorder/`, with staging APIs in
`src/lib/api/fieldRecorder.remote.ts` and `src/lib/api/fieldRecorderMaps.remote.ts`. Its
staging schemas and migrations are `src/lib/db/schema/fieldRecorder*.ts` and
`migrations/0253_field_recorder.sql` / `0254_field_recorder_maps.sql`. The shared Field
Research model and Android device authentication are separate from this web demo.

Admin setup: `/admin/field-recorder`. Dedicated mobile and desktop capture:
`/recorder/:session`. Both use Hype authentication. Each server read, save, image
request and voice request checks the existing Field Research project-management policy.
Ordinary authenticated accounts do not automatically gain access.

The local demo session is `173461e7-4164-4cb4-b4a7-7a91bf6b8f60`, under temporary,
unpublished project `frDemoProj01` and layer `frDemoLayer1`. It uses existing Kowloon
City building Locations at 60 Nam Kok Road, 114 Nga Tsin Wai Road and 20 Tak Ku Ling
Road. Their source names and addresses are retained unchanged; these are representative
demo choices, not a claim about the URA survey boundary.

## Capture contract

- Session settings fix organisation, project, layer, feature type, locale, building
  choices and enabled observation fields. The contributor comes from the authenticated
  server identity. Visitable defaults to false, Intangible to true, and Pending review
  remains true.
- Building context persists per user/session on the device. Each capture stores its own
  building, freeform floor/room/building-part designation and source Location revision.
  Building parts are annotations in this demo, not newly created or linked canonical
  unit Locations.
- Display address combines the part annotation with the building address. Structured
  address retains the selected building's address object in
  `i18n.<locale>.addressProperties`, with source identity in `addressMeta`.
- Condition, material and notes accept optional text, including keyboard dictation.
  Priority and recovery difficulty offer High/Medium/Low. Size uses the supplied
  Small/Medium/Large option IDs. No observation text is required.
- Material maps to `vX7yZ1wA3bC6`, Priority to `hJ4kL7mN9pQ2`, and Size to
  `kL9mN2pQ5rS4`. The current Material catalogue property is a classifier; freeform
  notes are retained in the recorder payload without changing that property's shared
  definition. Recovery difficulty and condition have named capture fields, without
  invented catalogue property IDs.
- Multi-select photographs use the existing private research upload pipeline, including
  normalization, EXIF extraction and thumbnails. Every capture gallery entry starts with
  `research` intent. The first selected uploaded image with GPS supplies geometry. No
  GPS means null geometry, never the building centroid.
- Voice notes retain original private audio for later processing. Recording is capped at
  three minutes and uploads at 20 MiB. Transcription is not implemented. Microphone
  capture requires browser support, permission and a secure origin.
- Save acknowledges only after server persistence. Failed inputs stay in the form.
  Stable IDs make creates and uploads retryable; edit revision checks reject stale
  writes. The form warns before leaving unsaved work. Offline capture and a persistent
  offline upload queue are not implemented.

## Numbering and storage

`fieldRecorderConfig` extends an existing `fieldResearchSession`. `fieldRecorderRecord`
stores private capture drafts, and `fieldRecorderAudio` indexes private voice-note
objects. Migration `0253_field_recorder.sql` adds only these tables and their indexes.
No existing Feature lifecycle is changed.

The catalogue prefix is unique across recorder sessions. Preliminary and final counters
are independent. For example, draft `URA/KC-017-E-007-prelim` can become
`URA/KC-017-E-001` when it is the first capture to leave draft. A guarded D1 batch
commits each capture and counter increment together. Retrying finalization cannot
consume a second number. Populated presets cannot be changed. Numbers are retained when
editing, and there is no deletion or renumbering action.

These are **Field Recorder staging records**, not canonical Feature rows. Finishing a
draft assigns its final catalogue number but does not publish a Feature or mark its
content approved. Canonical Feature conversion, unit Location association,
property-shape reconciliation and processing jobs remain subsequent integration work.
The existing Field Research conversion is intentionally not called because it requires
photographs and coordinates and has different draft/intent defaults.

## Local setup and validation

Run through the managed local scope:

```sh
dev-check python3 scripts/dev/seed-field-recorder-demo.py --database <existing-local-d1.sqlite>
```

The script accepts only an existing database inside this checkout's `.wrangler/state`,
checks source identities, applies the additive recorder migration and creates the
unpublished demo hierarchy. It is idempotent and leaves existing captures intact. The
shared development server can be reused through `bun run dev:agent admin --port 4173`.

Focused contract checks:
`dev-remote test bun x vitest run src/tests/field-recorder.test.ts`. Managed Chrome
interaction check:
`dev-remote --port 4173 chrome bun scripts/visual-checks/field-recorder-check.ts`. The
browser check performs real saves and uploads in the local demo session, retaining its
test captures as evidence. It checks admin identity, mobile/desktop widths, multiple
uploads, reload/edit persistence, independent final numbering and a text-free capture
with retained building context. A synthetic microphone verifies recording and private
audio upload. Physical-phone microphone and camera metadata need separate device
verification. The companion `field-recorder-setup-check.ts` verifies admin preset
creation, configured field visibility, signed-out redirects and Back navigation.

No public domain, subdomain, remote migration, production data or deployment is
configured by this demo.

## URA building and facade working maps

The local building survey is `/recorder/e738817d-a1b6-4fbb-97e3-b454e5170017`, with
prefix `URA/KC-017-E-FIELD`. Preparation reuses the 16 draft building Locations and
unpublished premises maps from `.research/ura/kc-017-eastern/`. Their GERS identities
match the retained SaanSeoi building export; these are not Places ssIDs. No duplicate
Locations or upstream publications are created.

Run `scripts/dev/prepare-ura-recorder.py --database <existing-local-d1.sqlite>` through
`dev-check` to verify the research receipt and prepare session-owned maps. Migration
`0254_field_recorder_maps.sql` stores these working copies. Repeating preparation
preserves annotations. `--check-fixture` prepares a separate temporary session for
synthetic browser evidence.

The survey contains 118 repeated-footprint floor shells and 88 candidate exterior edges.
Floor counts mix schedule evidence and provisional photo estimates. The research
contains no measured floor heights, so heights remain unset until an operator supplies a
value and its evidence. The 16 footprints do not necessarily represent 16 legal
buildings: split/merged footprints and provisional identities remain visible in the
source evidence. Flat labels are not measured unit polygons.

Footprints retain the Overture clipSmart geometry used by the research, with source map
hashes and release provenance. They have not been verified against current MapLibre
tiles. Floor diagrams preserve footprint holes. Users can select floors, draw walls,
trace regions and place objects; edits are private working-map changes, not updates to
canonical premises maps or unit Locations.

Placements retain the building, surface, floor, map revision, source hash and polygon
snapshot. XY coordinates are normalized from zero to one, with the origin at the top
left; `polygonXY` is relative to the selected polygon's bounding box. Server validation
checks polygon and footprint containment and rejects stale revisions. These coordinates
do not fabricate geographic positions or elevations.

Facade maps accept private preparation photographs, manually traced regions and object
pins with optional floor identifiers. Candidate edges require confirmation of exterior
exposure. A photograph must be attached before a facade capture can be saved; its
coordinate frame is then fixed to preserve existing annotations. Automatic feature
extraction, perspective rectification, measured elevations and 3D alignment are not
implemented. Actual facade photographs still need to be supplied.

Spatial validation uses `src/tests/field-recorder-spatial.test.ts` and the managed
Chrome script `scripts/visual-checks/field-recorder-spatial-check.ts`, which writes only
to the separate `URA-KC017` diagram validation fixture. Canonical Feature conversion
remains separate from this staging workflow.

Facade selectors replace generated face numbers with outward compass directions computed
from the retained north-up footprint, accounting for ring winding and physical aspect
ratio. Building street names supply address context, not an inferred edge-to-street
frontage. Manual surface labels remain authoritative.

“Copy a floor plan” duplicates walls and traced regions from another floor with the same
source footprint into an empty destination floor. Copied observations get new
identities; destination floor metadata, source geometry, heights and existing object
placements remain unchanged. Floors with observations cannot be overwritten by this
operation. The ordinary revision-guarded surface save persists the copied layout. The
`field-recorder-copy-check.ts` managed Chrome check verifies labels, copying, reload
persistence and source preservation using the isolated validation session.

## Wall, door and stair drafting

The floor editor snaps endpoints to footprint boundaries and observed walls within an
18-pixel radius. The second endpoint locks parallel or perpendicular to the longest
footprint edge using physical frame dimensions; snapping intersects that constrained
line with the target edge. Existing hand-drawn walls are retained.

Doors can be dragged from the door control onto an observed wall or placed by selecting
the tool and tapping. Their stored `wallId` and fractional `t` position keep the opening
attached to a wall; `traversable: true` identifies a passage. Dragging an existing door
changes its wall attachment/position. These are private survey passage annotations; they
do not yet generate canonical routing graph edges.

Stairs start as a square in physical frame proportions. Drag a corner or edge,
double-tap an edge to insert a corner, or tap a corner and use its trash control.
Outlines retain at least three corners. Editable stair regions are separate from
immutable capture polygons, so changes cannot silently move existing object pins. No
inter-floor stair connectivity or measured rise is inferred. Wall/door/stair changes use
the existing revision-guarded save and survive reloads. Floor copying also copies stairs
and remaps doors to the newly copied wall identities.

“Reset floor drawing” appears below the floor selector and requires confirmation. It
clears the selected floor's walls, doors, stairs and active traced regions using an
authorized revision-guarded command. Footprints, floor metadata, other floors, facades
and capture records are not modified. Retired region geometry remains available for
existing capture anchors; it is not offered to new captures. An existing capture can
display its retired region and save edits after a reset. Cancellation makes no request.
There is no drawing undo action.
