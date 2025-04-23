<script lang="ts">
// I18N
import { m } from '$lib/i18n';
import { getI18nValue } from '$lib/i18n';
// CONTEXT
import { getMapContext } from '$lib/context/map.svelte';
import { getOmniContext } from '$lib/context/omni.svelte';
// COMPONENTS
import Section from '$lib/components/panels/common/Section.svelte';
import FilterBar from '$lib/components/panels/common/FilterBar.svelte';
import Icon from '$lib/components/common/Icon.svelte';
import { Squares2x2 } from '@steeze-ui/heroicons';

// CONTEXT
const mapContext = getMapContext();
const omniContext = getOmniContext();
// STATE
let searchTerm = $state('');

// Get wishlisted features
let wishlistedFeatures = $derived(
  mapContext.state.userFeatures.wishlisted.map((wishlist) => {
    const feature = mapContext.state.resources.feature.find(
      (f) => f.id === wishlist.featureId
    );
    const layer = mapContext.getLayer(feature);
    const project = layer ? mapContext.getProject(layer) : undefined;
    const organisation = project ? mapContext.getOrganisation(project) : undefined;

    // Check if this project has only one layer
    const projectLayerCount = mapContext.state.resources.layer.filter(
      (l) => l.projectId === project?.id
    ).length;

    return {
      ...wishlist,
      hierarchy: {
        organisation: getI18nValue(organisation, 'nameShort'),
        project: getI18nValue(project, 'nameShort'),
        // Only include layer name if project has multiple layers
        layer: projectLayerCount > 1 ? getI18nValue(layer, 'nameShort') : null,
        feature: getI18nValue(feature, 'title')
      }
    };
  })
);

// Filter function
function filterFeatures(features: typeof wishlistedFeatures, term: string) {
  if (!term) return features;
  const searchLower = term.toLowerCase();
  return features.filter(
    (feature) =>
      feature.hierarchy.organisation.toLowerCase().includes(searchLower) ||
      feature.hierarchy.project.toLowerCase().includes(searchLower) ||
      (feature.hierarchy.layer?.toLowerCase().includes(searchLower) ?? false) ||
      feature.hierarchy.feature.toLowerCase().includes(searchLower)
  );
}

const filteredFeatures = $derived(filterFeatures(wishlistedFeatures, searchTerm));
</script>

<Section title={m.stars__want_to_visit()} icon="/compass.svg">
  {#if wishlistedFeatures.length > 5}
    <FilterBar bind:searchTerm />
  {/if}
  <div
    class="scrollbar-thin flex min-h-0 flex-col gap-[1px] overflow-y-auto bg-base-200">
    {#each filteredFeatures as wishlist}
      <div
        class="min-h-21 flex flex-row items-center justify-between gap-4 bg-black px-4 py-2 text-[#374151]"
        onclick={() =>
          omniContext.handleFeatureSelection(mapContext, wishlist.featureId)}>
        <Icon src={Squares2x2} class="h-5 w-5 flex-shrink-0" theme="fill" />
        <div class="flex flex-grow flex-col">
          <p class="text-xs uppercase tracking-widest">
            <span class="text-primary">{wishlist.hierarchy.organisation}</span>
            <span class="mx-1 text-secondary">›</span>
            <span class="text-secondary"
              >{wishlist.hierarchy.project
                .replaceAll('_', '')
                .replaceAll(' ', '')}</span>
            {#if wishlist.hierarchy.layer}
              <span class="mx-1 text-secondary">›</span>
              <span class="text-secondary"
                >{wishlist.hierarchy.layer.replaceAll(' ', '')}</span>
            {/if}
          </p>
          <p class="font-normal text-neutral-300">
            {wishlist.hierarchy.feature}
          </p>
        </div>
      </div>
    {/each}
  </div>
</Section>
