<script lang="ts">
import { getURLfromImage } from '$lib/client/services/image'
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
  alt = 'Resource image',
  onClick,
}: RowThumbnailProps = $props()

const resolvedSrc = $derived(
  image
    ? getURLfromImage({
        image: image as never,
        transformation: 'c_fill,h_128,w_128,q_auto',
      })
    : imageSrc,
)

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

<div
  class={getRowThumbnailClass({ isClickable: !!onClick })}
  onclick={handleClick}
  tabindex="-1"
  role="button"
>
  {#if resolvedSrc}
    <img src={resolvedSrc} alt class={rowThumbnailImageClass}>
  {:else}
    <div class={rowThumbnailFallbackClass}>
      <span class={rowThumbnailFallbackTextClass}></span>
    </div>
  {/if}
</div>
