<script lang="ts">
import { browser } from '$app/environment';
// I18N
import { getI18n } from '$lib/i18n';
import { m } from '$lib/i18n';
// ICONS
import { Square3Stack3d } from '@steeze-ui/heroicons';
// COMPONENTS
import Section from '$lib/components/panels/common/Section.svelte';
import FilterBar from '$lib/components/panels/common/FilterBar.svelte';
import ResourceContainer from '$lib/components/panels/common/ResourceContainer.svelte';
import SelectedResources from '../elements/SelectedResources.svelte';
// CONTEXT
import { getAppCtx } from '$lib/context/app.svelte';
// ENUMS
import { FirstClassResource, Panel } from '$lib/enums';
// TYPES
import type { Layer, ResourceContext, Id, PanelProps } from '$lib/types';
import type { Snippet } from 'svelte';

// Initialize query client and map state
const appCtx = getAppCtx();
const resourceType = FirstClassResource.layer;

// PROPS
let {
  filteredItem,
  ...panelProps
}: {
  filteredItem: Snippet<[Layer, Id[], ResourceContext]>;
} & PanelProps = $props();

// STATE
const selectedLayers = $derived(appCtx.state.prisms.layer);
// Get cached features for counting
const layers = $derived(appCtx.state.resources.layer);

let searchTerm = $state('');

// Reset search term when projects change
$effect(() => {
  layers; // track layers
  searchTerm = '';
});

function filterLayers(layers: Layer[], term: string) {
  if (!term) return layers;

  const searchLower = term.toLowerCase();
  return layers.filter((layer: Layer) => {
    if (!layer) return false;
    return (
      getI18n(layer, 'name', appCtx.getUserPreferences())
        .toLowerCase()
        .includes(searchLower) ||
      getI18n(layer, 'description', appCtx.getUserPreferences())
        .toLowerCase()
        .includes(searchLower)
    );
  });
}

const filteredLayers = $derived(filterLayers(layers, searchTerm));
let isDefaultOpen = $derived(browser ? window.innerHeight > 1000 : false);

let handleReset = () => {
  if (selectedLayers.length == 0) {
    appCtx.closePanel(panelProps.panelType);
  } else {
    appCtx.resetLayers();
  }
};
</script>

<!-- COMPONENTS -->

{#snippet SelectedLayers()}
  <SelectedResources
    {resourceType}
    resources={layers}
    selectedIds={selectedLayers}
    colorClass="text-secondary"
    {...panelProps} />
{/snippet}

<!-- LAYOUT -->
<Section
  {resourceType}
  title={m.maps__layers()}
  icon={Square3Stack3d}
  iconVerticalPaddingClass="pt-2"
  iconColorClass="text-secondary"
  collapsedContent={SelectedLayers}
  defaultOpen={isDefaultOpen}
  {...panelProps}>
  {#if layers.length > 4 && !appCtx.isPanelNarrow(Panel.admin)}
    <FilterBar bind:searchTerm onReset={handleReset} />
  {/if}
  <ResourceContainer>
    {#each filteredLayers as layer (layer.id)}
      {@const hierarchy = appCtx.getHierarchySync(layer)}
      {@render filteredItem(layer, selectedLayers, hierarchy)}
    {/each}
  </ResourceContainer>
</Section>
