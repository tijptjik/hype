# Cloudflare Asset Cutover

## Purpose

This is the ordered Cloudflare cutover checklist for the asset-platform rename:

- new public buckets:
  - `hype-assets-dev`
  - `hype-assets-preview`
  - `hype-assets-prod`
- new raw buckets:
  - `hype-assets-raw-dev`
  - `hype-assets-raw-preview`
  - `hype-assets-raw-prod`
- raw asset worker domains:
  - `raw.assets.preview.hype.hk`
  - `raw.assets.hype.hk`
- public asset bucket domains:
  - `assets.preview.hype.hk`
  - `assets.hype.hk`
- preview app domains:
  - `breadline.preview.hype.hk`
  - `hkghostsigns.preview.hype.hk`

## Preconditions

- Wrangler is authenticated against the correct Cloudflare account.
- DNS for the new custom domains is delegated and ready to be attached in Cloudflare.
- The new DB migration `0056_prefix_image_public_id_namespace.sql` has been committed.
- The raw object migration script is available at:
  [`scripts/cloud/migrate-r2-images-to-asset-raw.ts`](/home/io/code/hype/scripts/cloud/migrate-r2-images-to-asset-raw.ts)

## 1. Create R2 buckets

```sh
bunx wrangler r2 bucket create hype-assets-dev
bunx wrangler r2 bucket create hype-assets-preview
bunx wrangler r2 bucket create hype-assets-prod
bunx wrangler r2 bucket create hype-assets-raw-dev
bunx wrangler r2 bucket create hype-assets-raw-preview
bunx wrangler r2 bucket create hype-assets-raw-prod
```

## 2. Bind public domains to public buckets

```sh
bunx wrangler r2 bucket domain add hype-assets-preview --domain assets.preview.hype.hk --zone-id f001c808ff392341b958e89aedad3dfa
bunx wrangler r2 bucket domain add hype-assets-prod --domain assets.hype.hk --zone-id f001c808ff392341b958e89aedad3dfa
```

Notes:

- `assets.*` should point directly to the public asset buckets, not to a worker.
- There is no asset-gateway worker in the current plan.

## 3. Deploy workers

Raw asset worker:

```sh
bun run deploy:asset-service:preview
bun run deploy:asset-service:prod
```

Preview render workers:

```sh
bun run deploy:render-service:preview
bun run deploy:render-service:prod
bun run deploy:render-scheduler:preview
bun run deploy:render-scheduler:prod
```

## 4. Set worker secrets

Asset worker analytics secrets:

```sh
bunx wrangler secret put CLOUDFLARE_ACCOUNT_ID --config workers/asset-service/wrangler.toml --env preview
bunx wrangler secret put CLOUDFLARE_ACCOUNT_ID --config workers/asset-service/wrangler.toml --env production
bunx wrangler secret put CLOUDFLARE_ANALYTICS_API_TOKEN --config workers/asset-service/wrangler.toml --env preview
bunx wrangler secret put CLOUDFLARE_ANALYTICS_API_TOKEN --config workers/asset-service/wrangler.toml --env production
bunx wrangler secret put ASSET_ANALYTICS_READ_TOKEN --config workers/asset-service/wrangler.toml --env preview
bunx wrangler secret put ASSET_ANALYTICS_READ_TOKEN --config workers/asset-service/wrangler.toml --env production
```

Preview render/scheduler secrets:

```sh
bunx wrangler secret put BROWSER_RENDERING_API_TOKEN --config workers/map-preview-renderer/wrangler.toml --env preview
bunx wrangler secret put BROWSER_RENDERING_API_TOKEN --config workers/map-preview-renderer/wrangler.toml --env production
bunx wrangler secret put CLOUDFLARE_ACCOUNT_ID --config workers/map-preview-renderer/wrangler.toml --env preview
bunx wrangler secret put CLOUDFLARE_ACCOUNT_ID --config workers/map-preview-renderer/wrangler.toml --env production
bunx wrangler secret put MAP_PREVIEW_REFRESH_TOKEN --config workers/map-preview-scheduler/wrangler.toml --env preview
bunx wrangler secret put MAP_PREVIEW_REFRESH_TOKEN --config workers/map-preview-scheduler/wrangler.toml --env production
bunx wrangler secret put MAP_PREVIEW_REFRESH_TOKEN --env preview
bunx wrangler secret put MAP_PREVIEW_REFRESH_TOKEN --env production
bunx wrangler secret put MAP_PREVIEW_RENDER_TOKEN --env preview
bunx wrangler secret put MAP_PREVIEW_RENDER_TOKEN --env production
```

## 6. Migrate raw objects into the new buckets

Preview dry-run:

```sh
bun run scripts/cloud/migrate-r2-images-to-asset-raw.ts --stage preview
```

Preview write:

```sh
bun run scripts/cloud/migrate-r2-images-to-asset-raw.ts --stage preview --write
```

Production dry-run:

```sh
bun run scripts/cloud/migrate-r2-images-to-asset-raw.ts --stage production
```

Production write:

```sh
bun run scripts/cloud/migrate-r2-images-to-asset-raw.ts --stage production --write
```

Notes:

- This copies from `hype-images-{stage}` into `hype-assets-raw-{stage}`.
- It prefixes non-namespaced keys to `h/{oldKey}`.
- It skips keys that already exist in the target bucket.
- It writes a JSON report to `tmp/r2-image-asset-raw-migration-report.json` unless overridden with `--out`.

## 7. Verify cutover

Check public asset domains:

```sh
curl -I https://assets.preview.hype.hk
curl -I https://assets.hype.hk
```

Check raw worker health:

```sh
curl https://raw.assets.preview.hype.hk/health
curl https://raw.assets.hype.hk/health
```

Check preview app domains:

```sh
curl -I https://breadline.preview.hype.hk
curl -I https://hkghostsigns.preview.hype.hk
```

Check analytics summary:

```sh
curl -H "Authorization: Bearer $ASSET_ANALYTICS_READ_TOKEN" https://raw.assets.preview.hype.hk/analytics/summary
curl -H "Authorization: Bearer $ASSET_ANALYTICS_READ_TOKEN" https://raw.assets.hype.hk/analytics/summary
```

## 8. Post-cutover cleanup

- Leave old `hype-images-*` buckets in place until you are satisfied with rollback risk.
- Do not route any production traffic to the old asset-gateway worker.
- After the migration is stable, remove legacy buckets and any stale dashboard routes manually.
