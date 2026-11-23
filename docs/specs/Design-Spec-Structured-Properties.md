# Structured property values

Status: implemented in the working tree; migration 0132 is present locally. Production
rollout is not part of this change.

## Problem and boundaries

`property.type` currently describes classifier/specifier/display semantics, while
`property.component` selects an input widget. Neither is a reliable data contract.
`featureProperty.value` is text, and `getFPI18n` reduces the result to a display string.
A URL and its anchor text must remain separate through validation, persistence,
translation, export and rendering. A newline-separated URL string cannot provide that.

Keep the current classifier/specifier distinction. Add three independent concepts:

| Concept       | Examples                                                | Responsibility                        |
| ------------- | ------------------------------------------------------- | ------------------------------------- |
| `dataType`    | text, number, date, boolean, link, dateRange, timeRange | Value validation and serialization    |
| `cardinality` | one, many                                               | Number of values; ordered collections |
| presentation  | text, labelledLinks, numberedReferences                 | How a value appears on a surface      |

`multiLink` is `link` with cardinality `many`. `footnotes` is a presentation of that
collection, not a separate primitive type. A citation with a quotation, author,
publication date or pinpoint reference can later become a distinct `citation` type if
those fields acquire real requirements.

## Storage and compatibility

Add a nullable `valueJson` JSON TEXT column to `featureProperty`, alongside existing
scalar `value` and classifier `propertyValueId`. Use an explicit schema version and a
server-owned discriminated union; do not infer JSON from a string beginning with `{`,
accept arbitrary user-authored schemas, or store rendered HTML.

Illustrative link payload (locale keys follow the existing locale conventions):

```json
{
  "version": 1,
  "items": [
    {
      "id": "stable-item-id",
      "url": "https://example.org/books/kairos",
      "label": { "en": "Read about Kairos" }
    }
  ]
}
```

The definition supplies `dataType: link` and `cardinality: one`; a single link uses the
same item shape with exactly one item. A multi-value definition allows an ordered,
bounded array. Empty optional properties have no value row; an empty array is normalized
consistently at the service boundary. Item IDs survive reordering and translation, and
reference numbering is derived at render time.

Start with bounded JSON because the row is edited as one property and links do not need
independent querying. Add a child item table only when independent editing, indexing or
relational references require it. Index dates/numbers using typed columns or projections
when actual filtering requirements justify them. Do not put all property queries behind
JSON parsing.

Enforce exactly one storage representation per value. A registry keyed by `dataType`
owns validation, serialization, normalization, plain-text export, editor selection and a
typed display model. The server loads the definition; it never trusts the caller's
declared type. Editors remain in the existing Bits component layers, with the remote
APIs and services responsible for validation.

Roll out additively: readers first, then writers, then explicit per-type backfills.
Legacy scalars and classifier IDs remain supported. Reject unsupported structured
versions on writes; show a controlled unavailable state on reads and retain the original
payload. Do not auto-convert phone arrays or existing JSON-looking text. Use the
existing feature `modifiedAt` check and atomic write token to prevent a stale editor
overwriting reordered links; links participate in snapshot comparison. No separate item
revision is needed while the property is edited as a whole.

## Localization, links and public access

Translate labels, never URLs or stable IDs. Render anchor text as escaped text. Allow
only absolute HTTP(S) URLs for this type, with length and collection bounds; reject
credentials and executable schemes. Do not fetch submitted URLs on save. If previews are
added later, that is a separate network service with its own validation. External
new-tab links use `noopener noreferrer`. Affiliate generation is out of scope.

Separate `audience: public | internal` from per-surface visibility. An internal property
must be omitted server-side from public list, card, detail, search and export payloads,
including metadata and cached projections. Hiding its card row is not an access-control
boundary. Keep editing permissions independent as well. Migration 0132 marks the scoped
ELN ISBN definition internal. Public responses omit it; an admin request also requires
the owning project, organisation or hub editing permission.

## Card presentation

The renderer should receive a discriminated display model, not one string from
`getFPI18n`. A text field supplies text; a link field supplies validated links. Keep the
plain-text formatter for search/export/accessibility, not HTML rendering.

- Short factual fields share aligned rows. Longer names receive width before wrapping.
  Labels remain visually subordinate with consistent line heights.
- Long text uses a wider span or a full row. Preserve source order rather than visual
  masonry that changes keyboard and reading order.
- Labelled links show anchor text and an external-link cue, never raw URLs.
- Numbered references appear as a compact `References 1 2 3` group. Each number has a
  descriptive accessible name and a usable touch target; details remain available by
  keyboard and touch, not only hover. These numbers represent the collection, not claims
  in the description unless explicit claim-to-item links are stored later.
- A retailer link is a labelled action such as `Find this edition`, separate from
  factual metadata. ISBN stays internal and identifies the exact edition.

## Implementation acceptance

First ship the additive value contract and registry, then single-link editing and
rendering, then ordered collections and numbered references. Verify round trips, invalid
URLs and versions, single/multiple cardinality, localized labels, reorder stability,
concurrent editing, legacy scalar compatibility, and public exclusion of internal data.
Browser acceptance covers keyboard/touch use and long labels at narrow and wide card
widths. Do not reintroduce ELN Sources as part of this work.

## Implementation details and verification

- `src/lib/properties/value.ts` defines bounded, versioned values and typed display
  models. JSON is serialized as text for remote form transport and unknown-version
  preservation. Empty link collections remove the value row.
- The property catalogue exposes LinkField, cardinality, presentation and audience.
  Changing a populated type, widget or cardinality requires an explicit value migration.
  Internal definitions cannot be silently deleted by a public snapshot.
- The shared link editor retains item IDs through edits and ordering, exposes all three
  label locales, and keeps unsupported versions read-only. Server validation checks
  persisted definitions and target-layer assignment.
- Guarded query, batch, form and command responses omit unauthorized internal
  definitions and values before client caching. Property predicates are checked before
  query counts run. Batch items use their own admin intent. Cache handles already
  include account/surface scope.
- Feature relation replacement preserves omitted internal values. Existing atomic
  feature write guards also protect structured snapshots. The phone-reset SELECT
  includes the new nullable column.
- Plain-text exports use labels and destinations; cards use safe anchors. Card layout
  reserves two 44px rows for link collections, with vertical scrolling for overflow,
  preserving reading order.
- Migration rehearsal on an isolated copy preserved all 3,294 legacy values and passed
  integrity checks. The shared local database already recorded 0132; it was not applied
  again by this continuation.
- Browser fixture acceptance passed at 1104px and 390px: localized edits, ordering,
  keyboard add/remove, no horizontal overflow, and 44px numbered-reference targets.
  Screenshots are in `output/playwright/structured-links-{desktop,mobile}.png`. The
  temporary route was removed.
- Live ELN route re-verification was blocked by local D1 `SQLITE_BUSY` / session
  commit-token failures. Full-project type checking still has unrelated errors in the
  concurrent checkout; focused tests cover the implementation.

Focused acceptance: 282 tests passed across 15 files, including the existing
remote-guard suite. The final full-project check reports 12 unrelated errors; none are
in the structured-property implementation.

## Calendar and service-day ranges

Migration 0134 adds `dateRange` and `timeRange` contracts, with `dateResolution`
(`decade | year | month | day`, default `day`) and `timeMaxHour` (`24 | 36`, default
`24`). The migration copies the existing type column before replacing its enum
constraint; it does not rebuild the parent table or cascade-delete child rows. An
isolated rehearsal and the local application preserved 24 definitions and 3,294
feature-property rows. Production is unchanged.

Intervals use `valueJson: {"version":1,"start":N,"end":N}` with ordered, inclusive
integer coordinates. Dates are calendar buckets, not instants: decades are year/10,
years are literal years, months are year*12 plus a zero-based month, and days are UTC
epoch-day integers. All conversion occurs without local-time/DST arithmetic. Resolution
changes on populated definitions require a migration. Date bounds are configurable;
unset bounds cover 1900 through 2100 at the selected resolution.

Time coordinates are minutes from the service-day start. `24:00` is midnight and `36:00`
is noon the next day; `25:30` is retained as `25:30`, never wrapped to `01:30`. The
default domain is 0–1440; the extended domain is 0–2160. Backwards ranges are rejected;
an overnight interval uses explicit hours beyond 24 in the extended mode.

`PropertyRangeControl` reuses `svelte-range-slider-pips` for the feature editor and
Filter panel, with one-bucket or one-minute keyboard steps, formatted endpoints, and
exact From/To inputs. The existing scalar RangeField remains supported. Public range
specifiers appear alongside classifiers in the Filter panel. SQL queries, counts and the
client predicate match inclusive interval overlap; full-domain selection is inactive and
includes features without a value. Malformed and unknown versions never match an active
interval filter.

Expanded cards show Translations and Audience in one compact, centred row below the
header, separate from the locale columns and stacking on narrow screens. A
resource-style New action sits beside the title and description block. Removal,
visibility, and collapse actions have visible labels, larger icons, and tooltips. Field
drag handles replace rank arrows, with Alt+Up/Down keyboard support and the same
locked-rank boundaries. Layer/project defaults are toggle badges in edit mode; view mode
shows only enabled badges. Audience defaults to Public; Private maps to the existing
`internal` server contract. Component-specific settings follow the component selector at
the same width, with consistent spacing. Data type, resolution, service day, link
cardinality (One by default), and link text use shared dropdowns with illustrative
previews using the theme palette. Trigger and option rows share the same text and
preview columns. New Select fields start with one empty option; the Options area retains
its heading in edit mode. Date limits use paired editable Min/Max fields; time limits
show the service day's derived 00:00 and 24:00/36:00 endpoints. Configuration controls
keep their native remote-form hidden fields registered.

Temporal acceptance: 172 focused tests pass. Chromium checks cover defaults, keyboard
switches, leap-day editing, next-day time editing, Filter-panel keyboard steps, and no
horizontal overflow at desktop/mobile widths. Preview screenshots:
`output/playwright/temporal-properties-mobile.png` and
`output/playwright/temporal-filter-mobile.png`.

## Multi-select classifiers

A classifier uses `component: SelectField`, `dataType: text` and `cardinality: many` to
offer multiple selections. The property editor exposes **Single select** and
**Multi-select**. This is a cardinality of categorical choices, not a new primitive data
type.

Collections use `{"version":1,"propertyValueIds":["option-a","option-b"]}` in
`featureProperty.valueJson`. Option IDs are unique, bounded to 100, checked against the
owning field, and sorted on write. Empty selection is SQL NULL. Widening a field from
one to many preserves its existing `propertyValueId` rows and immutable Feature history;
readers accept both representations. New collection writes clear the scalar columns.
Narrowing populated collections requires an explicit conversion.

Public text, property filters, presence counts and feature editing read every selected
option. Revision snapshots retain the labels of all selected options. Catalogue option
deletion removes that option while retaining the others, and the shared catalogue
capture records the affected Feature revisions. Filter count revisions invalidate on
collection changes.

Migration `0263_multi_select_classifiers.sql` installs database guards and collection
cascade behavior. The separate
[Ghost Signs Stratigraphy migration](../../migrations/pending/ghost-signs-stratigraphy/README.md)
widening must follow the initial taxonomy migration and compatible application rollout.
Production currently retains single-select Stratigraphy.
