<script lang="ts">
// ICONS
import Icon from '$lib/components/common/Icon.svelte'
import { ChevronLeft, ChevronRight } from '@steeze-ui/heroicons'
// CONTEXT
import { getOmniCtx } from '$lib/context/omni.svelte'
import { getAppCtx } from '$lib/context/app.svelte'

// CONTEXT
const omniCtx = getOmniCtx()
const appCtx = getAppCtx()

// PROPS
type Props = {
  direction: 'left' | 'right'
}

let { direction }: Props = $props()
let currentIndex = $derived(
  appCtx.state.active.collection?.items.findIndex(
    item => item.id === appCtx.state.active.feature?.id,
  ) || -1,
)
</script>

<button
  class="group flex h-full w-12 flex-none touch-none items-center justify-center
    rounded-none bg-black transition-colors duration-300 focus:outline-none
    {direction === 'right' ? 'w-140:rounded-r-md ml-1.5' : 'w-140:rounded-l-md mr-1.5'}"
  disabled={direction === 'left'
    ? currentIndex <= 0
    : (appCtx.state.active.collection?.items.length || 0) - 1 <= currentIndex}
  onclick={() => (direction === 'left' ? omniCtx.navPrevious() : omniCtx.navNext())}
>
  <Icon
    src={direction === 'left' ? ChevronLeft : ChevronRight}
    class="h-5 w-5 group-hover:text-neutral-content {(
      direction === 'left'
        ? currentIndex <= 0
        : (appCtx.state.active.collection?.items.length || 0) - 1 <= currentIndex
    )
      ? 'opacity-50'
      : ''} transition-opacity duration-200"
  />
</button>
