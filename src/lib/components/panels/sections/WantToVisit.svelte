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
  panelType: Panel.plan,
  position: 'left' as const,
  scrollable: false,
  inline: appCtx.isAdmin(),
  isNarrow: false,
  isAdmin: false,
})

// Resolve synchronously so optimistic changes never reset this section to a loading state.
const wishlistedFeatures = $derived.by((): UserFeatureWithHierarchy[] => {
  const results: UserFeatureWithHierarchy[] = []

  for (const wishlist of appCtx.state.userFeatures.wishlisted) {
    const feature = appCtx.state.resources.feature.find(
      item => item.id === wishlist.featureId,
    )

    // Skip saved items whose feature is not available in the current resource cache.
    if (!feature) continue

    results.push({
      ...wishlist,
      feature,
      hierarchy: appCtx.getHierarchySync(feature),
    } as UserFeatureWithHierarchy)
  }

  return results
})
</script>

<Section
  title={m.stars__want_to_visit()}
  iconGraphicClass="scale-130 origin-bottom"
  icon="/compass.svg"
  {...panelProps}
>
  {#if wishlistedFeatures.length > 5}
    <FilterBar bind:searchTerm />
  {/if}
  {@const filteredFeatures = filterUserFeaturesByHierarchy(wishlistedFeatures, searchTerm)}
  <div class="flex min-h-0 flex-col">
    {#if filteredFeatures.length === 0}
      <div class="flex flex-wrap justify-start gap-2 px-8.5 pt-2">
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
          {@const layerName = wishlist.hierarchy.layer
            ? appCtx.getContextualLayerName(wishlist.hierarchy.layer)
            : null}
          {@const showLayer = wishlist.hierarchy.layer && layerName}
          {@const featureName = getI18n(
            wishlist.feature,
            'title',
            appCtx.getUserPreferences()
          )}
          <button
            type="button"
            class="min-h-21 flex w-full cursor-pointer flex-row items-center justify-between gap-4 bg-black px-4 py-2 text-left text-[#374151]"
            animate:flip={{ duration: 200 }}
            in:slide={{ axis: 'y', duration: 200 }}
            onclick={() => {
              navigateToStarred(appCtx, omniCtx, wishlist.featureId, wishlistedFeatures)
            }}
          >
            <Icon src={Squares2x2} class="h-5 w-5 shrink-0" filled />
            <div class="flex grow flex-col">
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
          </button>
        {/each}
      </div>
    {/if}
  </div>
</Section>
