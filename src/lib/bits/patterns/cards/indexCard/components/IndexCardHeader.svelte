<script lang="ts">
// COMPONENTS
import Image from '$lib/bits/patterns/images/Image.svelte'
// TYPES
import type { IndexCardHeaderProps } from '../indexCard.types'

let { imageSrc, imageAlt, imageLayout, onImageClick }: IndexCardHeaderProps = $props()
</script>

<div class="bits-index-card__header">
  {#if imageLayout === 'contain'}
    <img src={imageSrc} alt="" aria-hidden="true" class="bits-index-card__header-blur">
  {/if}
  <div class="bits-index-card__header-overlay"></div>
  <Image
    src={imageSrc}
    alt={imageAlt}
    class="bits-index-card__header-image"
    fit={imageLayout === 'cover' ? 'cover' : 'fit'}
    rounded="rounded-t-2xl rounded-b-none"
    showBackdrop={false}
    enableSourceTransition={false}
    revealOnLoad={true}
  />
  {#if onImageClick}
    <button
      type="button"
      class="absolute inset-0 z-2 cursor-pointer appearance-none border-0 bg-transparent p-0"
      aria-label={imageAlt || 'Open image'}
      onclick={onImageClick}
    ></button>
  {/if}
</div>
