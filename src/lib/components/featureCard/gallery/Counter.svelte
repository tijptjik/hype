<script lang="ts">
import type { Image } from '$lib/types';

let { images, currentImage }: { images: Image[]; currentImage: Image } = $props();
</script>

<!-- Image counter - only show if more than one image -->
{#if images.length > 1}
  <div
    class="absolute bottom-2 right-2 z-10 whitespace-nowrap rounded bg-black/50 px-2 py-1 text-xs text-white">
    {currentImage ? images.findIndex((img) => img.id === currentImage?.id) + 1 : 0} / {images.length}
  </div>
{/if}
