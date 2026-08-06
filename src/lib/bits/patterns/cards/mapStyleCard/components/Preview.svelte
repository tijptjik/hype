<script lang="ts">
import type { MapStyleCardPreviewProps } from '../mapStyleCard.types'

let {
  image = null,
  alt = null,
  class: className = '',
}: MapStyleCardPreviewProps = $props()

let imageFailed = $state(false)
let lastImage = $state<string | null>(null)

$effect(() => {
  if (image === lastImage) return

  lastImage = image
  imageFailed = false
})
</script>

<div class={`bits-map-style-card__preview ${className}`}>
  {#if image && !imageFailed}
    <img
      src={image}
      alt={alt ?? ''}
      class="bits-map-style-card__preview-image"
      loading="lazy"
      onerror={() => {
        imageFailed = true
      }}
    >
  {:else}
    <div class="bits-map-style-card__preview-fallback">{alt?.charAt(0) ?? '?'}</div>
  {/if}
</div>
