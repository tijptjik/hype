<script lang="ts">
import type { MapStyleCardPreviewProps } from '../mapStyleCard.types'

let {
  image = null,
  alt = null,
  class: className = '',
}: MapStyleCardPreviewProps = $props()
</script>

<div class={`bits-map-style-card__preview ${className}`}>
  {#if image}
    <img
      src={image}
      alt={alt ?? ''}
      class="bits-map-style-card__preview-image"
      loading="lazy"
    >
  {:else}
    <div class="bits-map-style-card__preview-fallback">{alt?.charAt(0) ?? '?'}</div>
  {/if}
</div>
