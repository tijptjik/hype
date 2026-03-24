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

## Notes

- Originals are read from the stage-specific originals buckets.
- Derived variants are written to the stage-specific derived buckets.
- Lower stages can read higher-stage originals if the requested asset is not present locally.
- Metadata sidecars are stored next to the original object as `{publicId}.json` and `{publicId}.v{version}.json`.
