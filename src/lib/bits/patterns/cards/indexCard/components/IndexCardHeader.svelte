<script lang="ts">
// COMPONENTS
import Image from '$lib/bits/patterns/images/Image.svelte'
// TYPES
import type { IndexCardHeaderProps } from '../indexCard.types'

let { imageSrc, imageAlt, imageLayout, onImageClick }: IndexCardHeaderProps = $props()
</script>

<div class="bits-index-card__header" onclick={onImageClick}>
  {#if imageLayout === 'contain'}
    <img src={imageSrc} alt="" aria-hidden="true" class="bits-index-card__header-blur">
  {/if}
  <div class="bits-index-card__header-overlay"></div>
  <Image
    src={imageSrc}
    alt={imageAlt}
    class="bits-index-card__header-image"
    fit={imageLayout === 'cover' ? 'cover' : 'fit'}
  />
</div>
