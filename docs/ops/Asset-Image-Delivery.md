# Asset Image Delivery Operations

## Table of Contents

- [Steady-State Delivery](#steady-state-delivery)
- [Memory Fallbacks](#memory-fallbacks)
  - [First: Cloudflare Images Cache-Miss Fallback](#first-cloudflare-images-cache-miss-fallback)
  - [Second: Tail-Worker OOM Repair](#second-tail-worker-oom-repair)
  - [Third: Targeted Large-Source Repair](#third-targeted-large-source-repair)
- [Backfill And Cutover](#backfill-and-cutover)
- [Production Configuration](#production-configuration)
- [Deployment Order](#deployment-order)

## Steady-State Delivery

The asset service serves immutable, versioned derivatives from the production
derived R2 bucket. Raw working objects are normalized to a maximum dimension of
2048 pixels, and canonical `webp` and `jpeg` derivatives are pre-rendered.

Normal delivery should be a derived-cache hit. The fallbacks below exist to
protect cache misses during a migration and unusual source images; they are not
the standard delivery path.

## Memory Fallbacks

```text
derived R2 hit
    ↓ miss
first fallback: Cloudflare Images on a safe cache miss
    ↓ unexpected Worker exceededMemory outcome
second fallback: Tail Worker repairs the derived object; client retries

source above the 20 MB Images input limit
    ↓
third fallback: operator normalizes that one source locally, then rewarms it
```

### First: Cloudflare Images Cache-Miss Fallback

The production asset service enables `ENABLE_CLOUDFLARE_IMAGES_FALLBACK`. On a
cache miss, it delegates the transform to the Cloudflare Images binding only
when all of the following are true:

- the source is JPEG, PNG, or WebP with readable compressed-header dimensions;
- it exceeds 2,000,000 pixels;
- its compressed size is at most 20 MB; and
- the requested output is JPEG, PNG, WebP, or AVIF.

The resulting object is written to the usual derived R2 bucket. It is therefore
billed once per derived cache miss and becomes an ordinary immutable R2 hit
afterward. Local and preview environments keep this fallback disabled.

### Second: Tail-Worker OOM Repair

`workers/asset-memory-repair` tails `hype-asset-service-prod`. For a GET or
HEAD transform that ends with the Worker `exceededMemory` outcome, it recreates
the exact missing derivative with the Images binding. The original failed
request cannot be recovered; the next request receives the derived R2 hit.

The repair worker accepts only `assets.hype.hk` requests for owned `h/` public
IDs, supported source formats, and inputs at most 20 MB. A Durable Object locks
each derived key, preventing duplicate Images transformations for the same
burst of failures. It never logs an unredacted request URL.

### Third: Targeted Large-Source Repair

For a source above the 20 MB Images binding limit—including a 100 MB+ image—run
the targeted local Sharp helper. It is deliberately an operator action: it
fetches only the named public ID and changes R2 only after local normalization
succeeds. Its effective limit is the operator machine's available disk and
memory, rather than the Images binding input limit.

```bash
bun run r2:resize:raw --stage production \
  --key h/organisations/example/image-id \
  --max-dimension 2048 \
  --concurrency 1
```

For TIFF, the helper retains the original at `<public-id>.raw`, writes a JPEG
working object at `<public-id>`, and updates metadata sidecars. Rewarm the
repaired asset after the replacement:

```bash
bun run render:assets \
  --db-stage production --db-remote \
  --r2-stage production --r2-remote \
  --raw-key h/organisations/example/image-id \
  --concurrency 1 --variant-delay-ms 1000
```

To inspect the output before writing to R2, use
`r2:normalize:raw --mode prepare` with the same key instead.

## Backfill And Cutover

After a raw backfill changes working source images, do not enable production
auto-transform miss blocking until the derived cache has been refreshed:

1. Normalize the target raw objects.
2. Purge stale derived objects only; never purge the raw bucket.
3. Re-render the canonical `webp` and `jpeg` derivatives.
4. Validate derived coverage for both formats.
5. Only then set `BLOCK_PRODUCTION_AUTO_TRANSFORM_MISS = "1"` if strict
   pre-render-only delivery is required.

With the block enabled, a production `f_auto` miss is a `404`; it will not
generate an ad hoc derivative. Set the flag back to `"0"` to restore the
on-demand fallback while investigating missing coverage.

## Production Configuration

`workers/asset-service/wrangler.toml` currently configures production as:

| Setting | Value | Effect |
| --- | --- | --- |
| `ENABLE_CLOUDFLARE_IMAGES_FALLBACK` | `"1"` | Enables the first fallback. |
| `BLOCK_PRODUCTION_AUTO_TRANSFORM_MISS` | `"0"` | Allows on-demand misses while coverage is not being strictly enforced. |

## Deployment Order

Deploy the Tail Worker before the asset service so its configured Tail consumer
already exists:

```bash
bun run deploy:asset-memory-repair:prod
bun run deploy:asset-service:prod
```

For the original rollout steps and rationale, see
[`docs/archive/Image-Derivative-Rollout.md`](../archive/Image-Derivative-Rollout.md).
