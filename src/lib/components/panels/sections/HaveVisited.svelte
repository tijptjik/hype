<script lang="ts">
// I18N
import { getI18n } from '$lib/i18n'
import { m } from '$lib/i18n'
// ANIMATIONS
import { flip } from 'svelte/animate'
import { slide } from 'svelte/transition'
// CONTEXT
import { getAppCtx } from '$lib/context/app.svelte'
import { getOmniCtx } from '$lib/context/omni.svelte'
import { Panel } from '$lib/enums'
// COMPONENTS
import Section from '$lib/components/panels/common/Section.svelte'
import FilterBar from '$lib/components/panels/common/FilterBar.svelte'
import { Icon } from '$lib/bits'
import Squares2x2 from 'virtual:icons/lucide/layout-grid'
// UTILS
import { toDateFnsLocale } from '$lib/i18n'
import { formatDistanceToNow } from 'date-fns'
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

// Resolve synchronously so optimistic changes never reset this section to a loading state.
const visitedFeatures = $derived.by((): UserFeatureWithHierarchy[] => {
  const results: UserFeatureWithHierarchy[] = []

  for (const visited of appCtx.state.userFeatures.visited) {
    const feature = appCtx.state.resources.feature.find(
      item => item.id === visited.featureId,
    )

    // Skip saved items whose feature is not available in the current resource cache.
    if (!feature) continue

    results.push({
      ...visited,
      feature,
      hierarchy: appCtx.getHierarchySync(feature),
    } as UserFeatureWithHierarchy)
  }

  return results
})

function getVisitedTimestamp(value: { visitedAt?: string | null }): number {
  if (!value.visitedAt) return 0
  return new Date(value.visitedAt).getTime()
}

function openVisitedFeature(
  featureId: string,
  features: UserFeatureWithHierarchy[],
): void {
  navigateToVisited(appCtx, omniCtx, featureId, features)
}
</script>

<Section
  title={m.stars__have_visited()}
  iconGraphicClass="scale-130 origin-bottom"
  icon="/map.svg"
  {...panelProps}
>
  {#if visitedFeatures.length > 5}
    <FilterBar bind:searchTerm />
  {/if}
  {@const filteredFeatures = filterUserFeaturesByHierarchy(visitedFeatures, searchTerm)}
  {@const sortedFeatures = [...filteredFeatures].sort(
    (a, b) => getVisitedTimestamp(b) - getVisitedTimestamp(a)
  )}
  <div class="flex min-h-0 flex-auto flex-col">
    {#if sortedFeatures.length === 0}
      <div class="flex flex-wrap justify-start gap-2 px-8.5 pt-2">
        <p class="text-sm text-base-content/60">{m.due_mad_whale_attend()}</p>
      </div>
    {:else}
      <div class="flex-1 overflow-y-auto">
        {#each sortedFeatures as visited (visited.featureId)}
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
          {@const layerName = visited.hierarchy.layer
              ? appCtx.getContextualLayerName(visited.hierarchy.layer)
              : null}
          {@const showLayer = visited.hierarchy.layer && layerName}
          <button
            type="button"
            class="min-h-21 flex w-full cursor-pointer flex-row items-start justify-between gap-4 bg-black px-4 py-2 text-left text-[#374151]"
            animate:flip={{ duration: 200 }}
            in:slide={{ axis: 'y', duration: 200 }}
            onclick={() => {
                openVisitedFeature(visited.featureId, visitedFeatures)
              }}
          >
            <Icon src={Squares2x2} class="h-5 w-5 shrink-0" filled />
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
                            locale: toDateFnsLocale()
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
          </button>
        {/each}
      </div>
    {/if}
  </div>
</Section>
