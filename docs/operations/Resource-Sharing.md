# Public resource sharing

Public addresses use project and organisation codes, rather than translated display
names. Layers and features use their immutable IDs:

- `/project/{code}`
- `/organisation/{code}` (`/organization/{code}` redirects here)
- `/layer/{id}`
- `/features/{id}`

Project, layer and organisation addresses establish the map scope on entry and on client
navigation. They remain in the address bar. Existing query-based bootstrap links remain
supported. Changing a project or organisation code changes its public address;
code-history aliases are not currently stored.

The feature-card Share menu lists its organisation, project, layer and feature. Full, No
description and Breadline use the same sharing toolbar and viewer; Flexible selects the
Full or No description renderer according to the description. Selecting a resource
replaces the image viewer with sharing targets, while retaining the surrounding card.
Escape or Back to photos restores the viewer. Facebook, Threads and X open their web
composers; native sharing appears where the browser supports it. Instagram provides
image download, caption/link copying, an Open Instagram link, and native image sharing
on devices that accept files. The choice of native target remains with the user because
web browsers cannot reliably select Instagram as a native share target or prefill an
Instagram post.

Page server loads provide resource-specific Open Graph and Twitter metadata without
requiring JavaScript or a signed-in session. Project and layer previews use the existing
map-render asset endpoints. Features use their public canonical image, including
revision-backed image delivery, or their layer map when no photo exists. Organisations
use their image with a HYPE image fallback. No preview generation or publication
workflow is added.

`loadShareResource` and `publicShareVisibility` enforce published, unarchived resources
and ancestors, hub visibility, consistent ownership, and historical-layer visibility.
These checks ignore staff privileges. `/api/share/{kind}/{ref}` returns the same public
metadata for the panel; `?image=1` streams that resource's image for downloading.
Private resources return 404 from the API and map routes. Existing authorized feature
views may still render through their normal client reader, without private metadata.

Verification uses `src/tests/sharing*.test.ts`, the existing map-deep-link tests, and
`dev-check bun scripts/visual-checks/resource-sharing-check.ts` plus
`resource-sharing-routes-check.ts`. `resource-sharing-card-types-check.ts` exercises all
three renderers in Chromium and Firefox at mobile and desktop widths using a temporary
browser-only renderer override, without changing saved styles. The browser scripts
default to the existing local server on port 5175; set `HYPE_CHECK_ORIGIN` for another
local server. These checks exercise local behavior and composer URLs, not actual
publishing to social accounts.
