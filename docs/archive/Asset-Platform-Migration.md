# Asset Platform Migration

## Scope

Move from image-specific storage/service naming to asset-oriented naming:

- R2 derived/public buckets:
  - `hype-assets-dev`
  - `hype-assets-preview`
  - `hype-assets-prod`
- R2 raw/original buckets:
  - `hype-assets-raw-dev`
  - `hype-assets-raw-preview`
  - `hype-assets-raw-prod`
- Raw asset worker domains:
  - `raw.assets.preview.hype.hk`
  - `raw.assets.hype.hk`
- Public asset domains:
  - `assets.preview.hype.hk`
  - `assets.hype.hk`

## Execution List

1. Update config and bindings
   - Rename worker names to asset/render naming.
   - Rename app and worker R2 bindings from image-specific names to asset-specific names.
   - Switch bucket names from `hype-images-*` / `hype-images-derived-*` to `hype-assets-*` / `hype-assets-raw-*`.
   - Add `PUBLIC_RAW_ASSET_BASE_URL` to app env contracts.
   - Add preview app host mappings:
     - `breadline.preview.hype.hk`
     - `hkghostsigns.preview.hype.hk`

2. Switch runtime code to asset/raw URLs
   - Use `PUBLIC_ASSET_BASE_URL` for public asset delivery.
   - Use `PUBLIC_RAW_ASSET_BASE_URL` for raw/original downloads.
   - Update image storage helpers and client image URL builders to use asset/raw bindings.

3. Update object-key generation
   - New image key prefix: `h/`
   - Public/derived assets remain bucket-scoped; raw assets mirror the same logical key in raw buckets.
   - Map preview outputs remain unchanged for now because source buckets are empty and a later pass will rewrite them in-place.

4. Add DB migration
   - Prefix existing `image.publicId` values with `h/`.

5. Add storage migration scripts
   - Copy raw image objects from old buckets to new raw asset buckets with the new `h/` namespace.
   - Repoint any worker/tooling scripts still targeting old bucket names.

6. Verify and cut over
   - Run focused tests for image/asset storage and analytics.
   - Deploy renamed workers.
   - Create new buckets and domains in Cloudflare.
   - Confirm asset and raw asset URLs resolve correctly.
