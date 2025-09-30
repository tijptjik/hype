<script lang="ts">
// SVELTE
import { slide } from 'svelte/transition';
// CONTEXT
import { getAppCtx } from '$lib/context/app.svelte';
// SERVICES
import {
  addIsochroneToMap,
  removeIsochroneFromMap,
  toggleIsochroneVisibility,
  setupIsochroneMarkerUpdates,
  updateMarkerStylesForIsochrone
} from '$lib/map/isochrone';
// PROPS
let { title }: { title: string } = $props();

// CONTEXT
const appCtx = getAppCtx();

// STATE
let isActive = $state(false);

// FUNCTIONS
const handleToggle = async (e: MouseEvent | KeyboardEvent) => {
  e.stopPropagation();
  isActive = !isActive;
  console.log('🔍 XXX FilteredAnalysis toggled:', isActive);

  // Handle isochrone display based on active state
  if (appCtx.map) {
    if (isActive) {
      // Add isochrone data to map
      await addIsochroneToMap(appCtx.map);
      // Set up marker updates for isochrone
      setupIsochroneMarkerUpdates(appCtx.map, appCtx);
      // Update existing markers
      updateMarkerStylesForIsochrone(appCtx.map, appCtx);
    } else {
      // Remove isochrone data from map
      removeIsochroneFromMap(appCtx.map);
      // Reset all markers to default style
      updateMarkerStylesForIsochrone(appCtx.map, appCtx);
    }
  }
};
</script>

<div
  class="group flex cursor-pointer flex-row items-center justify-between gap-4 bg-black py-2 pl-8 pr-4 text-base-content caret-transparent transition-colors duration-200 focus:outline-none focus:ring-0"
  in:slide={{ axis: 'y', duration: 200 }}
  out:slide={{ axis: 'y', duration: 200 }}
  onclick={handleToggle}
  onkeydown={(e) => {
    if (e.key === 'Enter' || e.key === ' ') {
      handleToggle(e);
    }
  }}
  tabindex="0">
  <div class="group flex -translate-x-5 flex-row items-center gap-3">
    <div
      class="h-2 w-2 rounded-full group-hover:{isActive
        ? 'bg-accent/80'
        : 'bg-base-content/30'} group-focus-visible:{isActive
        ? 'bg-accent/80'
        : 'bg-base-content/30'}
      {isActive ? 'bg-accent' : ''}">
    </div>
    <div class="flex flex-col items-start gap-0">
      <p
        class="whitespace-nowrap font-light {isActive
          ? 'text-accent'
          : 'text-base-content/80'}">
        {title}
      </p>
    </div>
  </div>
</div>
