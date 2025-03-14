<script lang="ts">
// I18N
import { languageTag } from '$lib/paraglide/runtime';
import { getI18nValue } from '$lib/i18n';
// DATA
import subNeighbourhoods from '$lib/map/subNeighbourhoods.json';
// CONTEXT
import { getMapContext } from '$lib/context/map.svelte';

const { neighbourhood, data, selectedNeighbourhoods } = $props();

// Initialize map state
const mapContext = getMapContext();

const features = $derived(mapContext.state.resources.features);

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

<div
  class="flex min-h-11 w-full cursor-pointer flex-row items-center gap-4 bg-black py-2 pl-8 pr-4 transition-colors duration-200 hover:bg-base-300"
  class:border-l-4={selectedNeighbourhoods.includes(neighbourhood)}
  class:border-emerald-500={selectedNeighbourhoods.includes(neighbourhood)}
  onclick={() => mapContext.toggleNeighbourhood(neighbourhood)}>
  <div class="flex flex-grow flex-col">
    <p class="flex space-x-2 text-xs font-mono uppercase tracking-wide">
      <span class="text-primary/80">{getI18nValue(data, 'region')}</span>
      <span class="mtext-base-content/60 font-sans">::</span>
      <span class="text-accent">{getI18nValue(data, 'district')}</span>
    </p>
    <p class="font-normal text-base-content">
      {languageTag() === 'en' ? neighbourhood : getI18nValue(data, 'name')}
    </p>
  </div>
  <div class="text-sm text-base-content/60">
    <span class="badge h-8 w-8 font-mono text-sm"
      >{getFeatureCount(neighbourhood)}</span>
  </div>
</div>
