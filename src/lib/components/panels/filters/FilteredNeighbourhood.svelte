<script lang="ts">
// I18N
import { getI18nValue, getLocale } from '$lib/i18n';
// DATA
import subNeighbourhoods from '$lib/map/subNeighbourhoods.json';
// CONTEXT
import { getMapContext } from '$lib/context/map.svelte';

const {
  neighbourhood,
  data,
  selectedNeighbourhoods,
  selectedClass = 'bg-emerald-500'
} = $props();

// Initialize map state
const mapContext = getMapContext();

const features = $derived(mapContext.state.resources.feature);

// UTILS

// Count features for each neighbourhood
function getFeatureCount(neighbourhoodKey: string) {
  let count = 0;
  if (neighbourhoodKey in subNeighbourhoods) {
    subNeighbourhoods[neighbourhoodKey as keyof typeof subNeighbourhoods].forEach(
      (n) => {
        count += features.filter(
          (feature) => n === feature.addressProperties?.neighbourhood
        ).length;
      }
    );
  } else {
    count = features.filter(
      (feature) => neighbourhoodKey === feature.addressProperties?.neighbourhood
    ).length;
  }
  return count;
}
</script>

{#if getFeatureCount(neighbourhood) > 0}
  <div
    class="focus:-ring-offset-2 ml-4 flex cursor-pointer flex-row items-center justify-between gap-4 overflow-visible rounded-l-md bg-black py-2 pl-4 pr-[30px] caret-transparent transition-colors duration-200 hover:bg-base-300 focus:bg-base-300 focus:outline-none focus:ring-0"
    onclick={() => {
      mapContext.toggleNeighbourhood(neighbourhood);
      mapContext.zoomToAllVisibleFeatures();
    }}
    onkeydown={(e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        mapContext.toggleNeighbourhood(neighbourhood);
        mapContext.zoomToAllVisibleFeatures();
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
        class="h-2 w-2 rounded-full {selectedNeighbourhoods.includes(neighbourhood)
          ? selectedClass
          : ''}">
      </div>
      <div class="flex flex-grow flex-col">
        <p class="flex space-x-2 font-mono text-xs uppercase tracking-wide">
          <span class="text-primary/80">{getI18nValue(data, 'region')}</span>
          <span class="mtext-base-content/60 font-sans">::</span>
          <span class="text-accent">{getI18nValue(data, 'district')}</span>
        </p>
        <p class="font-normal text-base-content">
          {getLocale() === 'en' ? neighbourhood : getI18nValue(data, 'name')}
        </p>
      </div>
    </div>
    <div class="text-sm text-base-content/60">
      <span
        class="badge flex h-8 w-8 items-center justify-center border-2 border-base-200 bg-transparent font-mono font-bold"
        >{getFeatureCount(neighbourhood)}</span>
    </div>
  </div>
{/if}
