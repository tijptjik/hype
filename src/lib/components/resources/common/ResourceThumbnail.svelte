<script lang="ts">
import { getURLfromImage } from '$lib/client/services/image'
import type {
  ImageContextEnvelope,
  ImageCtxEnvelope,
} from '$lib/db/zod/schema/image.types'

let {
  image = null,
  alt = 'Resource image',
  onClick,
}: {
  image?: ImageContextEnvelope | ImageCtxEnvelope | null
  alt?: string
  onClick?: (image: ImageContextEnvelope | ImageCtxEnvelope) => void
} = $props()

function handleClick(e: Event) {
  e.preventDefault()
  e.stopPropagation()
  if (image && onClick) onClick(image)
}
</script>

<div
  class="relative h-16 w-16 flex-shrink-0 cursor-pointer"
  onclick={handleClick}
  tabindex="-1"
  role="button"
>
  {#if image}
    <img
      src={getURLfromImage({
        image: image,
        transformation: 'c_fill,w_100,h_100,q_auto'
      })}
      {alt}
      class="h-full w-full rounded-md object-cover text-transparent"
    >
  {:else}
    <div class="flex h-full w-full items-center justify-center rounded-md bg-base-200">
      <span class="text-xs text-base-content/60"></span>
    </div>
  {/if}
</div>
