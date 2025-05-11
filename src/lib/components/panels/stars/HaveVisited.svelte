<script lang="ts">
// I18N
import { m, getLocale } from '$lib/i18n';
import { getI18nValue } from '$lib/i18n';
// ANIMATIONS
import { flip } from 'svelte/animate';
// NAVIGATION
import { goto } from '$app/navigation';
// CONTEXT
import { getMapContext } from '$lib/context/map.svelte';
import { getOmniContext } from '$lib/context/omni.svelte';
// COMPONENTS
import Section from '$lib/components/panels/common/Section.svelte';
import FilterBar from '$lib/components/panels/common/FilterBar.svelte';
import Icon from '$lib/components/common/Icon.svelte';
import { Squares2x2 } from '@steeze-ui/heroicons';
// UTILS
import { formatDistanceToNow } from 'date-fns';
import { enGB, zhCN, zhHK } from 'date-fns/locale';

// TYPES
import type { UserFeatureExtended } from '$lib/types';

// CONTEXT
const mapCtx = getMapContext();
const omniCtx = getOmniContext();

let searchTerm = $state('');

// Get visited features
let visitedFeatures: UserFeatureExtended[] = $derived(
  mapCtx.state.userFeatures.visited?.flatMap((visited) => {
    const feature = mapCtx.state.resources.feature.find(
      (f) => f.id === visited.featureId
    );

    // Skip if feature doesn't exist
    if (!feature) return [];

    const layer = feature ? mapCtx.getLayer(feature) : undefined;
    const project = layer ? mapCtx.getProject(layer) : undefined;
    const organisation = project ? mapCtx.getOrganisation(project) : undefined;

    // Check if this project has only one layer
    const projectLayerCount = mapCtx.state.resources.layer.filter(
      (l) => l.projectId === project?.id
    ).length;

    return [
      {
        ...visited,
        hierarchy: {
          organisation: getI18nValue(organisation, 'nameShort'),
          project: getI18nValue(project, 'nameShort'),
          // Only include layer name if project has multiple layers
          layer: projectLayerCount > 1 ? getI18nValue(layer, 'nameShort') : null,
          feature: getI18nValue(feature, 'title')
        }
      }
    ];
  }) ?? []
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
</script>

<Section title={m.stars__have_visited()} icon="/map.svg">
  {#if visitedFeatures.length > 5}
    <FilterBar bind:searchTerm />
  {/if}
  <div class="flex min-h-0 flex-auto flex-col">
    {#if filteredFeatures.length === 0}
      <div class="flex flex-wrap justify-start gap-2 px-[34px] pt-2">
        <p class="text-sm text-base-content/60">{m.due_mad_whale_attend()}</p>
      </div>
    {:else}
      <div class="scrollbar-thin flex-1 overflow-y-auto">
        {#each filteredFeatures.sort((a, b) => new Date(b.visitedAt!).getTime() - new Date(a.visitedAt!).getTime()) as visited (visited.featureId)}
          <div
            class="min-h-21 flex flex-row items-start justify-between gap-4 bg-black px-4 py-2 text-[#374151]"
            animate:flip={{ duration: 200 }}
            onclick={() =>
              omniCtx.handleFeatureSelection(mapCtx, visited.featureId, {
                openCard: true
              })}>
            <Icon src={Squares2x2} class="h-5 w-5 flex-shrink-0" theme="fill" />
            <div class="flex flex-grow flex-col">
              <div class="flex flex-wrap justify-between pb-1">
                <div>
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
                </div>
                <div>
                  <p class="text-xs text-neutral-content">
                    {visited.visitedAt
                      ? formatDistanceToNow(new Date(visited.visitedAt), {
                          addSuffix: true,
                          locale:
                            getLocale() === 'zh-hant'
                              ? zhHK
                              : getLocale() === 'zh-hans'
                                ? zhCN
                                : enGB
                        }).replace('minute', 'min')
                      : '-'}
                  </p>
                </div>
              </div>
              <p class="font-normal text-neutral-300">
                {visited.hierarchy.feature}
              </p>
            </div>
          </div>
        {/each}
      </div>
    {/if}
  </div>
</Section>
