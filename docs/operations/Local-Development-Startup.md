# Local development startup

`bun run dev` uses local D1 with remote R2 buckets and the shared preview routing
service. Wrangler creates a temporary Cloudflare preview session for those remote
bindings before Vite can start. A failure from `/workers/scripts/hype/edge-preview`
therefore stops startup before the app serves requests.

If Cloudflare preview sessions are unavailable, start the app with simulated bindings:

```sh
bun run dev:offline
```

This selects `wrangler.local.toml` and disables remote binding sessions. It retains the
existing local D1 and local R2 persistence. Remote bucket contents are unavailable;
local image data must already exist in local R2. Shared routing is unavailable unless a
matching local routing Worker is running. External HTTP APIs, maps, and the separate
asset Worker still require their usual connectivity and configuration, so this is a
fallback for binding startup failures rather than a guarantee of offline functionality.

`bun run dev:local` only simulates R2; it still uses the remote routing service and
requires a Cloudflare preview session. Return to `bun run dev` when remote bindings are
available again. The fallback does not change deployment configuration.
