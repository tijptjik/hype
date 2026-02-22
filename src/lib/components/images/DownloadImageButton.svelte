<script lang="ts">
import Icon from '$lib/components/common/Icon.svelte'
import { CloudArrowDown } from '@steeze-ui/heroicons'
// SERVICES
import { getImageCtx } from '$lib/context/image.svelte'
// TYPES
import type { ImageCtxEnvelope } from '$lib/types'

type Props = {
  image: ImageCtxEnvelope
  class?: string
}

let { image, class: className = '' } = $props()

// SERVICES
const imageCtx = getImageCtx()

function stopEvent(e: MouseEvent | PointerEvent): void {
  e.preventDefault()
  e.stopPropagation()
}

function handleClick(e: MouseEvent): void {
  stopEvent(e)
  void imageCtx.downloadImage(e, image)
}
</script>

<button
  class="btn btn-circle border-none bg-glass-result opacity-70 hover:bg-glass-result/100 hover:shadow-sm {className}"
  onpointerdown={stopEvent}
  onclick={handleClick}
>
  <Icon src={CloudArrowDown} class="h-6 w-6 stroke-[2px]" />
</button>
