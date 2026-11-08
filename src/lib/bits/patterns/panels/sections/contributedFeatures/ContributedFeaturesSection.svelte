<script lang="ts">
// SVELTE
import { slide } from 'svelte/transition'
// I18N
import { m } from '#lib/i18n.js'
// ADAPTERS
import { useContributedFeatures } from '#lib/adapters/panels/useContributedFeatures.svelte.js'
// SERVICES
import { formatDistanceToNow } from '#lib'
// COMPONENTS
import ContributionStatus from '../components/ContributionStatus.svelte'
import { Scrollbar } from '#lib/bits/custom/scrollbar/index.js'
import { ScrollableText } from '#lib/bits/index.js'
// ICONS
import { Icon } from '#lib/bits/index.js'
import MapPin from 'virtual:icons/proicons/location'
import ChevronDown from 'virtual:icons/proicons/chevron-down'
// TYPES
import type { FeatureFromCollection } from '#lib/db/zod/schema/feature.types.js'
import type { UserProfile } from '#lib/db/zod/schema/user.types.js'
import type { UserContributionsModel } from '#lib/adapters/panels/userContributions.js'
// PROPS
let {
  userData,
  model,
  layout = 'panel',
}: {
  userData?: UserProfile
  model: UserContributionsModel
  layout?: 'panel' | 'dashboard'
} = $props()

// SCROLLBAR
let viewport: HTMLDivElement | null = $state(null)
let contents: HTMLDivElement | undefined = $state(undefined)
let continuation: HTMLDivElement | null = $state(null)

// HEIGHT MANAGEMENT
// For smooth transitions

// Calculate dynamic heights - use predicted height when available

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
  model.getFeatureAddress(feature) || m.feature__address_unknown()

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

const shouldShowDate = (
  features: Array<{ createdAt: string }>,
  currentIndex: number,
) => {
  if (currentIndex === 0) return true // Always show for first item

  const currentFeature = features[currentIndex]
  const previousFeature = features[currentIndex - 1]

  if (!currentFeature?.createdAt || !previousFeature?.createdAt) return false

  const currentCategory = getTimeSpanCategory(new Date(currentFeature.createdAt))
  const previousCategory = getTimeSpanCategory(new Date(previousFeature.createdAt))

  return currentCategory !== previousCategory
}

// Fetch feature pages and ancestry without launching the entire contribution history.
const contributions = useContributedFeatures(
  () => userData,
  () => model,
)

// Reobserve after each page so short or empty pages keep filling the viewport.
$effect(() => {
  if (
    !viewport ||
    !continuation ||
    contributions.loading ||
    contributions.failed ||
    !contributions.hasMore
  )
    return
  const observer = new IntersectionObserver(
    entries => {
      if (
        entries.some(entry => entry.isIntersecting) &&
        !contributions.loading &&
        !contributions.failed
      )
        void contributions.loadMore()
    },
    { root: viewport, rootMargin: '0px 0px 240px 0px' },
  )
  observer.observe(continuation)
  return () => observer.disconnect()
})
</script>

<div
  id="contributed-features"
  class="border-border isolate overflow-hidden {layout === 'dashboard'
    ? '@3xl:flex @3xl:h-full @3xl:min-h-0 @3xl:flex-col'
    : 'border-b'}"
>
  <h3
    class="text-muted-foreground relative z-20 shrink-0 bg-[var(--form-workspace,var(--color-panel))] px-6 pt-5 pb-3 text-xs font-semibold tracking-wider uppercase"
  >
    {m.omni__title_features()}
  </h3>

  {#if userData?.contributedFeatures &&
    Object.keys(userData.contributedFeatures).length > 0}
    <div
      class="relative isolate overflow-hidden pr-2 pb-3 {layout === 'dashboard'
        ? '@3xl:min-h-0 @3xl:flex-1'
        : ''}"
    >
      <div
        class="space-y-0 overflow-y-auto {layout === 'dashboard'
          ? 'max-h-[75vh] @3xl:h-full @3xl:max-h-none'
          : 'max-h-105'}"
        bind:this={viewport}
      >
        <div bind:this={contents}>
          {#each contributions.groups as groupData (groupData.projectId)}
            {@const projectId = groupData.projectId}
            <div class="group-container" data-group-id={projectId}>
              <!-- Sticky Group Header -->
              <button
                type="button"
                class="bg-panel hover:bg-surface focus-visible:ring-focus sticky top-0 z-10 flex w-full items-center justify-between px-6 py-2.5 transition-colors focus-visible:ring-2 focus-visible:outline-none focus-visible:ring-inset"
                aria-expanded={!collapsedGroups.has(projectId)}
                onclick={() => toggleGroup(projectId)}
              >
                <div class="flex items-center gap-2">
                  <Icon
                    src={ChevronDown}
                    class="h-4 w-4 transition-transform duration-200 {collapsedGroups.has(
                      projectId,
                    )
                      ? '-rotate-90'
                      : ''}"
                  />
                  <p class="flex space-x-0.5 text-xs font-medium">
                    {#if groupData.hierarchy?.organisation}
                      <span class="text-primary"
                        >{model.getOrganisationName(
                          groupData.hierarchy.organisation,
                        )}</span
                      >
                    {/if}
                    {#if model.getProjectName(
                      groupData.hierarchy?.project,
                      Boolean(groupData.hierarchy?.organisation),
                    )}
                      <span class="px-0">›</span>
                      <span class="text-muted-foreground"
                        >{model.getProjectName(
                          groupData.hierarchy?.project,
                          Boolean(groupData.hierarchy?.organisation),
                        )}</span
                      >
                    {/if}
                  </p>
                </div>
                <div class="text-muted-foreground text-xs tabular-nums">
                  {groupData.total}
                </div>
              </button>

              <!-- Collapsible Group Members -->
              {#if !collapsedGroups.has(projectId)}
                <div
                  class="group-content space-y-2 py-2"
                  transition:slide={{ duration: 300 }}
                >
                  {#each groupData.entries as entry, index (entry.id)}
                    {#if entry.kind === 'private'}
                      {@const preview = entry.preview}
                      <div
                        class="w-full items-center gap-x-3 gap-y-1 px-6 py-2 {layout ===
                        'dashboard'
                          ? 'grid grid-cols-[auto_minmax(0,1fr)]'
                          : 'flex'}"
                      >
                        <Icon
                          src={MapPin}
                          class="text-base-content/60 h-5 w-5 shrink-0 stroke-[1.5px]"
                        />
                        <div class="flex min-w-0 flex-1 flex-col gap-1 text-sm">
                          {#if preview.address}
                            <span
                              class="text-muted-foreground text-xs break-words whitespace-normal"
                              >{preview.address}</span
                            >
                          {/if}
                          <span class="break-words">{preview.title}</span>
                        </div>
                        <div
                          class="flex shrink-0 flex-col gap-1.5 {layout === 'dashboard'
                            ? 'col-start-2 items-start'
                            : 'items-end'}"
                        >
                          <ContributionStatus status={preview.status} />
                          <span class="text-muted-foreground text-xs"
                            >{formatDistanceToNow(new Date(preview.createdAt), {
                              addSuffix: true,
                            })}</span
                          >
                        </div>
                      </div>
                    {:else}
                      {@const feature = entry.feature}
                      <a
                        href={`/features/${feature.id}`}
                        onclick={e => {
                          e.preventDefault()
                          model.onContributedFeature(
                            feature.id,
                            projectId,
                            groupData.features,
                            model.getProjectTitle(groupData.hierarchy?.project),
                            userData?.username ?? '',
                          )
                        }}
                        class="hover:bg-surface focus-visible:ring-focus w-full cursor-pointer items-center gap-x-3 gap-y-1 rounded-md px-6 py-2 text-left transition-colors focus-visible:ring-2 focus-visible:outline-none focus-visible:ring-inset {layout ===
                        'dashboard'
                          ? 'grid grid-cols-[auto_minmax(0,1fr)]'
                          : 'flex'}"
                      >
                        <Icon
                          src={MapPin}
                          class="text-base-content/60 h-5 w-5 stroke-[1.5px]"
                        />
                        <div
                          class="text-base-content flex min-w-0 flex-1 flex-col gap-0.5 text-sm"
                        >
                          {#if layout === 'dashboard'}
                            <span
                              class="text-base-content/60 text-xs break-words whitespace-normal"
                            >
                              {getFeatureDisplayAddress(
                                feature as FeatureFromCollection,
                              )}
                            </span>
                            <span class="break-words whitespace-normal">
                              {model.getFeatureName(feature as FeatureFromCollection)}
                            </span>
                          {:else}
                            <span class="text-base-content/60 text-xs"
                              ><ScrollableText
                                text={getFeatureDisplayAddress(
                                  feature as FeatureFromCollection,
                                )}
                              /></span
                            >
                            <ScrollableText
                              text={model.getFeatureName(
                                feature as FeatureFromCollection,
                              )}
                            />
                          {/if}
                        </div>
                        {#if layout === 'dashboard' && !feature.isPublished}
                          <span class="text-muted-foreground col-start-2 text-xs"
                            >Unpublished</span
                          >
                        {/if}
                        {#if shouldShowDate(groupData.entries, index) &&
                          feature.createdAt}
                          <div
                            class="text-muted-foreground shrink-0 text-xs {layout ===
                            'dashboard'
                              ? 'col-start-2'
                              : ''}"
                          >
                            {formatDistanceToNow(new Date(feature.createdAt), {
                              addSuffix: true,
                            })}
                          </div>
                        {/if}
                      </a>
                    {/if}
                  {/each}
                </div>
              {/if}
            </div>
          {/each}
          {#if contributions.loading}
            <div
              role="status"
              aria-label={m.resource_loading()}
              class="space-y-4 px-6 py-3"
            >
              {#each Array(5) as _}
                <div
                  aria-hidden="true"
                  class="animate-pulse space-y-2 motion-reduce:animate-none"
                >
                  <div class="bg-muted h-3 w-2/3 rounded"></div>
                  <div class="bg-muted h-2 w-1/2 rounded"></div>
                </div>
              {/each}
            </div>
          {/if}
          {#if contributions.failed}
            <p role="alert" class="text-error px-6 py-3 text-sm">
              {m.due_candid_mole_imagine()}
            </p>
          {/if}
          {#if contributions.hasMore && contributions.failed}
            <button
              type="button"
              class="border-border hover:bg-surface mx-6 my-3 rounded-md border px-3 py-2 text-sm disabled:opacity-60"
              disabled={contributions.loading}
              onclick={() => contributions.loadMore()}
            >
              {m.resource_retry()}
            </button>
          {/if}
          {#if contributions.hasMore}
            <div
              bind:this={continuation}
              aria-hidden="true"
              class="h-px"
              data-contribution-continuation
            ></div>
          {/if}
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
    <div class="text-base-content/60 flex items-center justify-center p-4">
      <span class="text-sm">{m.wide_front_jackdaw_forgive()}</span>
    </div>
  {/if}
</div>
