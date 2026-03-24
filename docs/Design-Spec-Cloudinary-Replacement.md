# Design Spec: Cloudinary Replacement

## Purpose
Replace Cloudinary with a Cloudflare-based image system that:

- stores originals in stage-specific R2 buckets
- serves Cloudinary-compatible transformation URLs through a Worker
- performs transforms in Worker code using TypeScript/Wasm libraries instead of Cloudflare Images
- moves image metadata out of the database and into sidecar objects in R2
- supports controlled replacement uploads without keeping historical source binaries

This design keeps the app-facing image contract close to the current one while removing Cloudinary-specific storage and upload assumptions that are currently embedded in the image stack.

Relevant current surfaces:

- DB image schema: `src/lib/db/schema/image.ts`
- Current Cloudinary upload and URL generation logic: `src/lib/client/services/image.ts`
- Current remote image API: `src/lib/api/server/image.remote.ts`
- Existing EXIF parsing helpers: `src/lib/client/services/image.ts`
- Current DB mirror command for migration prep: `package.json` script `db:mirror:prod:to:local`

## Current State Summary
The current implementation is still Cloudinary-shaped end to end:

- image records persist Cloudinary-specific values in `cdn`, `env`, `cdnId`, `publicId`, and `version`
- uploads are signed and sent directly to Cloudinary
- image URLs are generated as Cloudinary transformation URLs
- image EXIF metadata is stored both as raw JSON and as denormalized DB columns
- delete flow attempts Cloudinary cleanup after DB removal

The enum already includes `cloudflareR2`, but the active implementation does not yet support it.

## Target Architecture

### High-level shape
Use three logical responsibilities:

1. app codebase upload auth + finalize flow
2. browser direct upload to R2
3. Cloudflare Worker for image access, metadata access, transform-on-miss, and derived-cache writes

There is no separate upload Worker. Upload authorization lives in the Svelte remote layer in this repo.

### Storage model
Use stage-specific buckets.

- Originals bucket per stage:
  - production originals
  - preview originals
  - local/dev originals
- Derived bucket per stage:
  - production derived
  - preview derived
  - local/dev derived

Within a bucket, store objects by stable `publicId`.

Original binary object:

- `{publicId}`

Metadata sidecar objects stored next to the image under the same prefix:

- latest metadata:
  - `{publicId}.json`
- versioned metadata snapshot:
  - `{publicId}.v{version}.json`

Optional latest manifest for hot-path version resolution:

- `{publicId}.manifest.json`

Rationale:

- metadata lives next to the image, not in a separate top-level tree
- the source binary key remains stable
- replacement uploads overwrite the source binary at the same key
- versioned metadata snapshots allow version-specific metadata reads without keeping historical source binaries

### Version semantics
`version` is cache-busting only.

- The original binary is overwritten in place on replacement.
- The database row stores the current live version.
- Derived outputs are keyed by `version`, so replacement invalidates all cached variants without deleting the source key.
- Historical source binaries are not retained in v1.

## Data Model Changes

### Image table contract
Keep the image row as the canonical pointer to the live image asset, but remove metadata payloads from the relational model.

Keep:

- `cdn`
- `env`
- `cdnId`
- `publicId`
- `version`
- `presentationMode`
- relationship and audit columns already unrelated to EXIF payloads

Change semantics:

- `cdn` should use `cloudflareR2`
- `env` identifies the stage-specific bucket namespace, not a Cloudinary cloud name
- `cdnId` remains nullable in v1

Drop metadata columns from the image table:

- `originalFilename`
- `originalExtension`
- `originalWidth`
- `originalHeight`
- `metadata`
- `cameraModel`
- `capturedAt`
- `latitude`
- `longitude`
- `credit`

Follow-up work required alongside schema change:

- remove these fields from Zod image schemas and response shapes
- remove DB reads/writes for metadata in image create/update flows
- move metadata consumers to remote metadata fetches
- add an entry to `docs/Deferred-Migrations.md` only if rollout requires a staged compatibility period without the physical column drop

## Upload Authorization and Finalization

### New remote auth function
Add a Svelte remote command, for example `authImageUpload()`, in the image remote module.

Input:

- `cdn`
- `env`
- `scope`
- `filename`
- `contentType`
- `size`
- `replaceImageId?`

`scope` must include enough information to determine the final path and authorization chain, for example:

- `organisationId`
- `projectId`
- `ctxType`
- `ctxId`

Output:

- upload session payload for direct browser upload to R2
- assigned `publicId`
- assigned `version`
- whether the upload is a replacement

### Authz requirements
Authz must explicitly distinguish create-vs-replace.

- New upload permission:
  - grants permission to create a new image under the allowed scope path
- Replacement upload permission:
  - grants permission to overwrite the existing source binary for an existing image row
  - requires explicit request intent via `replaceImageId`

Replacement flow:

- resolve the existing image row
- verify authz for replacement on that concrete image/context
- reuse the existing `publicId`
- overwrite `{publicId}` in the stage originals bucket
- generate a new `version`

New upload flow:

- generate a new base id with `nanoid(16)`
- join `scopePath/baseId` into `publicId`
- before issuing upload auth, verify the generated base id does not already exist for that scope
- if collision occurs, generate another id
- do not allow best-effort overwrite for non-replacement uploads

This uniqueness check is required because v1 source binaries are stored at stable keys and no historical source versions are kept.

### Upload object layout
The browser uploads the original binary directly to:

- `{publicId}`

After upload succeeds, the client calls a finalize remote command.

Finalize responsibilities:

- validate upload session
- validate object existence and expected size/type where possible
- extract EXIF and derive metadata using the existing helper logic currently in `src/lib/client/services/image.ts`
- compute the live `version`
- write metadata sidecars:
  - `{publicId}.json`
  - `{publicId}.v{version}.json`
  - `{publicId}.manifest.json`
- create or update the image DB row with:
  - `cdn`
  - `env`
  - `cdnId: null`
  - `publicId`
  - `version`

## Access, Transform, and Metadata Worker

### Worker responsibilities
Use one Worker with two route families:

- image delivery:
  - `/{env}/image/upload/...`
- metadata delivery:
  - `/{env}/image/metadata/...`

Worker responsibilities:

- parse Cloudinary-compatible request URLs
- normalize aliases and defaults into one canonical transform spec
- resolve the correct stage bucket
- resolve latest version for unversioned requests via sidecar manifest
- serve cached derived output from the derived bucket
- generate derived output on miss
- write derived output to the derived bucket
- serve metadata profiles from sidecar metadata objects
- enforce cross-stage read rules

### Cross-stage read policy
Lower stages can always read higher stages.

- local/dev can read preview and production
- preview can read production
- production reads production only

If the live image record points at a higher-stage bucket, the Worker reads it directly from that bucket.

If a stage reads from a different stage bucket, emit a structured warning log with:

- request stage
- source stage
- `publicId`
- resolved version

### Metadata route contract
Support:

- `p_auto`
- `p_admin`
- `p_full`
- `p_basic`

Aliases:

- `p_auto` -> `p_full`
- `p_admin` -> `p_full`

Supported response format:

- `f_auto`
- `f_json`

Alias:

- `f_auto` -> `f_json`

Metadata sources:

- latest: `{publicId}.json`
- explicit version: `{publicId}.v{version}.json`

`p_basic` returns:

- `originalFilename`
- `originalExtension`
- `originalWidth`
- `originalHeight`
- `cameraModel`
- `capturedAt`
- `credit`
- `latitude`
- `longitude`

`p_full` returns the full stored JSON payload.

## URL Parsing and Canonicalization

### Delivery URL compatibility
Preserve Cloudinary-style request shapes:

- `{BASE_URL}/{env}/image/upload/c_fill,w_100,h_100,q_auto/g_auto/f_auto/v1750585336/scope/baseId`
- `{BASE_URL}/{env}/image/upload/c_fit,w_256,h_256/g_auto/f_auto/v1750585336/scope/baseId`
- `{BASE_URL}/{env}/image/upload/c_fit,w_256,h_256/v1750585336/scope/baseId`
- `{BASE_URL}/{env}/image/upload/c_fit,w_256,h_256/scope/baseId`
- `{BASE_URL}/{env}/image/upload/c_fit,w_256,h_256/f_webp/scope/baseId`
- `{BASE_URL}/{env}/image/upload/c_fit,w_256,h_256/scope/baseId.webp`

### Canonical transform defaults
Defaults:

- gravity: `g_auto`
- quality: `q_auto`
- format: `f_auto`

Supported transforms:

- crop modes:
  - `c_fill`
  - `c_fit`
  - `c_thumb` as alias for `c_fill + g_auto`
- gravity:
  - `g_auto`
  - `g_center`
- quality:
  - `q_auto`
- formats:
  - `f_auto`
  - `f_jpg`
  - `f_jpeg`
  - `f_png`
  - `f_webp`
  - `f_avif`
  - `f_jxl`
  - `f_svg` passthrough only

Effects:

- parse `e_*`
- ignore them in execution for v1
- do not fail solely because effects are present

Canonical cache key format:

- `{env}/{publicId}/v{version}/c_{mode},w_{w},h_{h},g_{gravity},q_{quality},f_{format}.{outputExt}`

Normalization rules:

- flatten all supported modifiers into one canonical ordered string
- if path extension is present and `f_*` is absent, infer format from extension
- if both extension and `f_*` exist and conflict, `f_*` wins
- if `v{version}` is absent, resolve from `{publicId}.manifest.json`

## Transform Engine

### Libraries
Use:

- `@jsquash/jpeg`
- `@jsquash/png`
- `@jsquash/webp`
- `@jsquash/avif`
- `@jsquash/jxl`
- `@jsquash/resize`
- `smartcrop`

### Transform behavior
Execution flow:

1. load original binary from originals bucket
2. decode to image data
3. resolve crop rectangle
4. resize
5. encode output
6. write result to derived bucket
7. return long-cache response

Crop behavior:

- `c_fit`:
  - fit inside bounds without crop
- `c_fill`:
  - crop to fill exact dimensions
- `c_thumb`:
  - same as `c_fill` with `g_auto`

Gravity behavior:

- `g_auto`:
  - use `smartcrop`
  - fallback to centered crop if smart crop fails
- `g_center`:
  - use centered crop directly

Format negotiation for `f_auto`:

1. AVIF
2. WebP
3. JXL only for explicitly enabled clients if retained
4. JPEG
5. PNG when alpha preservation is required

SVG handling:

- serve original SVG as pass-through
- do not raster-resize SVG in v1

Quality policy for `q_auto`:

- AVIF: 45
- WebP: 75
- JPEG: 80
- PNG: encoder default compression
- JXL: conservative visually-lossless default

## Client and Remote API Changes

### New remote functions
Add:

- `authImageUpload(...)`
- `finalizeImageUpload(...)`
- `getMetadata(publicId, profile, version?)`

`getMetadata` responsibilities:

- resolve current image env/bucket as needed
- fetch metadata from Cloudflare/R2 via the metadata route or direct object access
- return profile-shaped metadata payload

This function should not read image metadata from the DB.

### URL generation
Replace Cloudinary-only URL generation in the client image service with provider-aware URL generation that keeps the current call shape.

For `cloudflareR2` rows:

- use the Worker base URL
- emit canonical Cloudinary-compatible paths
- default gravity to `g_auto`

### Component migration to remote metadata reads
Components that currently rely on DB-backed image metadata must call the new remote function themselves.

Known current consumers to migrate:

- `src/lib/components/tasks/controls/ReportedMissing.svelte`
  - currently reads `latitude`, `longitude`, and `capturedAt` from `task.images?.[0]?.image?.metadata`
- `src/lib/components/featureCard/gallery/Attribution.svelte`
  - currently reads `credit` and `capturedAt` from the image payload

The gallery metadata UI in:

- `src/lib/components/featureCard/gallery/Metadata.svelte`

should remain a presentational wrapper, while the child component that needs metadata performs the remote call.

Migration rule:

- components should call `getMetadata(publicId, profile)` directly
- do not continue hydrating EXIF metadata through normal image DB payloads

Suggested profile usage:

- `ReportedMissing.svelte`:
  - `p_basic`
- `Attribution.svelte`:
  - `p_basic`
- future admin metadata views:
  - `p_full`

## Delete and Replace Semantics

Delete:

- delete DB row first
- attempt source object deletion from the correct stage originals bucket
- optionally delete derived variants lazily by leaving them unreachable through versioned URLs
- explicit derived-bucket purge is optional operational cleanup, not required for correctness

Replace:

- requires explicit replace authorization
- overwrites `{publicId}` in the originals bucket
- writes new metadata sidecars
- updates DB `version`
- does not retain historical source binaries

## Migration Strategy: Cloudinary to R2

### Scope
Only migrate images that are currently referenced in the production database.

Do not attempt to mirror the full Cloudinary library.

### Migration steps
1. Mirror production DB to local using the existing command:
   - `bun run db:mirror:prod:to:local`
2. Query the local mirrored DB for image rows that still point at Cloudinary.
3. Generate a migration manifest containing:
   - image id
   - current Cloudinary env
   - current Cloudinary public id
   - target stage bucket
   - target `publicId`
   - target `version`
4. Download each source image from Cloudinary using the raw/original asset URL.
5. Upload each binary into the production originals bucket at:
   - `{publicId}`
6. Generate metadata sidecars from the downloaded asset and write:
   - `{publicId}.json`
   - `{publicId}.v{version}.json`
   - `{publicId}.manifest.json`
7. Verify uploaded objects exist and metadata sidecars are readable.
8. Generate a data migration that updates production DB image rows from Cloudinary to Cloudflare/R2 semantics:
   - `cdn = 'cloudflareR2'`
   - `env = <production-stage-env>`
   - `cdnId = null`
   - keep `publicId`
   - keep `version`
9. Deploy the application and Worker changes.
10. Run the production DB data migration so live reads switch from Cloudinary URLs to Cloudflare URLs.
11. After production verification, remove Cloudinary-specific credentials and dead code.

### Migration safety requirements
- migration script must skip DB rows whose Cloudinary source download fails and report them explicitly
- no DB row should be switched until its source binary and metadata sidecars have been written successfully
- migration should be idempotent for reruns
- verification output should include counts for:
  - discovered DB images
  - successfully mirrored images
  - failed downloads
  - failed uploads
  - failed metadata writes

## Testing Plan

### URL normalization
- all accepted delivery URL variants normalize to one canonical transform key
- missing `g_*` defaults to `g_auto`
- missing `q_*` defaults to `q_auto`
- missing `f_*` defaults to `f_auto`
- extension-based format inference works
- unsupported `e_*` values are ignored without parse failure

### Upload auth and replacement
- new upload auth rejects unauthorized contexts
- replacement auth rejects users without replace permission
- replacement auth reuses existing `publicId`
- non-replacement uploads never overwrite an existing source object
- base id collision triggers regeneration before upload auth is returned

### Metadata storage and retrieval
- finalize writes latest and versioned metadata sidecars next to the image
- `getMetadata(publicId, p_basic)` returns expected subset
- `getMetadata(publicId, p_full)` returns full JSON payload
- explicit version reads return the matching sidecar snapshot
- latest metadata reads resolve through manifest/current version correctly

### Worker transform behavior
- `c_fit` preserves aspect ratio
- `c_fill` produces exact output size
- `c_thumb` behaves as `c_fill + g_auto`
- `g_auto` uses smart crop and falls back to center
- `f_auto` negotiates by `Accept`
- SVG requests pass through unchanged

### Migration
- local manifest generation includes only DB-backed images
- successful mirrored images produce source binary plus sidecar metadata
- generated DB data migration updates only successfully mirrored rows
- post-migration URL generation points at the Worker base URL, not Cloudinary

## Assumptions and Defaults
- Upload auth lives in this codebase, not in a separate Worker.
- Originals and derived outputs use separate buckets for each stage.
- Metadata lives next to the original image object under the same prefix.
- `g_auto` is the default gravity.
- Lower stages can always read higher stages.
- Historical source binaries are not retained.
- Version-specific metadata snapshots are retained even though source binaries are not.
- Metadata consumers will fetch metadata through the new remote function rather than through standard image DB payloads.
