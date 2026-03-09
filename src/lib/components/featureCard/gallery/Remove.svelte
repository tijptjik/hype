<script lang="ts">
// CONTEXT
import { getImageCtx } from '$lib/context/image.svelte'
// COMPONENTS
import Icon from '$lib/components/common/Icon.svelte'
import { Trash } from '@steeze-ui/heroicons'
// TYPES
import type { ImageCtxEnvelope } from '$lib/db/zod/schema/image.types'

// PROPS
let { currentImage }: { currentImage: ImageCtxEnvelope } = $props()

// CONTEXT
const imageCtx = getImageCtx()
</script>

<div
  class="flex h-10 w-10 cursor-pointer select-none flex-row items-center justify-center gap-2 overflow-visible rounded-full bg-black/50 px-2 py-1 font-mono text-xs text-white caret-transparent"
  onclick={() => imageCtx.unstageImage(currentImage.image.id)}
>
  <Icon src={Trash} class="h-5 w-5" />
</div>
