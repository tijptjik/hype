<script lang="ts">
// TRANSITIONS
import { slide } from 'svelte/transition';
// I18N
import { getI18n } from '$lib/i18n';
// CONTEXT
import { getAppCtx } from '$lib/context/app.svelte';
import { getOmniCtx } from '$lib/context/omni.svelte';
import { OmniMode } from '$lib/enums';

const {
  neighbourhoodRef,
  i18n,
  selectedNeighbourhoodRefs,
  selectedClass = 'bg-emerald-500'
} = $props();

// Initialize map state
const appCtx = getAppCtx();
const omniCtx = getOmniCtx();

// DERIVED
let featureCount = $derived(
  appCtx.placeCtx.neighbourhoodFeatureCounts.get(neighbourhoodRef) || 0
);

// INTERACTIONS
let handleToggle = () => {
  appCtx.placeCtx.toggleNeighbourhood(neighbourhoodRef);
  appCtx.refreshFeatures();
  appCtx.zoomToAllVisibleFeatures();
  omniCtx.setMode(OmniMode.search);
};

// DISPLAY TEXT
let regionDisplay = $derived(
  getI18n(i18n, 'region', appCtx.getUserPreferences(), undefined, true).replace(
    'Hong Kong',
    'HK'
  )
);

let districtDisplay = $derived(
  getI18n(i18n, 'district', appCtx.getUserPreferences(), undefined, true)
);

let neighbourhoodDisplay = $derived(
  getI18n(i18n, 'name', appCtx.getUserPreferences(), undefined, true)
);
</script>

{#if featureCount > 0}
  <div
    class="focus:-ring-offset-2 group ml-4 flex cursor-pointer flex-row items-center justify-between gap-4 overflow-visible rounded-l-md bg-black py-2 pl-4 pr-[30px] caret-transparent transition-colors duration-200 focus:outline-none focus:ring-0"
    onclick={handleToggle}
    onkeydown={(e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        handleToggle();
        e.preventDefault();
      } else if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        // Find the nearest section ancestor and focus its input
        const section = e.currentTarget.closest('section');
        const input = section?.querySelector('input');
        input?.focus();
      }
    }}
    tabindex="0">
    <div class="flex -translate-x-5 flex-row items-center gap-3">
      <div
        class="h-2 w-2 rounded-full group-hover:bg-base-content/30 group-focus-visible:bg-base-content/30
        {selectedNeighbourhoodRefs.includes(neighbourhoodRef)
          ? `group-hover:bg-emerald-500/75 group-focus-visible:bg-emerald-500/75 ${selectedClass}`
          : ''}">
      </div>
      <div class="flex flex-grow flex-col">
        <p class="flex space-x-2 font-mono text-xs uppercase tracking-wide">
          <span class="text-primary/80">{districtDisplay}</span>
          <span class="mtext-base-content/60 font-sans">::</span>
          <span class="text-accent">{regionDisplay}</span>
        </p>
        <p class="font-normal text-base-content">
          {neighbourhoodDisplay}
        </p>
      </div>
    </div>
    <div class="text-sm text-base-content/60">
      <span
        class="badge flex h-8 w-8 items-center justify-center border-2 border-base-200 bg-transparent font-mono font-bold"
        >{featureCount}</span>
    </div>
  </div>
{/if}
