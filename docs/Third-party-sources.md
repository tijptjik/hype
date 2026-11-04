# Public third-party datasets

`src/lib/sources/cache.ts` is the shared public dataset cache, parallel to Hype's
session-local `CacheCtx`. Hype resources retain their authorization scopes, remote-query
ownership and mutation invalidation. Never put private Hype data or credentials into the
public source cache.

Source identity includes provider, absolute manifest URL and adapter schema version.
Memory retention coalesces concurrent requests; browser Cache Storage persists the
validated dataset across reloads. Both expire 24 hours after a successful load.
Unavailable storage falls back to memory. Expired or invalid entries require a
successful refresh: errors remain retryable, with no silent stale/offline fallback.

The address street/building pickers preload SaanSeoi names when mounted on the page.
Each projection loads all JSON-array chunks and validates byte length, SHA-256, row
counts, unique IDs and record schemas before caching. NDJSON is not downloaded alongside
JSON. Missing translations remain absent; building records without any explicit language
name are excluded from translation selection. Unclassified primary labels are not
assigned an invented language. Selection still edits names, not canonical address
identity. Marker-derived divisions continue to use Hype's existing spatial mirror; this
does not replace spatial membership with a name lookup.

Set the public, build-time Vite environment variable `PUBLIC_SAANSEOI_API_URL`:

- Development default: `http://api.atlas.localhost`
- Production default: `https://api.saanseoi.hk`
- Local export Worker example: `http://127.0.0.1:8793`

Use an origin without credentials. The same variable already configures SaanSeoi
geocoding; ensure an override routes every endpoint needed by the app. Restart Vite
after changing local environment configuration; rebuild for production changes. The
development hostname must resolve and serve exports; the client does not fall back to
production. Public requests omit credentials, including on chunk downloads.

Street names use `/streets/v0.1/exports/physical/saanseoi/names/manifest.json`. Building
names use `/buildings/v0.1/exports/physical/overture/names/manifest.json`. The cache is
provider-neutral; additional adapters can use `SourceCache.load` with their own
identity, runtime parser and complete-dataset loader.

The local router must route export paths to the separate SaanSeoi export Worker (port
8793), while normal API paths keep using Atlas. See `scripts/local-dev/Caddyfile`. A
missing route returns 404 and the autocomplete shows an explicit loading failure, not an
empty search result.

Each picker is a single autocomplete input. It searches substrings in the address
field's selected locale (case-insensitive and Unicode-normalized), with up to 30 visible
suggestions. Typing does not save arbitrary text; clicking a result or using Arrow keys
and Enter selects the published record. Missing translations are not substituted from
another language. Escape or leaving the field restores the saved value. Catalogues still
preload on mount and retain the daily cache policy.

A selected name displays as a compact icon/name/type tile. Hover or keyboard focus
reveals Replace. Replacement opens a blank search draft; Cancel, Escape, or focus
leaving the picker preserves the prior selection. Empty fields show search directly.
