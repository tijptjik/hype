<script lang="ts">
// ICONS
import Icon from '$lib/components/common/Icon.svelte';
import { ChevronLeft, ChevronRight } from '@steeze-ui/heroicons';
// CONTEXT
import { getOmniContext } from '$lib/context/omni.svelte';
import { getMapContext } from '$lib/context/map.svelte';

// CONTEXT
const omniCtx = getOmniContext();
const mapCtx = getMapContext();

// PROPS
type Props = {
  direction: 'left' | 'right';
};

let { direction }: Props = $props();
let currentIndex = $derived(
  mapCtx.state.active.collection?.items.findIndex(
    (item) => item.id === mapCtx.state.active.feature?.id
  ) || -1
);
</script>

<button
  class="group flex h-full w-12 flex-none touch-none items-center justify-center
    rounded-none bg-black transition-colors duration-300 focus:outline-none
    {direction === 'right' ? 'w-140:rounded-r-md ml-1.5' : 'w-140:rounded-l-md mr-1.5'}"
  disabled={direction === 'left'
    ? currentIndex <= 0
    : mapCtx.state.active.collection!.items.length - 1 <= currentIndex}
  onclick={() =>
    direction === 'left'
      ? mapCtx.navPrevious({ isCardOpen: omniCtx.state.isCardOpen })
      : mapCtx.navNext({ isCardOpen: omniCtx.state.isCardOpen })}>
  <Icon
    src={direction === 'left' ? ChevronLeft : ChevronRight}
    class="h-5 w-5 group-hover:text-neutral-content {(
      direction === 'left'
        ? currentIndex <= 0
        : mapCtx.state.active.collection!.items.length - 1 <= currentIndex
    )
      ? 'opacity-50'
      : ''} transition-opacity duration-200" />
</button>
