<script lang="ts">
// I18N
import { getI18n } from '$lib/i18n';
import { m } from '$lib/i18n';
// RUNED
import { watch } from 'runed';
// CONSTANTS
import neighbourhoods from '$lib/map/neighbourhoods.json';
// COMPONENTS
import Section from '$lib/components/panels/common/Section.svelte';
import FilterBar from '$lib/components/panels/common/FilterBar.svelte';
import FilteredNeighbourhood from '$lib/components/panels/common/variants/FilteredNeighbourhood.svelte';
import ResourceContainer from '$lib/components/panels/common/ResourceContainer.svelte';
import SelectedResources from '$lib/components/panels/elements/SelectedResources.svelte';
// CONTEXT
import { getAppCtx } from '$lib/context/app.svelte';
// TYPE
import type { NeighbourhoodMap, Neighbourhood } from '$lib/types';

// Initialize map state
const appCtx = getAppCtx();

// Get cached features for counting
const selectedNeighbourhoods = $derived(appCtx.state.filters.neighbourhoods);

let searchTerm = $state('');

// Filter function for FilterBar
function filterNeighbourhoods(neighbourhoods: NeighbourhoodMap, term: string) {
  if (!term) return Object.entries(neighbourhoods);
  const searchLower = term.toLowerCase();
  return Object.entries(neighbourhoods).filter(([key, data]) => {
    return (
      getI18n(data, 'name', appCtx.getUserPreferences())
        .toLowerCase()
        .includes(searchLower) ||
      getI18n(data, 'district', appCtx.getUserPreferences())
        .toLowerCase()
        .includes(searchLower) ||
      getI18n(data, 'region', appCtx.getUserPreferences())
        .toLowerCase()
        .includes(searchLower)
    );
  });
}

const filteredNeighbourhoods = $derived(
  filterNeighbourhoods(neighbourhoods, searchTerm)
);

// EFFECTS
watch(
  () => selectedNeighbourhoods,
  () => {
    appCtx.refreshFeatures();
  }
);
</script>

<!-- COMPONENTS -->

{#snippet SelectedNeighbourhoods()}
  <SelectedResources
    resourceType="neighbourhood"
    resources={Object.entries(neighbourhoods).map(([id, data]) => ({
      ...data,
      id
    })) as unknown as Neighbourhood[]}
    selectedIds={selectedNeighbourhoods}
    colorClass="text-emerald-600" />
{/snippet}

<!-- LAYOUT -->

<Section
  title={m.filters__neighbourhoods()}
  icon="/neighbourhood.svg"
  iconVerticalPaddingClass="pt-2"
  collapsedContent={SelectedNeighbourhoods}
  position="right">
  {#if Object.keys(neighbourhoods).length > 4}
    <FilterBar bind:searchTerm position="right" onReset={appCtx.resetNeighbourhoods} />
  {/if}
  <ResourceContainer>
    {#each filteredNeighbourhoods as [neighbourhood, data]}
      <FilteredNeighbourhood {neighbourhood} {data} {selectedNeighbourhoods} />
    {/each}
  </ResourceContainer>
</Section>
