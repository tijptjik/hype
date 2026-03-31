## Image Derivative Rollout

This rollout standardizes image ingestion and delivery around a bounded raw size
 plus two explicit derived formats:

- raw uploads normalized to a maximum dimension of `2048`
- derived delivery formats limited to `webp` and `jpeg`
- production `f_auto` requests allowed to serve existing derived objects only

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

### 6. Deploy The Production Worker Cutover

Deploy the asset worker with:

- `BLOCK_PRODUCTION_AUTO_TRANSFORM_MISS = "1"`

That setting is now configured in `workers/asset-service/wrangler.toml` for the
production environment. Once deployed:

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
