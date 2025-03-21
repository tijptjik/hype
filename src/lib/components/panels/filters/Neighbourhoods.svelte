<script lang="ts">
// I18N
import { m, getI18nValue, languageTag } from '$lib/i18n';
// CONSTANTS
import neighbourhoods from '$lib/map/neighbourhoods.json';
// COMPONENTS
import Section from '$lib/components/panels/common/Section.svelte';
import FilterBar from '$lib/components/panels/common/FilterBar.svelte';
import FilteredNeighbourhood from '$lib/components/panels/filters/FilteredNeighbourhood.svelte';
import ResourceContainer from '$lib/components/panels/maps/ResourceContainer.svelte';
import SelectedResources from '$lib/components/panels/maps/SelectedResources.svelte';
// CONTEXT
import { getMapContext } from '$lib/context/map.svelte';

// Initialize map state
const mapContext = getMapContext();

// Get cached features for counting
const selectedNeighbourhoods = $derived(mapContext.state.filters.neighbourhoods);

let searchTerm = $state('');

// Filter function for FilterBar
function filterNeighbourhoods(
  neighbourhoods: Record<
    string,
    { neighbourhood: string; district: string; region: string }
  >,
  term: string
) {
  if (!term) return Object.entries(neighbourhoods);
  const searchLower = term.toLowerCase();
  return Object.entries(neighbourhoods).filter(([key, data]) =>
    languageTag() == 'en'
      ? key.toLowerCase().includes(searchLower) ||
        data.district.toLowerCase().includes(searchLower) ||
        data.region.toLowerCase().includes(searchLower)
      : getI18nValue(data, 'name').toLowerCase().includes(searchLower) ||
        getI18nValue(data, 'district').toLowerCase().includes(searchLower) ||
        getI18nValue(data, 'region').toLowerCase().includes(searchLower)
  );
}

const filteredNeighbourhoods = $derived(
  filterNeighbourhoods(neighbourhoods, searchTerm)
);

// EFFECTS

// Update query when selection changes
$effect(() => {
  selectedNeighbourhoods; // track changes
  mapContext.refreshFeatures();
});
</script>

<!-- COMPONENTS -->

{#snippet SelectedNeighbourhoods()}
  <SelectedResources
    {mapContext}
    type="neighbourhood"
    resources={Object.entries(neighbourhoods).map(([id, data]) => ({
      ...data,
      id
    }))}
    selectedIds={selectedNeighbourhoods}
    colorClass="text-emerald-500" />
{/snippet}

<!-- LAYOUT -->

<Section
  title={m.filters__neighbourhoods()}
  icon="/neighbourhood.svg"
  iconVerticalPaddingClass="pt-2"
  collapsedContent={SelectedNeighbourhoods}>
  {#if Object.keys(neighbourhoods).length > 4}
    <FilterBar bind:searchTerm />
  {/if}
  <ResourceContainer>
    {#each filteredNeighbourhoods as [neighbourhood, data]}
      <FilteredNeighbourhood {neighbourhood} {data} {selectedNeighbourhoods} />
    {/each}
  </ResourceContainer>
</Section>
