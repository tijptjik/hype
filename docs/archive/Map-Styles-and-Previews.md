# Map Styles & Previews

## Overview

Map styles and map previews are both treated as derived assets, not hand-edited
repository source files.

- Built-in map style source of truth lives in `src/lib/map/styles`.
- Built-in style JSON artifacts are generated into `static/mapStyles`.
- Style JSON is served through `GET /api/mapStyles/[key]`.
- Style preview PNGs are generated explicitly by command or build script, not on-demand
  from admin card selection.
- Project and layer previews are rendered from headless app routes that reuse the real
  `MapCanvas` path.
- Local style previews are written to `static/mapRender/styles/{styleCode}.png`.
- Local project and layer previews are written under `/tmp/hype-map-previews/...` and
  served through app asset routes.
- Remote project and layer previews are rendered asynchronously through a Cloudflare
  Queue consumer and stored in environment-specific R2 buckets.
- Public remote preview delivery happens through immutable, hash-addressed URLs.

## Table of Contents

- [Map Styles](#map-styles)
- [Map Style Generation](#map-style-generation)
- [Map Style Runtime Usage](#map-style-runtime-usage)
- [Map Previews](#map-previews)
- [Local Commands](#local-commands)
- [Environment Layout](#environment-layout)
- [Object Key Convention](#object-key-convention)
- [Workers](#workers)
- [Provisioning Commands](#provisioning-commands)
- [Runtime Flow](#runtime-flow)

## Map Styles

Built-in map styles are registered and built from code, not stored as mutable JSON
source files.

- Registry and definitions live under
  [`src/lib/map/styles`](/home/io/code/hype/src/lib/map/styles).
- Each registered style key resolves to a generated `StyleSpecification`.
- Generated artifacts are emitted to
  [`static/mapStyles`](/home/io/code/hype/static/mapStyles).
- Each artifact filename is content-addressed with a short hash, for example
  `/mapStyles/hyper.8c7242df35dd.json`.
- A generated manifest records the current hashed filename for each style key.

## Map Style Generation

Map style JSON is generated in two stages:

1. Style registry code builds a `StyleSpecification` for each registered style key.
2. The build step serializes each style into immutable JSON artifacts in `static/mapStyles`.

Relevant implementation files:

- Registry and style assembly:
  [`src/lib/map/styles/registry.ts`](/home/io/code/hype/src/lib/map/styles/registry.ts)
- Artifact generation:
  [`src/lib/map/styles/build.ts`](/home/io/code/hype/src/lib/map/styles/build.ts)
- Route serving:
  [`src/routes/api/mapStyles/[key]/+server.ts`](/home/io/code/hype/src/routes/api/mapStyles/%5Bkey%5D/+server.ts)
- Route response strategy:
  [`src/lib/map/styles/serve.ts`](/home/io/code/hype/src/lib/map/styles/serve.ts)

Generation behavior:

- Vite runs `mapStyleArtifactsPlugin()` during build and dev.
- The plugin regenerates `static/mapStyles` when files under `src/lib/map/styles`
  change.
- `manifest.json` is regenerated alongside the hashed JSON assets.
- Runtime callers can request the style inline with `?inline=1`, or receive a
  redirect to the immutable hashed asset path by default.

## Map Style Runtime Usage

The app treats style JSON and preview PNGs as separate concerns.

- Style JSON is fetched from `GET /api/mapStyles/[key]`.
- The route validates the style key and serves the built-in style response.
- By default, the route issues a `307` redirect to the hashed file under
  `/mapStyles/...json`.
- `?inline=1` returns JSON directly with ETag support. This is used when the app
  needs to mutate the style payload at runtime, such as hiding symbol layers for
  no-labels mode.
- Current callers include the main map canvas, headless preview pages, and small
  map components.

This separation matters:

- `api/mapStyles` is for style JSON responses only.
- `api/mapRenders` is for preview image orchestration, planning, and asset serving.

## Map Previews

There are three preview kinds in the current implementation:

- `styles`
- `layers`
- `projects`

Current preview endpoints:

- Style preview asset resolution
  - local static path:
    `/mapRender/styles/{styleCode}.png`
- Layer preview routes
  - asset:
    `GET /api/mapRenders/layers/[layer]/asset`
  - render payload:
    `GET /api/mapRenders/layers/[layer]/render`
  - single refresh:
    `POST /api/mapRenders/layers/[layer]/refresh`
- Project preview routes
  - asset:
    `GET /api/mapRenders/projects/[project]/asset`
  - render payload:
    `GET /api/mapRenders/projects/[project]/render`
  - single refresh:
    `POST /api/mapRenders/projects/[project]/refresh`
- Batch planning / refresh
  - `POST /api/mapRenders/refresh`
- Headless render pages
  - `GET /headless/map-style-render/[style]`
  - `GET /headless/map-layer-render/[layer]`
  - `GET /headless/map-project-render/[project]`

Important current behavior:

- Style previews are generated ahead of time and are expected to exist before admin
  style cards render.
- Project and layer preview hashes are computed from current render inputs on demand.
- The app does not currently persist `publicUrl`, `hash`, or `generatedAt` back into
  project/layer DB rows.
- Project and layer preview asset routes compute the current hash live, then either:
  - serve the local `/tmp` file in development, or
  - redirect to the immutable remote R2/CDN URL in preview and production.

## Local Commands

Style, layer, and project previews are all generated explicitly from Bun scripts.

Incremental generation:

```sh
bun run map:preview:styles
bun run map:preview:layers
bun run map:preview:projects
bun run map:preview
```

Forced full regeneration:

```sh
bun run map:preview:styles:init
bun run map:preview:layers:init
bun run map:preview:projects:init
bun run map:preview:init
```

Command behavior:

- `map:preview:styles`
  - uses the current style content hash to skip up-to-date previews
  - writes local style previews to `static/mapRender/styles`
- `map:preview:layers`
  - plans layer preview jobs changed in the last 24 hours by default
  - writes local layer previews to `/tmp/hype-map-previews/mapRender/layers/...`
- `map:preview:projects`
  - plans project preview jobs changed in the last 24 hours by default
  - writes local project previews to `/tmp/hype-map-previews/mapRender/projects/...`
- `map:preview`
  - runs styles first, then layers/projects

The Cloudflare build scripts also run style preview generation before building the app:

```sh
bun run build:cf:preview
bun run build:cf:production
```

## Environment Layout

- `local`
  - app origin: `http://localhost:5173`
  - style asset base URL: local app static files under `/mapStyles`
  - style preview asset path: `/mapRender/styles/{styleCode}.png`
  - layer/project preview local files: `/tmp/hype-map-previews/...`
  - layer/project asset delivery: app routes under `/api/mapRenders/.../asset`
  - queue binding exists locally in Wrangler config, but local preview commands render
    directly instead of enqueueing
- `preview`
  - app origin: `https://preview.hype.hk`
  - style asset base URL: app-served static assets
  - preview asset base URL: `https://assets.preview.hype.hk`
  - queue: `hype-map-preview-render-jobs-preview`
  - bucket: `hype-assets-preview`
- `production`
  - app origin: `https://hype.hk`
  - style asset base URL: app-served static assets
  - preview asset base URL: `https://assets.hype.hk`
  - queue: `hype-map-preview-render-jobs-prod`
  - bucket: `hype-assets-prod`

## Object Key Convention

Style JSON and preview PNGs use different storage conventions.

Built-in style JSON artifacts use immutable static file paths:

- `/mapStyles/{styleCode}.{hash}.json`
- `/mapStyles/manifest.json`

Preview images use immutable object keys:

- `mapRender/styles/{styleCode}/{hash}.png`
- `mapRender/layers/{layerId}/{hash}.png`
- `mapRender/projects/{projectId}/{hash}.png`

Local development differences:

- styles are flattened to `/mapRender/styles/{styleCode}.png`
- layers/projects still use the hash-addressed object-key shape on disk under `/tmp`

## Workers

Three workers currently participate in the preview pipeline:

- App worker:
  [`wrangler.toml`](/home/io/code/hype/wrangler.toml)
  - serves the SvelteKit app
  - serves generated `static/mapStyles` artifacts
  - handles `api/mapStyles/[key]` style requests
  - handles preview planning, asset routes, render payload routes, and local refresh routes
  - enqueues remote preview render jobs through `MAP_RENDER_QUEUE`
- Preview renderer worker:
  [`workers/map-render-service/wrangler.toml`](/home/io/code/hype/workers/map-render-service/wrangler.toml)
  - consumes queue messages
  - calls Cloudflare Browser Rendering's screenshot API
  - uploads immutable PNGs into R2
- Preview scheduler worker:
  [`workers/map-render-scheduler/wrangler.toml`](/home/io/code/hype/workers/map-render-scheduler/wrangler.toml)
  - runs on cron
  - calls `POST /api/mapRenders/refresh?mode=enqueue`
  - triggers periodic layer/project regeneration planning

The queue payload contract lives in
[`src/lib/types.ts`](/home/io/code/hype/src/lib/types.ts).

## Provisioning Commands

Authenticate first:

```sh
bunx wrangler login
```

Map previews now live in the shared asset buckets, so there are no separate remote preview buckets to create.

Create the remote queues:

```sh
bunx wrangler queues create hype-map-preview-render-jobs-preview
bunx wrangler queues create hype-map-preview-render-jobs-prod
```

Upload renderer worker secrets:

```sh
bunx wrangler secret put BROWSER_RENDERING_API_TOKEN --config workers/map-render-service/wrangler.toml --env preview
bunx wrangler secret put BROWSER_RENDERING_API_TOKEN --config workers/map-render-service/wrangler.toml --env production
bunx wrangler secret put CLOUDFLARE_ACCOUNT_ID --config workers/map-render-service/wrangler.toml --env preview
bunx wrangler secret put CLOUDFLARE_ACCOUNT_ID --config workers/map-render-service/wrangler.toml --env production
```

Upload app worker secrets:

```sh
bunx wrangler secret put MAP_RENDER_TOKEN --env preview
bunx wrangler secret put MAP_RENDER_TOKEN --env production
bunx wrangler secret put MAP_REFRESH_TOKEN --env preview
bunx wrangler secret put MAP_REFRESH_TOKEN --env production
```

Upload scheduler worker secrets:

```sh
bunx wrangler secret put MAP_REFRESH_TOKEN --config workers/map-render-scheduler/wrangler.toml --env preview
bunx wrangler secret put MAP_REFRESH_TOKEN --config workers/map-render-scheduler/wrangler.toml --env production
```

Deploy the preview renderer worker:

```sh
bunx wrangler deploy --config workers/map-render-service/wrangler.toml --env preview
bunx wrangler deploy --config workers/map-render-service/wrangler.toml --env production
```

Deploy the preview scheduler worker:

```sh
bunx wrangler deploy --config workers/map-render-scheduler/wrangler.toml --env preview
bunx wrangler deploy --config workers/map-render-scheduler/wrangler.toml --env production
```

Deploy the app worker:

```sh
bun run deploy:preview
bun run deploy:prod
```

Useful scheduler dev/test commands:

```sh
bunx wrangler dev --config workers/map-render-scheduler/wrangler.toml --test-scheduled
curl "http://localhost:8787/__scheduled?cron=0+*+*+*+*"
```

## Runtime Flow

### Map Style Flow

1. Register or update built-in map style definitions in `src/lib/map/styles`.
2. Let the Vite plugin rebuild immutable JSON artifacts in `static/mapStyles`.
3. Generate style preview PNGs explicitly with `bun run map:preview:styles` or via
   the Cloudflare build scripts.
4. Request `GET /api/mapStyles/[key]`.
5. Redirect to the hashed `/mapStyles/...json` asset by default, or return inline
   JSON with `?inline=1`.
6. Let runtime consumers load or lightly transform the style JSON as needed.

### Layer / Project Preview Flow

1. Persist the project or layer change.
2. Compute the effective preview hash from the current render inputs.
3. Build a `MapRenderJob`.
4. Local:
   - open the headless route in Playwright
   - capture the preview
   - write it under `/tmp/hype-map-previews/...`
5. Preview / production:
   - enqueue the job through the app worker's `MAP_RENDER_QUEUE` binding
   - let the preview renderer worker capture and upload the PNG into R2
6. Serve the preview through `GET /api/mapRenders/{layers|projects}/[id]/asset`,
   which computes the current hash live and resolves the correct local file or remote
   immutable URL.

### Scheduled Regeneration Flow

1. The scheduler worker runs on cron.
2. It calls `POST /api/mapRenders/refresh?mode=enqueue`.
3. The app worker plans layer/project preview jobs whose effective inputs changed
   within the configured time window.
4. The app enqueues only the relevant preview jobs.
5. The preview renderer worker processes the queue and uploads the new immutable PNGs.
