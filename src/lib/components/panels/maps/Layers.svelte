<script lang="ts">
// I18N
import { m, getI18nValue, getLocale } from '$lib/i18n';
// ICONS
import { Square3Stack3d } from '@steeze-ui/heroicons';
import Icon from '$lib/components/common/Icon.svelte';
// COMPONENTS
import Section from '$lib/components/panels/common/Section.svelte';
import FilterBar from '$lib/components/panels/common/FilterBar.svelte';
import FilteredLayer from '$lib/components/panels/maps/FilteredLayer.svelte';
import ResourceContainer from '$lib/components/panels/common/ResourceContainer.svelte';
import SelectedResources from '../common/SelectedResources.svelte';
// CONTEXT
import { getMapContext } from '$lib/context/map.svelte';
// TYPES
import type { Layer, Project } from '$lib/types';

// Initialize query client and map state
const mapCtx = getMapContext();

// Get cached features for counting
const layers = $derived(mapCtx.state.resources.layer);
const selectedLayers = $derived(mapCtx.state.prisms.layer);

let searchTerm = $state('');

// Reset search term when projects change
$effect(() => {
  layers; // track layers
  searchTerm = '';
});

function filterLayers(layers: Layer[], term: string) {
  if (!term) return layers;

  const searchLower = term.toLowerCase();
  return layers.filter((layer) => {
    return getLocale() == 'en'
      ? layer.name.toLowerCase().includes(searchLower) ||
          (layer.description && layer.description.toLowerCase().includes(searchLower))
      : getI18nValue(layer, 'nameShort').toLowerCase().includes(searchLower) ||
          getI18nValue(layer, 'description').toLowerCase().includes(searchLower);
  });
}

const filteredLayers = $derived(filterLayers(layers, searchTerm));
</script>

<!-- COMPONENTS -->

{#snippet SelectedLayers()}
  <SelectedResources
    {mapCtx}
    type="layer"
    resources={layers}
    selectedIds={selectedLayers}
    colorClass="text-secondary" />
{/snippet}

<!-- LAYOUT -->

<Section
  title={m.maps__layers()}
  icon={Square3Stack3d}
  iconVerticalPaddingClass="pt-2"
  iconColorClass="text-secondary"
  collapsedContent={SelectedLayers}>
  {#if layers.length > 4}
    <FilterBar bind:searchTerm />
  {/if}
  <ResourceContainer>
    {#each filteredLayers as layer}
      {@const project = mapCtx.getProject(layer)}
      {@const organisation = mapCtx.getOrganisation(project)}
      <FilteredLayer
        {layer}
        {project}
        {organisation}
        selectedClass="bg-secondary"
        isSelected={selectedLayers.includes(layer.id)}
        onClick={() => mapCtx.toggleLayer(layer.id)} />
    {/each}
  </ResourceContainer>
</Section>
