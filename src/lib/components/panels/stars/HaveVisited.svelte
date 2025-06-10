<script lang="ts">
// I18N
import { getLocale } from '$lib/i18n';
import { getI18n } from '$lib/i18n';
import { m } from '$lib/i18n';
// ANIMATIONS
import { flip } from 'svelte/animate';
// CONTEXT
import { getAppCtx } from '$lib/context/app.svelte';
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
import type { UserFeature } from '$lib/types';

// CONTEXT
const appCtx = getAppCtx();
const omniCtx = getOmniContext();

let searchTerm = $state('');

// Get visited features
let visitedFeatures = $derived(
  appCtx.state.userFeatures.visited?.flatMap((visited) => {
    const feature = appCtx.state.resources.feature.find(
      (f) => f.id === visited.featureId
    );

    // Skip if feature doesn't exist
    if (!feature) return [];

    const layer = feature ? appCtx.getLayer(feature) : undefined;
    const project = layer ? appCtx.getProject(layer) : undefined;
    const organisation = project ? appCtx.getOrganisation(project) : undefined;

    return [
      {
        ...visited,
        hierarchy: {
          organisation: getI18n(organisation, 'nameShort', appCtx.getUserPreferences()),
          project: getI18n(project, 'nameShort', appCtx.getUserPreferences()),
          layer: appCtx.getContextualLayerName(layer!),
          feature: getI18n(feature, 'title', appCtx.getUserPreferences())
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
            class="min-h-21 flex cursor-pointer flex-row items-start justify-between gap-4 bg-black px-4 py-2 text-[#374151]"
            animate:flip={{ duration: 200 }}
            onclick={() =>
              omniCtx.handleFeatureSelection(appCtx, visited.featureId, {
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
