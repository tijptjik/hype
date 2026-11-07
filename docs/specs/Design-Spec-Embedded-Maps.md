# Embedded maps

`/embed` is a public, read-only map surface. It does not initialize `AppCtx`, request a
session, create an anonymous account, or expose account/contribution actions. Its map
captures scrolling normally. Interface language and theme changes are local to the
iframe; they do not save account preferences.

## Sharing

Saved Hub, Organisation, Project and Layer admin pages offer a highlighted **Share map**
icon beside Features and Users. It opens the inline sharing view without adding another
tab to the main tab row. The panel loads public layers the actor manages through the
existing publication-preview role policy. Selecting a parent includes its manageable
descendants. Each layer has separate **Include** and **On by default** controls. A
singleton always starts on, because its layer-selection section is hidden.

The default link pins explicit layer IDs. **Follow this resource** instead retains the
current page's parent ID and includes future public descendants, initially off. Explicit
exclusions preserve unchecked layers; toggling follow never changes current inclusion or
default visibility. Individual choices update those exclusions while following. Feature
content remains live in both modes. No database record, signing secret or migration is
required.

Builder choices persist when switching tabs within the same resource.

The builder reuses resource cards and trailing default-visibility switches, the form
map-style preview selector and the visual theme picker. Highlighted monospace URL/HTML
fields have copy controls in their headers.

The builder provides map style, theme, supported languages, one primary language, an
accessible iframe title, device previews, URL and responsive HTML copying. Filters are
always available. Mobile uses a 390 × 844 iframe and desktop uses 1280 × 800; CSS
scaling fits these viewports into the builder without changing their breakpoints.
Starting view defaults to the bounds of initially active features. **Use current view**
captures the preview center, zoom, tilt and rotation. Initial UI and map styles come
from the current user appearance settings. Preview camera messages require the exact
preview window and same origin.

## URL contract

- `v=1` identifies the configuration version.
- `hubs`, `organisations`, `projects`, `layers`: comma-separated stable IDs. Membership
  is the deduplicated union of each selection's descendants, not an intersection.
- `exclude`: explicit layer IDs omitted even when a parent includes them.
- `active`: explicit initial layer IDs. Omitted means all included layers; empty means
  none, except that an available singleton is enabled. Foreign IDs are ignored.
- `mapStyle`: public catalogue key; `theme`: supported UI theme ID.
- `languages`: comma-separated supported languages (`en`, `zh-Hant`, `zh-Hans`),
  defaulting to all three for existing links. At least one is required.
- `lang`: primary starting language; must belong to `languages`. Visitors may select
  another supported language in Settings. Removing the primary language in the builder
  promotes the first remaining language.
- Filters are always available; legacy `filters=0` is ignored.
- `view=longitude,latitude,zoom,pitch,bearing`: optional fixed starting camera. Existing
  three-value links remain valid with zero tilt and rotation.

Unknown resources resolve to an empty map, never to all maps. Missing scope and invalid
configuration fail closed. Each selector is limited to 500 IDs. Large hand-authored URLs
remain subject to browser and hosting URL limits; saved short links are future work.

## Visibility and UI

The cookie-independent `/api/embed` reader rechecks publication and archive state for
Hub, Organisation, Project, Layer and Feature on every bounded page. It preserves host
hub exclusivity and historical-layer policy, checks consistent ancestry and removes
internal property definitions and assignments. Admin cookies do not widen access. URLs
are public configurations, not capabilities granting access to private content.

The map icon opens the existing `ResourcePanel`, with Organisation, Project, Layer and
Places sections. Singleton hierarchy levels are omitted; Places remains available even
for a single layer. Each visible section uses the regular search control, restricted to
its included rows. Section searches change the list, not the map's active layer set.
Choices stay structurally stable when layers or filters change. Place rows open details
and have no hierarchy-filter action. Long embed labels wrap inside the existing rows.

`FiltersPanel` and its division, category and range controls consume an embed adapter.
Definitions and choices come only from the public included content. `SettingsPanel` uses
a restricted model with the existing LanguageSection and ThemeSection/ThemePicker;
account, advanced-language, map-style and contribution settings are absent. Theme and
language choices change this iframe without account writes. The ordinary app retains its
full settings model and controls.

Read-only feature details link to the full app. Navigation reuses the regular `AppMenu`
with only Maps, Filters and Settings, preserving its responsive bottom placement. The
map extends beneath the menu; only panel content reserves mobile menu clearance. The
promotional Hype link is deferred.

The document framing policy allows arbitrary sites to frame `/embed`; other HTML routes
remain same-origin. API access does not require third-party cookies or storage. The
share builder reuses the current host, so hub-exclusive content stays on its hub.

## Verification

- `src/tests/embed-config.test.ts`: URL validation, serialization, singleton/default
  semantics, iframe escaping and anonymous bootstrap boundaries.
- `src/tests/embed-scope.test.ts`: real SQLite union, ancestor-publication, hub
  exclusivity, ancestry and D1 parameter-budget checks.
- `dev-check bun scripts/visual-checks/embed-sharing-check.ts`: Chromium and Firefox
  builder fixture, include/default controls, searchable resource/place sections, visual
  UI-theme selection, language/filter controls, mobile preview and a real cross-origin
  iframe with browser storage disabled. Set `HYPE_CHECK_ORIGIN` for an existing server.
  The builder fixture is component evidence, not authenticated admin-session evidence.

Feature pages are loaded in bounded batches for the included set. Very large selections
may need a later viewport-loading implementation; the first version waits for those
batches before presenting the complete map and local filter choices.
