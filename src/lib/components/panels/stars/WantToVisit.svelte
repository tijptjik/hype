<script lang="ts">
// I18N
import { getI18n } from '$lib/i18n';
import { m } from '$lib/i18n';
// ANIMATIONS
import { flip } from 'svelte/animate';
// CONTEXT
import { getMapCtx } from '$lib/context/map.svelte';
import { getOmniContext } from '$lib/context/omni.svelte';
// COMPONENTS
import Section from '$lib/components/panels/common/Section.svelte';
import FilterBar from '$lib/components/panels/common/FilterBar.svelte';
import Icon from '$lib/components/common/Icon.svelte';
import { Squares2x2 } from '@steeze-ui/heroicons';

// CONTEXT
const mapCtx = getMapCtx();
const omniCtx = getOmniContext();
// STATE
let searchTerm = $state('');

// Get wishlisted features
let wishlistedFeatures = $derived(
  mapCtx.state.userFeatures.wishlisted?.flatMap((wishlist) => {
    const feature = mapCtx.state.resources.feature.find(
      (f) => f.id === wishlist.featureId
    );

    // Skip if feature doesn't exist
    if (!feature) return [];

    const layer = mapCtx.getLayer(feature);
    const project = layer ? mapCtx.getProject(layer) : undefined;
    const organisation = project ? mapCtx.getOrganisation(project) : undefined;

    return [
      {
        ...wishlist,
        hierarchy: {
          organisation: getI18n(organisation!, 'nameShort', mapCtx.getUserPreferences()),
          project: mapCtx.getContextualProjectName(project!),
          layer: mapCtx.getContextualLayerName(layer!),
          feature: getI18n(feature, 'title', mapCtx.getUserPreferences())
        }
      }
    ];
  }) ?? []
);

// Filter function
function filterFeatures(features: typeof wishlistedFeatures, term: string) {
  if (!term) return features;
  const searchLower = term.toLowerCase();
  return features.filter(
    (feature) =>
      feature.hierarchy.organisation.toLowerCase().includes(searchLower) ||
      (feature.hierarchy.project?.toLowerCase().includes(searchLower) ?? false) ||
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
  <div class="flex min-h-0 flex-col">
    {#if filteredFeatures.length === 0}
      <div class="flex flex-wrap justify-start gap-2 px-[34px] pt-2">
        <p class="text-sm text-base-content/60">{m.short_watery_marten_race()}</p>
      </div>
    {:else}
      <div class="scrollbar-thin flex-1 overflow-y-auto">
        {#each filteredFeatures as wishlist (wishlist.featureId)}
          <div
            class="min-h-21 flex cursor-pointer flex-row items-center justify-between gap-4 bg-black px-4 py-2 text-[#374151]"
            animate:flip={{ duration: 200 }}
            onclick={() =>
              omniCtx.handleFeatureSelection(mapCtx, wishlist.featureId, {
                openCard: true
              })}>
            <Icon src={Squares2x2} class="h-5 w-5 flex-shrink-0" theme="fill" />
            <div class="flex flex-grow flex-col">
              <p class="text-xs uppercase tracking-widest">
                <span class="text-primary">{wishlist.hierarchy.organisation}</span>
                {#if wishlist.hierarchy.project}
                  <span class="mx-1 text-secondary">›</span>
                  <span class="text-secondary"
                  >{wishlist.hierarchy.project}</span>
                {/if}
                {#if wishlist.hierarchy.layer}
                  <span class="mx-1 text-secondary">›</span>
                  <span class="text-secondary"
                    >{wishlist.hierarchy.layer}</span>
                {/if}
              </p>
              <p class="font-normal text-neutral-300">
                {wishlist.hierarchy.feature}
              </p>
            </div>
          </div>
        {/each}
      </div>
    {/if}
  </div>
</Section>
