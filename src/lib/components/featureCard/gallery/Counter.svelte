<script lang="ts">
import type { ImageCtxEnvelope } from '$lib/db/zod/schema/image.types'

let {
  images,
  currentImage,
}: { images: ImageCtxEnvelope[]; currentImage: ImageCtxEnvelope } = $props()
</script>

<!-- Image counter - only show if more than one image -->
{#if images.length > 1}
  <div
    class="absolute bottom-2 right-2 z-10 whitespace-nowrap rounded bg-black/50 px-2 py-1 text-xs text-white"
  >
    {currentImage
      ? images.findIndex((img) => img.image.id === currentImage?.image.id) + 1
      : 0}
    / {images.length}
  </div>
{/if}
