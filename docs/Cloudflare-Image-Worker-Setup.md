# Cloudflare Image Worker Setup

## Buckets

Create the six R2 buckets used by the image system:

```bash
bunx wrangler r2 bucket create hype-images-local
bunx wrangler r2 bucket create hype-images-preview
bunx wrangler r2 bucket create hype-images-production
bunx wrangler r2 bucket create hype-images-derived-local
bunx wrangler r2 bucket create hype-images-derived-preview
bunx wrangler r2 bucket create hype-images-derived-production
```

## Deploy

Run the image worker locally:

```bash
bun run dev:image-service
```

Deploy preview:

```bash
bun run deploy:image-service:preview
```

Deploy production:

```bash
bun run deploy:image-service:production
```

## App Config

Point the main app at the dedicated worker by setting:

```text
PUBLIC_IMAGE_BASE_URL=http://localhost:8788
```

for local development, and:

```text
PUBLIC_IMAGE_BASE_URL=https://images.preview.hype.hk
PUBLIC_IMAGE_BASE_URL=https://images.hype.hk
```

for preview and production respectively.

## Direct Upload Flow

The app now uses a three-step upload flow:

1. `authImageUpload(...)` issues a short-lived presigned R2 `PUT` URL plus a confirmation token.
2. The browser uploads the original file directly to the stage originals bucket at the stable `{publicId}` key.
3. `finalizeImageUpload(...)` confirms the object exists, writes `{publicId}.json`, `{publicId}.v{version}.json`, and `{publicId}.manifest.json`, and returns the live image pointer for DB persistence.

For local development, the app worker and image worker R2 bindings use `remote = true` so direct uploads and image reads target the same real buckets instead of separate local Miniflare state.

Apply the companion R2 CORS policy from `scripts/cloud/r2-image-upload.cors.json` to each image originals bucket so browser `PUT` uploads are allowed from local, preview, and production app origins.

## Notes

- Originals are read from the stage-specific originals buckets.
- Derived variants are written to the stage-specific derived buckets.
- Lower stages can read higher-stage originals if the requested asset is not present locally.
- Metadata sidecars are stored next to the original object as `{publicId}.json` and `{publicId}.v{version}.json`.
