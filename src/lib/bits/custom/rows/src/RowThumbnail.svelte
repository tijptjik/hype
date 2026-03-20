<script lang="ts">
import { getURLfromImage } from '$lib/client/services/image'
import type { RowThumbnailProps } from '../row.types'

let { image = null, alt = 'Resource image', onClick }: RowThumbnailProps = $props()

function handleClick(event: Event): void {
  event.preventDefault()
  event.stopPropagation()
  if (image && onClick) onClick(image)
}
</script>

<div
  class="relative h-16 w-16 shrink-0 cursor-pointer"
  onclick={handleClick}
  tabindex="-1"
  role="button"
>
  {#if image}
    <img
      src={getURLfromImage({
        image: image as never,
        transformation: 'c_fill,w_100,h_100,q_auto',
      })}
      alt
      class="h-full w-full rounded-md object-cover text-transparent"
    >
  {:else}
    <div class="flex h-full w-full items-center justify-center rounded-md bg-base-200">
      <span class="text-xs text-base-content/60"></span>
    </div>
  {/if}
</div>
