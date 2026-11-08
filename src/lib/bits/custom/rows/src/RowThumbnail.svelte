<script lang="ts">
import { getURLfromImage } from '#lib/client/services/image.js'
import {
  getRowThumbnailClass,
  rowThumbnailFallbackClass,
  rowThumbnailFallbackTextClass,
  rowThumbnailImageClass,
} from '../row.styles'
import type { RowThumbnailProps } from '../row.types'

let {
  image = null,
  imageSrc,
  imageFallbackSrcs = [],
  imageFallback,
  alt = 'Resource image',
  onClick,
}: RowThumbnailProps = $props()

const resolvedSrc = $derived(
  image
    ? getURLfromImage({
        image: image as never,
        transformation: 'c_fill,h_128,w_128',
      })
    : imageSrc,
)

// Keep the same failure sequence as cards, without retrying identical model URLs.
let failedSources = $state<string[]>([])
const sourceKey = $derived(JSON.stringify([resolvedSrc, ...imageFallbackSrcs]))
$effect(() => {
  sourceKey
  failedSources = []
})
const displayedSrc = $derived(
  [resolvedSrc, ...imageFallbackSrcs].find(
    (src): src is string =>
      typeof src === 'string' && src.length > 0 && !failedSources.includes(src),
  ),
)

/**
 * Advances a failed thumbnail to its next source, ignoring errors from old URLs.
 * @param event Native image failure.
 * @returns Nothing.
 */
function handleImageError(event: Event): void {
  const element = event.currentTarget as HTMLImageElement
  if (!displayedSrc) return
  if (
    element.currentSrc &&
    element.currentSrc !== new URL(displayedSrc, document.baseURI).href
  )
    return
  failedSources = [...failedSources, displayedSrc]
}

function handleClick(event: Event): void {
  if (!onClick) {
    return
  }

  event.preventDefault()
  event.stopPropagation()

  if (image) {
    ;(onClick as (image: unknown) => void)(image)
    return
  }

  ;(onClick as () => void)()
}
</script>

<button
  type="button"
  class={getRowThumbnailClass({ isClickable: !!onClick })}
  onclick={handleClick}
  tabindex="-1"
>
  {#if displayedSrc}
    <!-- Virtual-list overscan must not compete with navigation for image requests. -->
    <img
      src={displayedSrc}
      alt=""
      loading="lazy"
      decoding="async"
      fetchpriority="low"
      class={rowThumbnailImageClass}
      onerror={handleImageError}
    >
  {:else}
    <div class={rowThumbnailFallbackClass}>
      {#if imageFallback}
        {@render imageFallback()}
      {:else}
        <span class={rowThumbnailFallbackTextClass}></span>
      {/if}
    </div>
  {/if}
</button>
