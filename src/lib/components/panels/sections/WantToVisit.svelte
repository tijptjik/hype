<script lang="ts">
// I18N
import { getI18n } from '$lib/i18n'
import { m } from '$lib/i18n'
// ANIMATIONS
import { flip } from 'svelte/animate'
// CONTEXT
import { getAppCtx } from '$lib/context/app.svelte'
import { getOmniCtx } from '$lib/context/omni.svelte'
// COMPONENTS
import Section from '$lib/components/panels/common/Section.svelte'
import FilterBar from '$lib/components/panels/common/FilterBar.svelte'
import Icon from '$lib/components/common/Icon.svelte'
import { Squares2x2 } from '@steeze-ui/heroicons'
// SERVICES
import { filterUserFeaturesByHierarchy } from '$lib/client/services/userFeatures'
// NAVIGATION
import { navigateToStarred } from '$lib/navigation'
// TYPES
import type { UserFeatureWithHierarchy } from '$lib/db/zod/schema/user.types'

// CONTEXT
const appCtx = getAppCtx()
const omniCtx = getOmniCtx()

// STATE
let searchTerm = $state('')

// PANEL PROPS
let panelProps = $derived({
  panelType: 'stars' as const,
  position: 'left' as const,
  scrollable: false,
  inline: appCtx.isAdmin(),
  isNarrow: false,
  isAdmin: false,
})

// Get wishlisted features with hierarchy
let wishlistedFeaturesPromise: Promise<UserFeatureWithHierarchy[]> = $derived(
  (async () => {
    if (!appCtx.state.userFeatures.wishlisted) return []
    const results = []
    for (const wishlist of appCtx.state.userFeatures.wishlisted) {
      const feature = appCtx.state.resources.feature.find(
        f => f.id === wishlist.featureId,
      )

      // Skip if feature doesn't exist
      if (!feature) continue

      try {
        const hierarchy = await appCtx.getHierarchy(feature)

        results.push({
          ...wishlist,
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

<Section title={m.stars__want_to_visit()} icon="/compass.svg" {...panelProps}>
  {#await wishlistedFeaturesPromise}
    <div class="flex flex-wrap justify-start gap-2 px-[34px] pt-2">
      <span class="loading loading-ring loading-md"></span>
    </div>
  {:then wishlistedFeatures}
    {#if wishlistedFeatures.length > 5}
      <FilterBar bind:searchTerm />
    {/if}
    {@const filteredFeatures = filterUserFeaturesByHierarchy(
      wishlistedFeatures,
      searchTerm
    )}
    <div class="flex min-h-0 flex-col">
      {#if filteredFeatures.length === 0}
        <div class="flex flex-wrap justify-start gap-2 px-[34px] pt-2">
          <p class="text-sm text-base-content/60">{m.short_watery_marten_race()}</p>
        </div>
      {:else}
        <div class="flex-1 overflow-y-auto">
          {#each filteredFeatures as wishlist (wishlist.featureId)}
            {@const organisationName = getI18n(
              wishlist.hierarchy.organisation,
              'nameShort',
              appCtx.getUserPreferences()
            )}
            {@const showOrganisation = wishlist.hierarchy.organisation}
            {@const projectName = appCtx.getContextualProjectName(
              wishlist.hierarchy.project
            )}
            {@const showProject = wishlist.hierarchy.project && projectName}
            {@const layerName = appCtx.getContextualLayerName(
              wishlist.hierarchy.layer!
            )}
            {@const showLayer = wishlist.hierarchy.layer && layerName}
            {@const featureName = getI18n(
              wishlist.feature,
              'title',
              appCtx.getUserPreferences()
            )}
            <div
              class="min-h-21 flex cursor-pointer flex-row items-center justify-between gap-4 bg-black px-4 py-2 text-[#374151]"
              role="button"
              tabindex="0"
              animate:flip={{ duration: 200 }}
              onclick={() => {
                wishlistedFeaturesPromise.then((features) => {
                  navigateToStarred(appCtx, omniCtx, wishlist.featureId, features);
                });
              }}
              onkeydown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  wishlistedFeaturesPromise.then((features) => {
                    navigateToStarred(appCtx, omniCtx, wishlist.featureId, features);
                  });
                }
              }}
            >
              <Icon src={Squares2x2} class="h-5 w-5 flex-shrink-0" theme="fill" />
              <div class="flex flex-grow flex-col">
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
                <p class="font-normal text-neutral-300">{featureName}</p>
              </div>
            </div>
          {/each}
        </div>
      {/if}
    </div>
  {:catch error}
    <div class="flex flex-wrap justify-start gap-2 px-[34px] pt-2">
      <p class="text-sm text-red-400">{m.honest_swift_lamb_sew()}</p>
    </div>
  {/await}
</Section>
