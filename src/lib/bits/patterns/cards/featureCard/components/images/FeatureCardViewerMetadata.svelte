<script lang="ts">
import FeatureCardViewerAttribution from './FeatureCardViewerAttribution.svelte'
import FeatureCardViewerIntent from './FeatureCardViewerIntent.svelte'
import type { ImageCtxEnvelope } from '#lib/db/zod/schema/image.types.js'
import type { useImageEditorGalleryModel } from '#lib/adapters/image/index.js'

let {
  currentImage,
  gallery,
}: {
  currentImage: ImageCtxEnvelope
  gallery?: ReturnType<typeof useImageEditorGalleryModel>
} = $props()
</script>

<div
  class="flex select-none flex-row items-end gap-2 overflow-visible caret-transparent"
>
  <FeatureCardViewerAttribution {currentImage} {gallery} />
  <FeatureCardViewerIntent {currentImage} />
</div>
