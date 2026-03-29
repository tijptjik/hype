<script lang="ts">
import { errorOverlayClass } from './imageSurface.styles'

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

{#if showSkeleton && !hasLoaded}
  <div class="gallery-skeleton absolute inset-0"></div>
{/if}

{#if hasError}
  <div class={errorOverlayClass()}></div>
{/if}
