# Cloudinary to R2 Migration

This backfill reads legacy Cloudinary image rows from the ordered production SQL dump and restores missing raw sidecars in the remote production raw bucket.

## Current Source And Target

- Source dump:
  - `sql/backup/hype-db-prod-2026-03-26T09:59:42-ordered.sql`
- Default target bucket stage:
  - `production`
- Default target bucket:
  - `hype-assets-raw-prod`

## Flow

1. Load the ordered SQL dump into an in-memory sqlite database.
2. Query rows where `image.cdn = 'cloudinary'`.
3. Download the original binary from Cloudinary.
4. Upload the original export to `{publicId}.raw` when that sidecar is missing.
5. Leave any existing working object at `publicId` in place.
6. Rewrite the metadata sidecars:
   - `{publicId}.json`
   - `{publicId}.v{version}.json`
   - `{publicId}.manifest.json`
7. Retry Cloudinary export fetches up to 3 times and write a missing-source log when they still fail.

## Required Environment Variables

```bash
export CLOUDFLARE_ACCOUNT_ID=...
export R2_S3_ACCESS_KEY_ID=...
export R2_S3_SECRET_ACCESS_KEY=...
```

`PUBLIC_CLOUDINARY_CLOUD_NAME` is optional because most legacy rows already carry the Cloudinary cloud name in `image.env`.

## Commands

Plan against the default ordered production dump:

```bash
bun run scripts/cloud/migrate-cloudinary-images-to-r2.ts --limit 10
```

Backfill the production raw bucket:

```bash
bun run scripts/cloud/migrate-cloudinary-images-to-r2.ts --write
```

Target a single image id:

```bash
bun run scripts/cloud/migrate-cloudinary-images-to-r2.ts --filter-id <image-id> --write
```

Override the source file explicitly:

```bash
bun run scripts/cloud/migrate-cloudinary-images-to-r2.ts \
  --source sql/backup/hype-db-prod-2026-03-26T09:59:42-ordered.sql \
  --write
```

Missing Cloudinary exports are logged to:

```text
tmp/cloudinary-migration-missing-images.log
```

## Notes

- `--source` accepts either a `.sql` ordered dump or a `.sqlite` mirror.
- `--db` is still accepted as an alias for `--source`.
- In `plan` mode, the script validates the source rows but does not hit R2.
- In `sync` mode, existing working objects at `publicId` are left in place; missing `.raw` objects are backfilled at `{publicId}.raw`.
- If a row fails to download from Cloudinary or write to R2, it is reported and skipped.
