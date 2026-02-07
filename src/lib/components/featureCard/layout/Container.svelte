<script lang="ts">
// SVELTE
import { useSwipe } from 'svelte-gestures';
// CONTEXT
import { getAppCtx } from '$lib/context/app.svelte';
import { getOmniCtx } from '$lib/context/omni.svelte';
// COMPONENTS
import Scrollbar from '$lib/components/layout/Svrollbar.svelte';
// TYPES
import type { SwipeCustomEvent } from 'svelte-gestures';

let { children, viewport = $bindable() }: { children: any; viewport?: HTMLElement } =
  $props();

// CONTEXT
const appCtx = getAppCtx();
const omniCtx = getOmniCtx();

// ELEMENTS
let contents: HTMLElement = $state()!;

// Navigation state - check if navigation is possible
let canNavigatePrevious = $derived(() => {
  const currentIndex =
    appCtx.state.active.collection?.items.findIndex(
      (item) => item.id === appCtx.state.active.feature?.id
    ) || -1;
  return currentIndex > 0;
});

let canNavigateNext = $derived(() => {
  const currentIndex =
    appCtx.state.active.collection?.items.findIndex(
      (item) => item.id === appCtx.state.active.feature?.id
    ) || -1;
  const totalItems = appCtx.state.active.collection?.items.length || 0;
  return currentIndex < totalItems - 1;
});

// Swipe gesture handler
function handleSwipe(e: SwipeCustomEvent) {
  // Ignore swipe if target has the id 'photo-carousel'
  const target = e.detail.target as HTMLElement;
  if (target && target.id === 'photo-carousel') {
    return;
  }
  const { direction } = e.detail;

  if (direction === 'left' && canNavigateNext()) {
    omniCtx.navNext();
  } else if (direction === 'right' && canNavigatePrevious()) {
    omniCtx.navPrevious();
  }
}

// GESTURE HOOKS
const { swipe: swipeAttach, onswipe } = useSwipe(
  handleSwipe,
  () => ({ timeframe: 300, minSwipeDistance: 60, touchAction: 'pan-y' }),
  undefined,
  true
);

// Handle container scroll end and dispatch custom event
function handleContainerScrollEnd() {
  // Dispatch custom event that bubbles up
  const scrollEvent = new CustomEvent('containerscrollend', {
    bubbles: true,
    detail: {
      scrollTop: viewport?.scrollTop || 0,
      scrollHeight: viewport?.scrollHeight || 0,
      clientHeight: viewport?.clientHeight || 0
    }
  });
  viewport?.dispatchEvent(scrollEvent);
}
</script>

<div
  class="relative flex h-full min-h-0 w-full flex-1 select-none flex-col overscroll-contain caret-transparent">
  <div
    bind:this={viewport}
    class="h-full overflow-y-auto overflow-x-visible overscroll-contain"
    {@attach swipeAttach}
    {onswipe}
    onscrollend={handleContainerScrollEnd}>
    <div
      bind:this={contents}
      class="flex h-full w-full flex-col items-stretch overscroll-contain">
      {@render children()}
    </div>
  </div>
  <Scrollbar
    {viewport}
    {contents}
    alwaysVisible={false}
    margin={{ right: 4, top: 6, bottom: 4 }}
    width={{ track: 6, thumb: 4, thumbActive: 6 }}
    opacity={{ track: 0.3, thumb: 0.6, thumbActive: 0.8 }} />
</div>
