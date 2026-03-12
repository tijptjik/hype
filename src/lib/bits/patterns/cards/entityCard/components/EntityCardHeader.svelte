<script lang="ts">
// COMPONENTS
import Image from '$lib/components/common/Image.svelte'
// TYPES
import type { EntityCardHeaderProps } from '../entityCard.types'

let { imageSrc, imageAlt, imageLayout, onImageClick }: EntityCardHeaderProps = $props()
</script>

<div class="bits-entity-card__header" onclick={onImageClick}>
  {#if imageLayout === 'contain'}
    <img src={imageSrc} alt="" aria-hidden="true" class="bits-entity-card__header-blur">
  {/if}
  <div class="bits-entity-card__header-overlay"></div>
  <Image
    src={imageSrc}
    alt={imageAlt}
    class="bits-entity-card__header-image"
    layout={imageLayout}
  />
</div>
