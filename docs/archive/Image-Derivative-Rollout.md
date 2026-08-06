## Image Derivative Rollout

This rollout standardizes image ingestion and delivery around a bounded raw size
 plus two explicit derived formats:

- raw uploads normalized to a maximum dimension of `2048`
- derived delivery formats limited to `webp` and `jpeg`
- production `f_auto` requests allowed to serve existing derived objects only

For the current delivery and recovery procedures, see
[`docs/ops/Asset-Image-Delivery.md`](../ops/Asset-Image-Delivery.md). This
document retains the original rollout sequence and its migration rationale.

### Policy

- `heic`, `heif`, `tif`, and `tiff` are converted to `jpeg` on the client before upload.
- `jpeg`, `png`, `webp`, and `avif` remain in their source format but are resized
  on the client when either side exceeds `2048`.
- Pre-rendered derivatives are generated for both `webp` and `jpeg`.
- Production `f_auto` misses are blocked in the asset worker. After cutover,
  production must serve from the derived bucket rather than generating ad hoc
  derivatives on first request.

### 1. Prepare A Pilot Raw Backfill

Run a small production pilot first:

```bash
bun run r2:normalize:raw \
  --mode prepare \
  --stage production \
  --out-dir tmp/r2-normalized/production-pilot \
  --max-dimension 2048 \
  --concurrency 2 \
  --limit 25
```

Sync the pilot back to raw production:

```bash
bun run r2:normalize:raw \
  --mode sync \
  --stage production \
  --out-dir tmp/r2-normalized/production-pilot \
  --concurrency 2
```

### 2. Pre-render Both Derived Formats

Warm the canonical derivative set into the production derived bucket:

```bash
bun run render:assets \
  --db-stage production \
  --db-remote \
  --r2-stage production \
  --r2-remote \
  --concurrency 1 \
  --variant-delay-ms 1000
```

The worker now pre-renders:

- `c_fill,h_256,w_256` in `webp`
- `c_fill,h_256,w_256` in `jpeg`
- `c_fill,h_128,w_128` in `webp`
- `c_fill,h_128,w_128` in `jpeg`
- `c_fit,h_1024,w_1024` in `webp`
- `c_fit,h_1024,w_1024` in `jpeg`

### 3. Validate Derived Coverage

Spot-check production paths for both formats:

```bash
curl -I 'https://raw.assets.hype.hk/production/image/upload/c_fill,h_256,w_256/g_auto/f_webp/q_auto/h/some/public-id'
curl -I 'https://raw.assets.hype.hk/production/image/upload/c_fill,h_256,w_256/g_auto/f_jpeg/q_auto/h/some/public-id'
```

Optional local probe matrix:

```bash
bun run test:asset-worker:memory \
  --stage preview \
  --base-url http://127.0.0.1:8796 \
  --case jpeg-max='h/debug-memory/probes/test-jpeg-max' \
  --case png-max='h/debug-memory/probes/test-png-max' \
  --case webp-max='h/debug-memory/probes/test-webp-max' \
  --case avif-max='h/debug-memory/probes/test-avif-max' \
  --case tiff-as-jpeg='h/debug-memory/probes/test-tiff-as-jpeg'
```

### 4. Run The Full Raw Backfill

Prepare:

```bash
bun run r2:normalize:raw \
  --mode prepare \
  --stage production \
  --out-dir tmp/r2-normalized/production \
  --max-dimension 2048 \
  --concurrency 4
```

Sync:

```bash
bun run r2:normalize:raw \
  --mode sync \
  --stage production \
  --out-dir tmp/r2-normalized/production \
  --concurrency 4
```

### 5. Purge Derived Objects

After raw backfill completes, purge the production derived bucket so stale
derivatives regenerate from the normalized raws. Do not wipe the raw bucket.

This repository does not yet include an automated purge helper; perform the
derived-bucket purge as an explicit operational step.

### 6. Rewarm And Validate The Purged Derivatives

After purging, repeat the canonical warmup and coverage validation before
blocking production auto-transform misses. Otherwise, a valid cache miss would
return `404` rather than regenerating its derived object.

```bash
bun run render:assets \
  --db-stage production \
  --db-remote \
  --r2-stage production \
  --r2-remote \
  --concurrency 1 \
  --variant-delay-ms 1000
```

### 7. Optionally Deploy The Production Worker Cutover

Deploy the asset worker with:

- `BLOCK_PRODUCTION_AUTO_TRANSFORM_MISS = "1"`

The current production configuration leaves this setting at `"0"`. Change it to
`"1"` only after the rewarm and validation above have completed. Once deployed:

- production `f_auto` requests still serve existing derived objects
- production `f_auto` misses return `404`
- preview and local environments continue to allow on-demand transforms

This is a temporary cutover setting. After the raw backfill and derived warmup
have been validated, revert production to:

- `BLOCK_PRODUCTION_AUTO_TRANSFORM_MISS = "0"`

That restores slow on-demand fallback behavior for any unexpected production
misses while preserving the new normalized-raw and pre-render strategy.

### Notes

- Cold transforms still take roughly `1-2s`, so steady-state delivery should
  rely on derived-cache hits rather than live transforms.
- `webp` is the preferred modern output because it remains above `95%` browser
  support while being materially cheaper to encode than `avif` in this worker.
- `jpeg` remains the universal compatibility fallback and should continue to be
  pre-rendered alongside `webp`.

### First Fallback: Cloudflare Images Memory Fallback

Production enables `ENABLE_CLOUDFLARE_IMAGES_FALLBACK` for a narrow subset of
cache misses. The asset Worker reads JPEG, PNG, and WebP dimensions from their
compressed headers and delegates only sources above `2,000,000` pixels to the
Cloudflare Images binding. This protects the read path while the raw backfill is
in progress or when a non-normalized source remains. The binding result is
written to the normal derived bucket, so that transform is paid for only on its
first cache miss.

The fallback accepts sources up to 20 MB, which is the Images binding input
limit. Preview and local keep the fallback disabled so the feature can be
enabled deliberately per environment.

### Second Fallback: Post-OOM Repair

`workers/asset-memory-repair` is a production Tail Worker attached to
`hype-asset-service-prod`. When a `GET` or `HEAD` asset transform terminates
with the Worker `exceededMemory` outcome, it parses the request in memory,
regenerates the exact missing derivative through the Images binding, and writes
it to `hype-assets-prod`. The failed response cannot be recovered, but a retry
will receive the normal immutable R2-derived hit.

The worker only accepts `assets.hype.hk` requests for owned `h/` public ids and
only repairs JPEG, PNG, WebP, or AVIF output from a compatible supported source
object. It never logs the unredacted request URL. A Durable Object leases each
derived R2 key while it is being repaired, preventing a burst of identical OOM
events from creating multiple billed Images transformations.

Deploy the repair Worker before the asset Worker so the configured Tail consumer
exists:

```bash
bun run deploy:asset-memory-repair:prod
bun run deploy:asset-service:prod
```

The Tail Worker has the same 20 MB Cloudflare Images input limit. It is a
recovery path for a failed request, not a way to transform larger objects.

### Third Fallback: Targeted Large-Source Repair

For a known source above the Cloudflare Images input limit—including a 100 MB+
object—use the targeted helper. It downloads only the selected object's working
copy and metadata sidecars, converts it locally with Sharp, and uploads the
replacement only after the local conversion succeeds. `--mode apply` requires
an explicit canonical public id, so it cannot accidentally rewrite a bucket.

```bash
bun run r2:resize:raw --stage production \
  --key h/organisations/example/image-id \
  --max-dimension 2048 \
  --concurrency 1
```

For TIFF sources, the helper preserves the original at `<public-id>.raw` and
replaces the working object with a JPEG. It also updates the image metadata
sidecars. Rewarm the canonical derivatives afterwards so production serves R2
derived hits rather than attempting an on-demand transform:

```bash
bun run render:assets \
  --db-stage production --db-remote \
  --r2-stage production --r2-remote \
  --raw-key h/organisations/example/image-id \
  --concurrency 1 --variant-delay-ms 1000
```

The helper uses a temporary local staging directory and removes it after the
upload. To review output before any R2 writes, run the same command with
`r2:normalize:raw --mode prepare` instead of `r2:resize:raw`. Its practical
limit is the operator machine's disk and memory, not the 20 MB Images binding
limit.
