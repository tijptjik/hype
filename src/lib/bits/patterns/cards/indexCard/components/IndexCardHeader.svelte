<script lang="ts">
// COMPONENTS
import Image from '#lib/bits/patterns/images/Image.svelte'
import ImageBackdrop from '#lib/bits/patterns/images/components/ImageBackdrop.svelte'
// TYPES
import type { IndexCardHeaderProps } from '../indexCard.types'

let {
  imageSrc,
  imageFallbackSrcs = [],
  imageBackground,
  imageInset = false,
  imageAlt,
  imageLayout,
  onImageClick,
}: IndexCardHeaderProps = $props()
// Keep failures scoped to the current source so a changed preview can be tried again.
let failedSources = $state<string[]>([])
// Compare URLs rather than array identity when a parent rebuilds the same card model.
const sourceKey = $derived(JSON.stringify([imageSrc, ...imageFallbackSrcs]))
$effect(() => {
  sourceKey
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

<div
  class="bits-index-card__header"
  style:background-color={imageBackground}
  data-solid-image-background={imageBackground || undefined}
>
  {#if imageLayout === 'contain' && displayedSrc && !imageBackground}
    <ImageBackdrop src={displayedSrc} blurClass="bits-index-card__header-blur" />
  {/if}
  {#if imageLayout !== 'cast-edges' && !imageBackground}
    <div class="bits-index-card__header-overlay"></div>
  {/if}
  <div
    class="absolute inset-0 box-border"
    style:padding={imageInset ? '3%' : undefined}
  >
    <Image
      src={displayedSrc}
      onError={handleImageError}
      alt={imageAlt}
      class="bits-index-card__header-image"
      fit={imageLayout === 'cover' ? 'cover' : 'fit'}
      presentationMode={imageLayout}
      rounded={imageInset ? 'rounded-none' : 'rounded-t-2xl rounded-b-none'}
      transparentBackground={imageInset || Boolean(imageBackground)}
      showBackdrop={imageLayout === 'cast-edges' && !imageBackground}
      enableSourceTransition={false}
      revealOnLoad={true}
    />
  </div>
  {#if onImageClick}
    <button
      type="button"
      class="absolute inset-0 z-2 cursor-pointer appearance-none border-0 bg-transparent p-0"
      aria-label={imageAlt || 'Open image'}
      onclick={onImageClick}
    ></button>
  {/if}
</div>
