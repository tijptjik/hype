<script lang="ts">
// I18N
import * as m from '$lib/paraglide/messages';
import { getI18nValue } from '$lib/i18n';
import { i18n } from '$lib/i18n';
// NAVIGATION
import { goto } from '$app/navigation';
// CONTEXT
import { getMapContext } from '$lib/context/map.svelte';
// COMPONENTS
import Section from '$lib/components/panels/common/Section.svelte';
import FilterBar from '$lib/components/panels/common/FilterBar.svelte';
import Icon from '$lib/components/common/Icon.svelte';
import { Squares2x2 } from '@steeze-ui/heroicons';
// UTILS
import { formatRelative } from 'date-fns';

const mapContext = getMapContext();

let searchTerm = $state('');

// Get visited features
let visitedFeatures = $derived(
  mapContext.state.userFeatures.visited.map((visited) => {
    const feature = mapContext.state.resources.features.find(
      (f) => f.id === visited.featureId
    );
    const layer = mapContext.getLayer(feature);
    const project = layer ? mapContext.getProject(layer) : undefined;
    const organisation = project ? mapContext.getOrganisation(project) : undefined;

    // Check if this project has only one layer
    const projectLayerCount = mapContext.state.resources.layers.filter(
      (l) => l.projectId === project?.id
    ).length;

    return {
      ...visited,
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
function filterFeatures(features: typeof visitedFeatures, term: string) {
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

const filteredFeatures = $derived(filterFeatures(visitedFeatures, searchTerm));

let handleFeatureSelection = (featureId: string) => {
  mapContext.setActiveFeature(featureId);
  mapContext.zoomToActiveFeature();
  // Close panel
  goto(i18n.resolveRoute('/'));
};
</script>

<Section title={m.stars__have_visited()} icon="/map.svg">
  {#if visitedFeatures.length > 5}
    <FilterBar bind:searchTerm />
  {/if}
  <div
    class="scrollbar-thin flex min-h-0 flex-col gap-[1px] overflow-y-auto bg-base-200">
    {#each filteredFeatures as visited}
      <div
        class="min-h-21 flex flex-row items-center justify-between gap-4 bg-black px-4 py-2 text-[#374151]"
        onclick={() => handleFeatureSelection(visited.featureId)}>
        <Icon src={Squares2x2} class="h-5 w-5 flex-shrink-0" theme="fill" />
        <div class="flex flex-grow flex-col">
          <p class="text-xs uppercase tracking-widest">
            <span class="text-primary">{visited.hierarchy.organisation}</span>
            <span class="mx-1 text-secondary">›</span>
            <span class="text-secondary"
              >{visited.hierarchy.project
                .replaceAll('_', '')
                .replaceAll(' ', '')}</span>
            {#if visited.hierarchy.layer}
              <span class="mx-1 text-secondary">›</span>
              <span class="text-secondary"
                >{visited.hierarchy.layer.replaceAll(' ', '')}</span>
            {/if}
          </p>
          <p class="font-normal text-neutral-300">
            {visited.hierarchy.feature}
          </p>
        </div>
        <p class="mt-1 text-xs text-neutral-content">
          {visited.visitedDate}
        </p>
      </div>
    {/each}
  </div>
</Section>
