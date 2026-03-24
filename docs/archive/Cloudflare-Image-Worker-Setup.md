# Cloudflare Asset Worker Setup

## Buckets

Create the six R2 buckets used by the asset system:

```bash
bunx wrangler r2 bucket create hype-assets-dev
bunx wrangler r2 bucket create hype-assets-preview
bunx wrangler r2 bucket create hype-assets-prod
bunx wrangler r2 bucket create hype-assets-raw-dev
bunx wrangler r2 bucket create hype-assets-raw-preview
bunx wrangler r2 bucket create hype-assets-raw-prod
```

## Deploy

Run the asset worker locally:

```bash
bun run dev:asset-service:remote
```

Deploy preview:

```bash
bun run deploy:asset-service:preview
```

Deploy production:

```bash
bun run deploy:asset-service:prod
```

## App Config

Point the main app at the raw asset worker for original downloads:

```text
PUBLIC_RAW_ASSET_BASE_URL=http://localhost:8788
```

For transformed asset delivery, configure the shared asset host:

```text
PUBLIC_ASSET_BASE_URL=
PUBLIC_ASSET_BASE_URL=https://assets.preview.hype.hk
PUBLIC_ASSET_BASE_URL=https://assets.hype.hk
```

For preview and production, use the dedicated raw asset domains:

```text
PUBLIC_RAW_ASSET_BASE_URL=https://raw.assets.preview.hype.hk
PUBLIC_RAW_ASSET_BASE_URL=https://raw.assets.hype.hk
```

The app resolves transformed asset URLs against `assets.*`, while raw downloads use `raw.assets.*`.

## Public Domains

Map the shared asset hosts directly to the public asset buckets:

```bash
bunx wrangler r2 bucket domain add hype-assets-preview --domain assets.preview.hype.hk
bunx wrangler r2 bucket domain add hype-assets-prod --domain assets.hype.hk
```

Map the raw asset worker routes separately:

```bash
bun run deploy:asset-service:preview
bun run deploy:asset-service:prod
```

The raw asset worker routes remain on:

```text
raw.assets.preview.hype.hk
raw.assets.hype.hk
```

## Direct Upload Flow

The app now uses a three-step upload flow:

1. `authImageUpload(...)` issues a short-lived presigned R2 `PUT` URL plus a confirmation token.
2. The browser uploads the original file directly to the stage originals bucket at the stable `{publicId}` key.
3. `finalizeImageUpload(...)` confirms the object exists, writes `{publicId}.json`, `{publicId}.v{version}.json`, and `{publicId}.manifest.json`, persists the requested relation links, and returns the saved image payload.

For local development, the app worker and asset worker R2 bindings use `remote = true` so direct uploads and reads target the same real buckets instead of separate local Miniflare state.

Apply the companion R2 CORS policy from `scripts/cloud/r2-image-upload.cors.json` to each raw asset bucket so browser `PUT` uploads are allowed from local, preview, and production app origins.

## Asset Analytics

The asset worker now writes one Workers Analytics Engine event for each successful `GET` asset delivery. The dataset is bound as `IMAGE_ANALYTICS` and writes into `hype_asset_delivery`, recording:

- `publicId`
- canonical transformation key
- cache status (`edge-hit`, `r2-derived-hit`, `transform-miss`)
- requested stage
- resolved source stage
- output format
- total response time
- content length

The worker also exposes a protected summary endpoint:

```text
GET /analytics/summary
Authorization: Bearer <IMAGE_ANALYTICS_READ_TOKEN>
```

It returns `24h`, `7d`, and `30d` windows for:

- top 25 transformations
- top 25 images
- cache hit %
- derived hit %
- derived miss %
- p95 response time for cache / derived hit / derived miss

To enable the summary endpoint in preview and production, set these secrets on the image worker:

```bash
bunx wrangler secret put CLOUDFLARE_ACCOUNT_ID --config workers/asset-service/wrangler.toml --env preview
bunx wrangler secret put CLOUDFLARE_ACCOUNT_ID --config workers/asset-service/wrangler.toml --env production
bunx wrangler secret put CLOUDFLARE_ANALYTICS_API_TOKEN --config workers/asset-service/wrangler.toml --env preview
bunx wrangler secret put CLOUDFLARE_ANALYTICS_API_TOKEN --config workers/asset-service/wrangler.toml --env production
bunx wrangler secret put IMAGE_ANALYTICS_READ_TOKEN --config workers/asset-service/wrangler.toml --env preview
bunx wrangler secret put IMAGE_ANALYTICS_READ_TOKEN --config workers/asset-service/wrangler.toml --env production
```

The Cloudflare API token needs permission to query Analytics Engine for the account.

## Notes

- Originals are read from the stage-specific originals buckets.
- Derived variants are written to the stage-specific derived buckets.
- Lower stages can read higher-stage originals if the requested asset is not present locally.
- Metadata sidecars are stored next to the original object as `{publicId}.json` and `{publicId}.v{version}.json`.
