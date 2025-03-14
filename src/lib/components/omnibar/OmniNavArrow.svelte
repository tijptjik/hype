<script lang="ts">
// ICONS
import Icon from '$lib/components/common/Icon.svelte';
import { ChevronLeft, ChevronRight } from '@steeze-ui/heroicons';
// CONTEXT
import { getOmniContext } from '$lib/context/omni.svelte';
import { getMapContext } from '$lib/context/map.svelte';

// CONTEXT
const omniContext = getOmniContext();
const mapContext = getMapContext();

// PROPS
type Props = {
  direction: 'left' | 'right';
};

let { direction }: Props = $props();
let currentIndex = $derived(
  mapContext.state.active.collection?.items.findIndex(
    (item) => item.id === mapContext.state.active.feature?.id
  ) || -1
);
</script>

<button
  class="btn btn-ghost btn-sm flex h-auto flex-grow items-center justify-center px-1 hover:bg-base-200 {direction ===
  'right'
    ? 'rounded-l-none rounded-r-md'
    : 'rounded-l-md rounded-r-none'} active:transform-none active:bg-base-200 active:opacity-90"
  disabled={direction === 'left'
    ? currentIndex <= 0
    : mapContext.state.active.collection!.items.length - 1 <= currentIndex}
  onclick={() =>
    direction === 'left' ? mapContext.navPrevious() : mapContext.navNext()}>
  <Icon
    src={direction === 'left' ? ChevronLeft : ChevronRight}
    class="h-5 w-5 {(direction === 'left'
    ? currentIndex <= 0
    : mapContext.state.active.collection!.items.length - 1 <= currentIndex) ? 'opacity-50' : ''} transition-opacity duration-200" />
</button>
