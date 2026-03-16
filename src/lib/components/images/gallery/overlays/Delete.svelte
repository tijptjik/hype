<script lang="ts">
import { fade } from 'svelte/transition'
import Icon from '$lib/components/common/Icon.svelte'
import Trash from 'virtual:icons/lucide/trash-2'
import type { ImageCtxEnvelope } from '$lib/db/zod/schema/image.types'
// SERVICES
import { getImageCtx } from '$lib/context/image.svelte'

type Props = {
  image: ImageCtxEnvelope
}

let { image }: Props = $props()

const imageCtx = getImageCtx()
</script>

<div
  class="absolute inset-0 z-40 flex items-center justify-center rounded-lg bg-glass-result/70 backdrop-blur-sm"
  transition:fade={{ duration: 200 }}
>
  <button
    type="button"
    aria-label="Delete image"
    class="btn btn-circle bg-glass-rejected hover:bg-glass-rejected/80"
    onclick={(e) => {
      imageCtx.handlePreDelete(e, image);
    }}
  >
    <Icon src={Trash} class="h-6 w-6 stroke-[2px] text-glass-result" />
  </button>
</div>
