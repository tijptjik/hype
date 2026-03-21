<script lang="ts">
// I18N
import { getLocale } from '$lib/i18n'
import { getI18n } from '$lib/i18n'
import { m } from '$lib/i18n'
// ANIMATIONS
import { flip } from 'svelte/animate'
// CONTEXT
import { getAppCtx } from '$lib/context/app.svelte'
import { getOmniCtx } from '$lib/context/omni.svelte'
import { Panel } from '$lib/enums'
// COMPONENTS
import Section from '$lib/components/panels/common/Section.svelte'
import FilterBar from '$lib/components/panels/common/FilterBar.svelte'
import Icon from '$lib/components/common/Icon.svelte'
import Squares2x2 from 'virtual:icons/lucide/layout-grid'
// UTILS
import { formatDistanceToNow } from 'date-fns'
import { enGB, zhCN, zhHK } from 'date-fns/locale'
// SERVICES
import { filterUserFeaturesByHierarchy } from '$lib/client/services/userFeatures'
// NAVIGATION
import { navigateToVisited } from '$lib/navigation'

// CONTEXT
const appCtx = getAppCtx()
const omniCtx = getOmniCtx()

// STATE
let searchTerm = $state('')

// PANEL PROPS
let panelProps = $derived({
  panelType: Panel.plan,
  position: 'left' as const,
  scrollable: false,
  inline: appCtx.isAdmin(),
  isNarrow: false,
  isAdmin: false,
})

// Get visited features with hierarchy
let visitedFeaturesPromise = $derived(
  (async () => {
    if (!appCtx.state.userFeatures.visited) return []

    const results = []
    for (const visited of appCtx.state.userFeatures.visited) {
      const feature = appCtx.state.resources.feature.find(
        f => f.id === visited.featureId,
      )

      // Skip if feature doesn't exist
      if (!feature) continue

      try {
        const hierarchy = await appCtx.getHierarchy(feature)

        results.push({
          ...visited,
          feature,
          hierarchy,
        })
      } catch (error) {
        console.warn('Failed to get hierarchy for feature:', feature.id, error)
      }
    }

    return results
  })(),
)
</script>

<Section title={m.stars__have_visited()} icon="/map.svg" {...panelProps}>
  {#await visitedFeaturesPromise}
    <div class="flex flex-wrap justify-start gap-2 px-8.5 pt-2">
      <span class="loading loading-ring loading-md"></span>
    </div>
  {:then visitedFeatures}
    {#if visitedFeatures.length > 5}
      <FilterBar bind:searchTerm />
    {/if}
    {@const filteredFeatures = filterUserFeaturesByHierarchy(
      visitedFeatures,
      searchTerm
    )}
    <div class="flex min-h-0 flex-auto flex-col">
      {#if filteredFeatures.length === 0}
        <div class="flex flex-wrap justify-start gap-2 px-8.5 pt-2">
          <p class="text-sm text-base-content/60">{m.due_mad_whale_attend()}</p>
        </div>
      {:else}
        <div class="flex-1 overflow-y-auto">
          {#each filteredFeatures.sort((a, b) => new Date(b.visitedAt!).getTime() - new Date(a.visitedAt!).getTime()) as visited (visited.featureId)}
            {@const organisationName = getI18n(
              visited.hierarchy.organisation,
              'nameShort',
              appCtx.getUserPreferences()
            )}
            {@const showOrganisation = visited.hierarchy.organisation}
            {@const projectName = appCtx.getContextualProjectName(
              visited.hierarchy.project
            )}
            {@const showProject = visited.hierarchy.project && projectName}
            {@const layerName = appCtx.getContextualLayerName(visited.hierarchy.layer!)}
            {@const showLayer = visited.hierarchy.layer && layerName}
            {@const featureName = getI18n(
              visited.feature,
              'title',
              appCtx.getUserPreferences()
            )}
            <div
              class="min-h-21 flex cursor-pointer flex-row items-start justify-between gap-4 bg-black px-4 py-2 text-[#374151]"
              animate:flip={{ duration: 200 }}
              onclick={() => {
                visitedFeaturesPromise.then((features) => {
                  navigateToVisited(appCtx, omniCtx, visited.featureId, features);
                });
              }}
              onkeydown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  visitedFeaturesPromise.then((features) => {
                    navigateToVisited(appCtx, omniCtx, visited.featureId, features);
                  });
                }
              }}
            >
              <Icon src={Squares2x2} class="h-5 w-5 shrink-0" theme="fill" />
              <div class="flex grow flex-col">
                <div class="flex flex-wrap justify-between pb-1">
                  <div>
                    <p class="text-xs uppercase tracking-widest">
                      {#if showOrganisation}
                        <span class="text-primary">{organisationName}</span>
                      {/if}
                      {#if showProject}
                        <span class="mx-1 text-secondary">›</span>
                        <span class="text-secondary">{projectName}</span>
                      {/if}
                      {#if showLayer}
                        <span class="mx-1 text-secondary">›</span>
                        <span class="text-secondary">{layerName}</span>
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
                          })
                            .replace('minute', 'min')
                            .replace('hour', 'hr')
                        : '-'}
                    </p>
                  </div>
                </div>
                <p class="font-normal text-neutral-300">
                  {getI18n(visited.feature, 'title', appCtx.getUserPreferences())}
                </p>
              </div>
            </div>
          {/each}
        </div>
      {/if}
    </div>
  {:catch error}
    <div class="flex flex-wrap justify-start gap-2 px-8.5 pt-2">
      <p class="text-sm text-red-400">{m.livid_polite_mayfly_build()}</p>
    </div>
  {/await}
</Section>
