<script lang="ts">
// CONTEXT
import { getSurfaceCtx } from '#lib/context/resourceView.svelte.js'
// COMPONENTS
import FeatureCardViewerAttribution from './FeatureCardViewerAttribution.svelte'
import FeatureCardViewerIntent from './FeatureCardViewerIntent.svelte'
// TYPES
import type { ImageCtxEnvelope } from '#lib/db/zod/schema/image.types.js'
import type { useImageEditorGalleryModel } from '#lib/adapters/image/index.js'

const surface = getSurfaceCtx()

let {
  currentImage,
  gallery,
  overlayTarget,
  onHeightChange,
}: {
  overlayTarget?: HTMLElement | null
  onHeightChange?: (height: number) => void
  currentImage: ImageCtxEnvelope
  gallery?: ReturnType<typeof useImageEditorGalleryModel>
} = $props()
</script>

<div
  class="flex flex-row items-end gap-2 overflow-visible caret-transparent select-none"
>
  <FeatureCardViewerAttribution {currentImage} {gallery} {overlayTarget} {onHeightChange} />
  {#if surface.isAdmin()}
    <FeatureCardViewerIntent {currentImage} />
  {/if}
</div>
