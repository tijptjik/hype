# Map Styles & Previews

## Overview

Map styles and map previews are both treated as derived assets, not hand-edited
repository source files.

- Built-in map style source of truth lives in `src/lib/map/styles`.
- Built-in style JSON artifacts are generated into `static/mapStyles`.
- Style JSON is served through `GET /api/mapStyles/[key]`.
- Map preview PNGs are generated separately from style JSON.
- Preview rendering happens asynchronously through a Cloudflare Queue consumer.
- Generated preview PNGs are stored in environment-specific R2 buckets.
- Public preview delivery happens through immutable, hash-addressed URLs.

## Table of Contents

- [Map Styles](#map-styles)
- [Map Style Generation](#map-style-generation)
- [Map Style Runtime Usage](#map-style-runtime-usage)
- [Map Previews](#map-previews)
- [Environment Layout](#environment-layout)
- [Object Key Convention](#object-key-convention)
- [Workers](#workers)
- [Provisioning Commands](#provisioning-commands)
- [Local Catalog Fallback](#local-catalog-fallback)
- [Runtime Flow](#runtime-flow)

## Map Styles

Built-in map styles are registered and built from code, not stored as mutable JSON
source files.

- Registry and definitions live under [`src/lib/map/styles`](/home/io/code/hype/src/lib/map/styles).
- Each registered style key resolves to a generated `StyleSpecification`.
- Generated artifacts are emitted to [`static/mapStyles`](/home/io/code/hype/static/mapStyles).
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
- Current callers include the main map canvas, headless preview page, and small
  map components.

This separation matters:

- `api/mapStyles` is for style JSON responses only.
- `api/mapPreviews` is for preview image orchestration and preview status APIs.

## Map Previews

Map previews are derived PNG assets generated from map styles and, later, other
render targets such as projects and layers.

- Current endpoint shape:
  `GET|POST /api/mapPreviews/styles/[key]`
- Planned future expansion:
  `/api/mapPreviews/project/[project]`
  `/api/mapPreviews/layer/[layer]`
- Local preview generation loads development-only preview code lazily.
- Remote preview generation is handled asynchronously through Cloudflare
  infrastructure.

## Environment Layout

- `local`
  - app origin: `http://localhost:5173`
  - style asset base URL: local app static files under `/mapStyles`
  - preview asset base URL: local static fallback
  - Cloudflare resources: none for style serving or preview generation
- `preview`
  - app origin: `https://preview.hype.hk`
  - style asset base URL: app-served static assets
  - preview asset base URL: `https://assets.preview.hype.hk`
  - queue: `hype-map-preview-render-jobs-preview`
  - bucket: `hype-map-previews-preview`
- `production`
  - app origin: `https://hype.hk`
  - style asset base URL: app-served static assets
  - preview asset base URL: `https://assets.hype.hk`
  - queue: `hype-map-preview-render-jobs-prod`
  - bucket: `hype-map-previews-prod`

## Object Key Convention

Style JSON and preview PNGs use different storage conventions.

Built-in style JSON artifacts use immutable static file paths:

- `/mapStyles/{styleCode}.{hash}.json`
- `/mapStyles/manifest.json`

Preview images use immutable object keys:

- `mapPreviews/styles/{styleCode}/{hash}.png`
- `mapPreviews/layers/{layerId}/{hash}.png`
- `mapPreviews/projects/{projectId}/{hash}.png`

## Workers

Two workers participate in the pipeline:

- App worker: [`wrangler.toml`](/home/io/code/hype/wrangler.toml)
  - serves the SvelteKit app
  - serves generated `static/mapStyles` artifacts
  - handles `api/mapStyles/[key]` style requests
  - provides `PUBLIC_ORIGIN` and `PUBLIC_PREVIEW_ASSET_BASE_URL`
  - resolves preview asset base URLs
  - enqueues preview render jobs
- Preview renderer worker: [`workers/map-preview-renderer/wrangler.toml`](/home/io/code/hype/workers/map-preview-renderer/wrangler.toml)
  - consumes queue messages
  - calls Cloudflare Browser Rendering's screenshot API
  - uploads immutable PNGs into R2

The queue payload contract lives in [`src/lib/types.ts`](/home/io/code/hype/src/lib/types.ts).

## Provisioning Commands

Authenticate first:

```sh
bunx wrangler login
```

Create the remote buckets:

```sh
bunx wrangler r2 bucket create hype-map-previews-preview
bunx wrangler r2 bucket create hype-map-previews-prod
```

Create the remote queues:

```sh
bunx wrangler queues create hype-map-preview-render-jobs-preview
bunx wrangler queues create hype-map-preview-render-jobs-prod
```

Attach the public asset domains to the remote buckets:

```sh
bunx wrangler r2 bucket domain add hype-map-previews-preview --domain assets.preview.hype.hk --zone-id <HYPE_HK_ZONE_ID>
bunx wrangler r2 bucket domain add hype-map-previews-prod --domain assets.hype.hk --zone-id <HYPE_HK_ZONE_ID>
```

Upload the Browser Rendering API secret to the preview renderer worker:

```sh
bunx wrangler secret put BROWSER_RENDERING_API_TOKEN --config workers/map-preview-renderer/wrangler.toml --env preview
bunx wrangler secret put BROWSER_RENDERING_API_TOKEN --config workers/map-preview-renderer/wrangler.toml --env production
```

Upload the Cloudflare account ID to the preview renderer worker:

```sh
bunx wrangler secret put CLOUDFLARE_ACCOUNT_ID --config workers/map-preview-renderer/wrangler.toml --env preview
bunx wrangler secret put CLOUDFLARE_ACCOUNT_ID --config workers/map-preview-renderer/wrangler.toml --env production
```

Deploy the preview renderer worker:

```sh
bunx wrangler deploy --config workers/map-preview-renderer/wrangler.toml --env preview
bunx wrangler deploy --config workers/map-preview-renderer/wrangler.toml --env production
```

Deploy the app worker:

```sh
bun run deploy:preview
bun run deploy:production
```

## Local Catalog Fallback

Local development does not require any Cloudflare preview resources.

Built-in styles are still generated locally into `static/mapStyles` through the
normal app build/dev flow.

The built-in style catalog also supports local static preview generation:

```sh
bun run map:styles:preview
```

That script now writes:

- a local static image at `/mapPreviews/styles/{styleCode}.png`

## Runtime Flow

### Map Style Flow

1. Register or update built-in map style definitions in `src/lib/map/styles`.
2. Let the Vite plugin rebuild immutable JSON artifacts in `static/mapStyles`.
3. Request `GET /api/mapStyles/[key]`.
4. Redirect to the hashed `/mapStyles/...json` asset by default, or return inline
   JSON with `?inline=1`.
5. Let runtime consumers load or lightly transform the style JSON as needed.

### Map Preview Flow

1. Persist the style, layer, or project change.
2. Compute the effective preview hash from render inputs.
3. Build a `PreviewRenderJob`.
4. Enqueue it through the app worker's `PREVIEW_RENDER_QUEUE` binding.
5. Let the preview renderer worker render and upload the PNG.
6. Persist the resulting `publicUrl`, `hash`, and `generatedAt` to the relevant DB row.
