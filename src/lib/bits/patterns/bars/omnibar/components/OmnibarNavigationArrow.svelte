<script lang="ts">
// BITS
import { Icon } from '$lib/bits'
// CONTEXT
import { getAppCtx } from '$lib/context/app.svelte'
import { getOmniCtx } from '$lib/context/omni.svelte'
// ICONS
import ChevronLeft from 'virtual:icons/lucide/chevron-left'
import ChevronRight from 'virtual:icons/lucide/chevron-right'

type Props = {
  direction: 'left' | 'right'
}

const omniCtx = getOmniCtx()
const appCtx = getAppCtx()

let { direction }: Props = $props()

const currentIndex = $derived(
  appCtx.state.active.collection?.items.findIndex(
    item => item.id === appCtx.state.active.feature?.id,
  ) || -1,
)
const isDisabled = $derived(
  direction === 'left'
    ? currentIndex <= 0
    : (appCtx.state.active.collection?.items.length || 0) - 1 <= currentIndex,
)
</script>

<button
  type="button"
  class="group flex h-full w-12 flex-none touch-none items-center justify-center rounded-none bg-black transition-colors duration-300 focus:outline-none {direction === 'right'
    ? 'w-140:rounded-r-md sm:ml-1.5'
    : 'w-140:rounded-l-md sm:mr-1.5'}"
  disabled={isDisabled}
  onclick={() => (direction === 'left' ? omniCtx.navPrevious() : omniCtx.navNext())}
>
  <Icon
    src={direction === 'left' ? ChevronLeft : ChevronRight}
    class="h-5 w-5 transition-opacity duration-200 group-hover:text-neutral-content {isDisabled
      ? 'opacity-50'
      : ''}"
  />
</button>
