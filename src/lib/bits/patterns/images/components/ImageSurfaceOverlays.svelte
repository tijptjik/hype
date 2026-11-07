<script lang="ts">
import { errorOverlayClass } from './imageSurface.styles'
import ImageSkeleton from './ImageSkeleton.svelte'

let {
  showSkeleton = false,
  hasLoaded = false,
  hasError = false,
}: {
  showSkeleton?: boolean
  hasLoaded?: boolean
  hasError?: boolean
} = $props()
</script>

{#if showSkeleton && !hasLoaded && !hasError}
  <ImageSkeleton />
{/if}

{#if hasError}
  <div class={errorOverlayClass()}></div>
{/if}
