# Interior map types and visibility

Published map metadata distinguishes `station`, `complex`, and `building`. This is an
explicit map classification; it does not infer or change a canonical Location's type
from a source footprint, name, or indoor-map availability.

Project Advanced → Map display includes independent, default-on switches for MTR
stations, complex interior maps, and building interior maps. These govern map outlines,
discoverable entry links, nearby preloading, and indoor venue search. As with station
visibility, any selected project permitting a category makes it visible. Direct links
remain available regardless of discovery preferences.

Building maps use `/buildings/{map-id}` and optional `/places/{place-id}` paths.
Complexes and existing MTR links use `/premises/{map-id}`. Building URLs in `/premises`
return 404; there are no compatibility redirects. Internal release APIs remain under
`/api/premises-maps`; immutable source geometry and release hashes are unchanged.

Migration `0259_premises_map_complex_kind.sql` permits the explicit `complex` map kind
and preserves existing map rows and references. It does not reclassify any maps or
Locations. Moving existing premises Locations to building types is a separate, deferred
data task.
