<script lang="ts">
// SVELTE
import { slide } from 'svelte/transition'
// I18N
import { m } from '$lib/i18n'
import { getI18n } from '$lib/i18n'
// CONTEXT
import { getAppCtx } from '$lib/context/app.svelte'
import { getOmniCtx } from '$lib/context/omni.svelte'
// SERVICES
import { formatDistanceToNow } from '$lib'
// NAVIGATION
import { navigateToContributedFeature } from '$lib/navigation'
// COMPONENTS
import { Scrollbar } from '$lib/bits/custom/scrollbar'
import ScrollableText from '$lib/components/common/ScrollableText.svelte'
// ICONS
import Icon from '$lib/components/common/Icon.svelte'
import { MapPin, ChevronDown } from '@steeze-ui/heroicons'
// TYPES
import type { FeatureFromCollection } from '$lib/db/zod/schema/feature.types'
import type { UserPreferences, UserProfile } from '$lib/db/zod/schema/user.types'
// PROPS
let { userData }: { userData?: UserProfile } = $props()

// CONTEXT
const appCtx = getAppCtx()
const omniCtx = getOmniCtx()

// SCROLLBAR
let viewport: HTMLDivElement | null = $state(null)
let contents: HTMLDivElement | undefined = $state(undefined)

// HEIGHT MANAGEMENT
let contentHeight = $state(0)
let availableHeight = $state(0)
let predictedHeight = $state(0) // For smooth transitions

// Calculate dynamic heights - use predicted height when available
let effectiveHeight = $derived(predictedHeight > 0 ? predictedHeight : contentHeight)
let minHeight = $derived(effectiveHeight > 420 ? 420 : effectiveHeight)
let maxHeight = $derived(Math.max(420, (availableHeight - 64) / 2))
let finalHeight = $derived(Math.min(minHeight, maxHeight))

// COLLAPSIBLE STATE
let collapsedGroups = $state<Set<string>>(new Set())

// COLLAPSIBLE HANDLERS
const toggleGroup = (projectId: string) => {
  // Perform the toggle
  const newCollapsed = new Set(collapsedGroups)
  if (newCollapsed.has(projectId)) {
    newCollapsed.delete(projectId)
  } else {
    newCollapsed.add(projectId)
  }
  collapsedGroups = newCollapsed
}

// UTIL :: I18N

let getFeatureDisplayAddress = (feature: FeatureFromCollection) =>
  getI18n(
    feature,
    'displayAddress',
    { ...appCtx.getUserPreferences(), allowMachineTranslation: true },
    m.feature__address_unknown(),
  )

// UTIL :: DATE PROCESSING

const getTimeSpanCategory = (date: Date) => {
  const now = new Date()
  const diffMs = now.getTime() - date.getTime()
  const diffHours = diffMs / (1000 * 60 * 60)
  const diffDays = diffMs / (1000 * 60 * 60 * 24)
  const diffWeeks = diffMs / (1000 * 60 * 60 * 24 * 7)
  const diffMonths = diffMs / (1000 * 60 * 60 * 24 * 30)
  const diffYears = diffMs / (1000 * 60 * 60 * 24 * 365)

  if (diffHours < 1) return 'hour'
  if (diffDays < 1) return 'day'
  if (diffWeeks < 1) return 'week'
  if (diffWeeks < 2) return '2weeks'
  if (diffMonths < 1) return 'month'
  if (diffMonths < 3) return '3months'
  if (diffMonths < 6) return '6months'
  if (diffYears < 1) return 'year'
  if (diffYears < 2) return '2years'
  if (diffYears < 5) return '5years'
  if (diffYears < 10) return 'decade'
  return 'ancient'
}

const shouldShowDate = (features: any[], currentIndex: number) => {
  if (currentIndex === 0) return true // Always show for first item

  const currentFeature = features[currentIndex]
  const previousFeature = features[currentIndex - 1]

  if (!currentFeature?.createdAt || !previousFeature?.createdAt) return false

  const currentCategory = getTimeSpanCategory(new Date(currentFeature.createdAt))
  const previousCategory = getTimeSpanCategory(new Date(previousFeature.createdAt))

  return currentCategory !== previousCategory
}

// Helper to fetch all features for a project group, and the hierarchy for the first feature
const fetchFeaturesForProject = async (featureIds: string[]) => {
  // Fetch all features first
  const features = await Promise.all(
    featureIds.map(async featureId => {
      try {
        return await appCtx.getFeatureById(featureId)
      } catch {
        return null
      }
    }),
  )
  // Sort by createdAt descending
  const filtered = features
    .filter(Boolean)
    .sort((a, b) => new Date(b!.createdAt).getTime() - new Date(a!.createdAt).getTime())
  let hierarchy = null
  if (filtered.length > 0) {
    hierarchy = await appCtx.getHierarchy(filtered[0]!)
  }
  return { features: filtered, hierarchy }
}
</script>

<div id="contributed-features" class="border-b border-base-300">
  <h3
    class="p-4 pb-2 text-sm font-semibold uppercase tracking-wide text-base-content/60"
  >
    {m.omni__title_features()}
  </h3>

  {#if userData?.contributedFeatures && Object.keys(userData.contributedFeatures).length > 0}
    <div class="relative pb-3 pr-2">
      <div class="max-h-[420px] space-y-0 overflow-y-auto" bind:this={viewport}>
        <div bind:this={contents}>
          {#each Object.entries(userData.contributedFeatures) as [ projectId, featureIds ] (projectId)}
            {#await fetchFeaturesForProject(featureIds) then groupData}
              <div class="group-container" data-group-id={projectId}>
                <!-- Sticky Group Header -->
                <button
                  class="sticky top-0 z-10 flex w-full items-center justify-between bg-black px-4 py-2 transition-colors"
                  onclick={() => toggleGroup(projectId)}
                >
                  <div class="flex items-center gap-2">
                    <Icon
                      src={ChevronDown}
                      class="h-4 w-4 transition-transform duration-200 {collapsedGroups.has(
                        projectId
                      )
                        ? '-rotate-90'
                        : ''}"
                    />
                    <p
                      class="flex space-x-0.5 font-mono text-xs uppercase tracking-widest"
                    >
                      {#if groupData.hierarchy?.organisation}
                        <span class="text-primary"
                          >{appCtx.getContextualOrganisationName(
                            groupData.hierarchy.organisation,
                            false
                          )}</span
                        >
                      {/if}
                      {#if appCtx.getContextualProjectName(groupData.hierarchy?.project)}
                        <span class="px-0">›</span>
                        <span class="text-accent"
                          >{appCtx.getContextualProjectName(
                            groupData.hierarchy?.project
                          )}</span
                        >
                      {/if}
                    </p>
                  </div>
                  <div
                    class="text-sm text-base-content/60"
                    style="font-family: 'Tilt Neon', sans-serif"
                  >
                    {groupData.features.length}
                  </div>
                </button>

                <!-- Collapsible Group Members -->
                {#if !collapsedGroups.has(projectId)}
                  <div
                    class="group-content space-y-2 py-2"
                    transition:slide={{ duration: 300 }}
                  >
                    {#each groupData.features.filter((f) => f !== null && f !== undefined) as feature, index (feature.id)}
                      <a
                        href={`/features/${feature.id}`}
                        onclick={(e) => {
                          e.preventDefault();
                          navigateToContributedFeature(
                            appCtx,
                            omniCtx,
                            feature.id,
                            projectId,
                            groupData.features as FeatureFromCollection[],
                            getI18n(groupData.hierarchy?.project, 'name', {
                              allowMachineTranslation: true
                            } as UserPreferences)!,
                            userData?.username!
                          );
                        }}
                        class="flex w-full cursor-pointer items-center gap-2 rounded px-4 text-left transition-colors hover:bg-base-300/20"
                      >
                        <Icon
                          src={MapPin}
                          class="h-5 w-5 stroke-[1.5px] text-base-content/60"
                        />
                        <div
                          class="flex flex-1 flex-col gap-0.5 text-sm text-base-content"
                        >
                          <span class="text-xs text-base-content/60"
                            ><ScrollableText
                              text={getFeatureDisplayAddress(
                                feature as FeatureFromCollection
                              )}
                            /></span
                          >
                          <ScrollableText
                            text={appCtx.getContextualFeatureName(
                              feature as FeatureFromCollection
                            )}
                          />
                        </div>
                        {#if shouldShowDate( groupData.features.filter((f) => f !== null && f !== undefined), index ) && feature.createdAt}
                          <div class="font-mono text-xs text-base-content/40">
                            {formatDistanceToNow(new Date(feature.createdAt), {
                              addSuffix: true
                            })}
                          </div>
                        {/if}
                      </a>
                    {/each}
                  </div>
                {/if}
              </div>
            {:catch groupError}
              <div class="flex items-center justify-center py-4 text-error">
                <span class="text-sm">{m.due_candid_mole_imagine()}: {groupError}</span>
              </div>
            {/await}
          {/each}
        </div>
      </div>
      <Scrollbar
        {viewport}
        {contents}
        margin={{ right: 0 }}
        width={{ track: 8, thumb: 6, thumbActive: 8 }}
        opacity={{ track: 0.3, thumb: 0.6, thumbActive: 0.8 }}
      />
    </div>
  {:else}
    <div class="flex items-center justify-center p-4 text-base-content/60">
      <span class="text-sm">{m.wide_front_jackdaw_forgive()}</span>
    </div>
  {/if}
</div>
