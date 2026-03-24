# Cloudinary to R2 Migration

This migration keeps only image assets that still exist in the source database you point it at.

## Flow

1. Mirror the production database locally.
2. Read Cloudinary-backed rows from the local mirror.
3. Download the original binary from Cloudinary.
4. Upload the original to the chosen R2 originals bucket at the stable key `publicId`.
5. Write metadata sidecars next to the image:
   - `{publicId}.json`
   - `{publicId}.v{version}.json`
   - `{publicId}.manifest.json`
6. Generate a SQL patch that flips the migrated rows from `cloudinary` to `cloudflareR2` and sets `image.env` to the chosen final DB env.

## Independent Controls

The script has three separate concerns:

- source DB:
  - the sqlite file queried for Cloudinary-backed rows
- target bucket stage:
  - where binaries and sidecars are uploaded
- final DB env:
  - the `image.env` value written into the generated SQL patch

This lets you rehearse with a local mirrored prod DB, upload assets to the production bucket, and still decide separately what the generated SQL will do later when applied to the production database.

## Required Environment Variables

The migration script uses the S3-compatible R2 API and needs:

```bash
export CLOUDFLARE_ACCOUNT_ID=...
export R2_S3_ACCESS_KEY_ID=...
export R2_S3_SECRET_ACCESS_KEY=...
```

`PUBLIC_CLOUDINARY_CLOUD_NAME` is optional because most legacy rows already carry the
Cloudinary cloud name in `image.env`.

## Commands

Mirror prod to local:

```bash
bun run db:mirror:prod:to:local
```

Plan the migration without writing to R2:

```bash
bun run images:migrate:cloudinary:production:plan
```

Run the upload and SQL generation:

```bash
bun run images:migrate:cloudinary:production:sync
```

The generated SQL patch is written to:

```text
sql/data/cloudinary-to-r2-production.sql
```

## Useful Flags

Limit the run:

```bash
bun run scripts/cloud/migrate-cloudinary-images-to-r2.ts --target-stage production --final-db-env production --limit 10
```

Target a single image id:

```bash
bun run scripts/cloud/migrate-cloudinary-images-to-r2.ts --target-stage production --final-db-env production --filter-id <image-id>
```

Override the local mirrored sqlite path:

```bash
bun run scripts/cloud/migrate-cloudinary-images-to-r2.ts --target-stage production --final-db-env production --db /path/to/local.sqlite
```

Rehearse against a local prod mirror while writing assets to the production bucket and generating the SQL patch that will later update the production database:

```bash
bun run scripts/cloud/migrate-cloudinary-images-to-r2.ts \
  --db .wrangler/state/v3/d1/miniflare-D1DatabaseObject/$(basename "$(find .wrangler/state/v3/d1/miniflare-D1DatabaseObject -type f -name '*.sqlite' -print -quit)") \
  --target-stage production \
  --final-db-env production \
  --write \
  --sql-out sql/data/cloudinary-to-r2-production.sql
```

Later, apply the generated SQL patch to the production database separately:

```bash
bunx wrangler d1 execute hype-db-prod --remote --file=sql/data/cloudinary-to-r2-production.sql
```

## Notes

- The script only queries rows where `image.cdn = 'cloudinary'`.
- The SQL patch is independent from the bucket target and can be applied later as part of the production cutover.
- In `plan` mode, the script does not require Cloudflare credentials.
- In `sync` mode, it generates SQL only for rows whose source download and R2 write path succeeded.
- If a row fails to download from Cloudinary or write to R2, it is reported and left unchanged in the SQL patch.
