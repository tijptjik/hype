<script lang="ts">
// COMPONENTS
import Image from '#lib/bits/patterns/images/Image.svelte'
// TYPES
import type { IndexCardHeaderProps } from '../indexCard.types'

let { imageSrc, imageFallbackSrcs = [], imageAlt, imageLayout, onImageClick }: IndexCardHeaderProps = $props()
// Keep failures scoped to the current source so a refreshed preview can be tried again.
let failedSources = $state<string[]>([])
$effect(() => {
  imageSrc
  imageFallbackSrcs
  failedSources = []
})
const displayedSrc = $derived(
  [imageSrc, ...imageFallbackSrcs].find(src => !failedSources.includes(src)) ?? null,
)

/** Marks the current candidate as failed and advances to the next cover.
 * @returns Nothing.
 */
function handleImageError(): void {
  if (displayedSrc) failedSources = [...failedSources, displayedSrc]
}
</script>

<div class="bits-index-card__header">
  {#if imageLayout === 'contain' && displayedSrc}
    <img src={displayedSrc} alt="" aria-hidden="true" class="bits-index-card__header-blur">
  {/if}
  <div class="bits-index-card__header-overlay"></div>
  <Image
    src={displayedSrc}
    onError={handleImageError}
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
