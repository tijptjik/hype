<script lang="ts">
// SVELTE
import { swipe } from 'svelte-gestures';
// CONTEXT
import { getAppCtx } from '$lib/context/app.svelte';
import { getOmniCtx } from '$lib/context/omni.svelte';
// TYPES
import type { SwipeCustomEvent } from 'svelte-gestures';

let { children }: { children: any } = $props();

// CONTEXT
const appCtx = getAppCtx();
const omniCtx = getOmniCtx();

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
</script>

<div
  class="flex-grow-1 flex-shrink-4 flex min-h-0 w-full flex-col overflow-y-auto overflow-x-visible"
  use:swipe={() => ({ timeframe: 300, minSwipeDistance: 60, touchAction: 'pan-y' })}
  onswipe={handleSwipe}>
  {@render children()}
</div>
