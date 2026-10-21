<script lang="ts">
// I18N
import { getLocaleKey, m } from '#lib/i18n.js'
// DOMAIN
import { captureLabel, imageDateLabel } from '#lib/images/capturePresentation.js'
// TYPES
import type { ImageMetadataBasic } from '#lib/db/zod/schema/image.types.js'
let {
  metadata,
  loading = false,
  imageCredit,
  featureCredit,
  featureCreatedAt,
  imageUploadedAt,
}: {
  metadata: ImageMetadataBasic | null
  loading?: boolean
  imageCredit?: string | null
  featureCredit?: string | null
  featureCreatedAt?: string | null
  imageUploadedAt?: string | null
} = $props()
const locale = $derived(
  getLocaleKey() === 'en'
    ? 'en-HK'
    : getLocaleKey() === 'zhHant'
      ? 'zh-Hant-HK'
      : 'zh-Hans-HK',
)
const captured = $derived(
  metadata?.capture
    ? captureLabel(metadata.capture)
    : imageDateLabel(metadata?.capturedAt, locale),
)
</script>

<section class="space-y-4" aria-label={m.image_attribution_title()}>
  <div class="space-y-2">
    <h3 class="font-semibold">{m.image_attribution_photo()}</h3>
    <dl class="space-y-2 text-sm">
      <div>
        <dt class="text-xs text-muted-foreground">{m.image_attribution_credit()}</dt>
        <dd class="break-words">{imageCredit || metadata?.credit || m.anonymous()}</dd>
      </div>
      <div>
        <dt class="text-xs text-muted-foreground">{m.image_attribution_captured()}</dt>
        <dd>
          {loading
            ? m.image_attribution_loading()
            : captured || m.image_attribution_unknown_date()}
        </dd>
      </div>
      {#if metadata?.credit && imageCredit && metadata.credit !== imageCredit}
        <div>
          <dt class="text-xs text-muted-foreground">
            {m.image_attribution_embedded_credit()}
          </dt>
          <dd class="break-words">{metadata.credit}</dd>
        </div>
      {/if}
      {#if metadata?.cameraModel}
        <div>
          <dt class="text-xs text-muted-foreground">{m.camera()}</dt>
          <dd>{metadata.cameraModel}</dd>
        </div>
      {/if}
      {#if metadata?.originalWidth && metadata?.originalHeight}
        <div>
          <dt class="text-xs text-muted-foreground">
            {m.image__metadata_dimensions()}
          </dt>
          <dd>{metadata.originalWidth} × {metadata.originalHeight}</dd>
        </div>
      {/if}
      {#if imageUploadedAt}
        <div>
          <dt class="text-xs text-muted-foreground">
            {m.image_attribution_uploaded()}
          </dt>
          <dd>{imageDateLabel(imageUploadedAt, locale)}</dd>
        </div>
      {/if}
    </dl>
  </div>
  <div class="space-y-2 border-t border-border pt-4">
    <h3 class="font-semibold">{m.image_attribution_record()}</h3>
    <dl class="space-y-2 text-sm">
      <div>
        <dt class="text-xs text-muted-foreground">
          {m.image_attribution_contributor()}
        </dt>
        <dd class="break-words">{featureCredit || m.anonymous()}</dd>
      </div>
      {#if featureCreatedAt}
        <div>
          <dt class="text-xs text-muted-foreground">
            {m.image_attribution_record_created()}
          </dt>
          <dd>{imageDateLabel(featureCreatedAt, locale)}</dd>
        </div>
      {/if}
    </dl>
  </div>
</section>
