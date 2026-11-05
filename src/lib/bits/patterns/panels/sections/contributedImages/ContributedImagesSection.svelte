<script lang="ts">
// SVELTE
import { fade, slide } from 'svelte/transition'
import { SvelteSet } from 'svelte/reactivity'
// I18N
import { m } from '#lib/i18n.js'
// COMPONENTS
import ContributionStatus from '../components/ContributionStatus.svelte'
import { Icon } from '#lib/bits/index.js'
import ChevronDown from 'virtual:icons/proicons/chevron-down'
import { Scrollbar } from '#lib/bits/custom/scrollbar/index.js'
// ADAPTERS
import { useContributedImages } from '#lib/adapters/panels/useContributedImages.svelte.js'
// TYPES
import type { UserProfile } from '#lib/db/zod/schema/user.types.js'
import type { UserContributionsModel } from '#lib/adapters/panels/userContributions.js'

// PROPS
let {
  userData,
  model,
  fillHeight = false,
}: {
  userData: UserProfile
  model: UserContributionsModel
  fillHeight?: boolean
} = $props()
// SCROLLBAR
let viewport: HTMLDivElement | null = $state(null)
let contents: HTMLDivElement | undefined = $state()
// GROUPING
const collapsedGroups = new SvelteSet<string>()
const loadedThumbnails = new SvelteSet<string>()
const contributions = useContributedImages(
  () => userData,
  () => model,
)
// Grouping only controls visibility; the next page remains a bounded explicit read.
const toggleGroup = (projectId: string): void => {
  if (collapsedGroups.has(projectId)) collapsedGroups.delete(projectId)
  else collapsedGroups.add(projectId)
}
</script>

<div
  id="contributed-images"
  class="border-border isolate overflow-hidden {fillHeight
    ? '@3xl:flex @3xl:h-full @3xl:min-h-0 @3xl:flex-col'
    : 'border-b'}"
>
  <h3
    class="text-muted-foreground relative z-20 shrink-0 bg-[var(--form-workspace,var(--color-panel))] px-6 pt-5 pb-3 text-xs font-semibold tracking-wider uppercase"
  >
    {m.filters__image()}
  </h3>

  {#if userData?.contributedImages && typeof userData.contributedImages === 'object'}
    <div
      class="relative isolate overflow-hidden pr-2.25 pb-3 {fillHeight
        ? '@3xl:min-h-0 @3xl:flex-1'
        : ''}"
    >
      <div
        class="max-h-[75vh] space-y-0 overflow-auto {fillHeight
          ? '@3xl:h-full @3xl:max-h-none'
          : ''}"
        bind:this={viewport}
      >
        <div bind:this={contents}>
          {#each contributions.groups as group (group.projectId)}
            {@const projectId = group.projectId}
            {@const imageIds = group.imageIds}
            <div class="group-container">
              <!-- Sticky Group Header -->
              <button
                type="button"
                class="border-border/10 bg-panel hover:bg-surface focus-visible:ring-focus sticky top-0 z-10 flex w-full items-center justify-between border-b px-6 py-2.5 transition-colors focus-visible:ring-2 focus-visible:outline-none focus-visible:ring-inset"
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
                    {#if group.hierarchy.organisation}
                      <span class="text-primary"
                        >{model.getOrganisationName(group.hierarchy.organisation)}</span
                      >
                    {/if}
                    {#if model.getProjectName(
                      group.hierarchy.project,
                      Boolean(group.hierarchy.organisation),
                    )}
                      <span class="px-0">›</span>
                      <span class="text-muted-foreground"
                        >{model.getProjectName(
                          group.hierarchy.project,
                          Boolean(group.hierarchy.organisation),
                        )}</span
                      >
                    {/if}
                  </p>
                </div>
                <div class="text-muted-foreground text-xs tabular-nums">
                  {group.total}
                </div>
              </button>

              <!-- Collapsible Group Images -->
              {#if !collapsedGroups.has(projectId)}
                <div class="py-2" transition:slide={{ duration: 300 }}>
                  <div class="grid grid-cols-2 gap-2 px-6 sm:grid-cols-3">
                    {#each imageIds as imageId (imageId)}
                      <a
                        class="relative isolate aspect-square {userData
                          .privateContributions?.images[imageId]
                          ? 'cursor-default'
                          : 'cursor-pointer'} overflow-hidden rounded-md border border-border bg-surface transition-opacity hover:opacity-80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus"
                        data-image-id={imageId}
                        href={contributions.images.get(imageId)?.href}
                        onclick={async e => {
                          e.preventDefault()
                          e.stopPropagation()
                          if (userData.privateContributions?.images[imageId]) return
                          const image = contributions.images.get(imageId)
                          if (image?.featureId) {
                            model.onContributedImage(
                              image.featureId,
                              projectId,
                              imageId,
                              model.getProjectTitle(group.hierarchy.project),
                              userData.username ?? '',
                              contributions.images,
                              userData.contributedImages,
                            )
                          }
                        }}
                      >
                        {#if userData.privateContributions?.images[imageId]}
                          <span
                            class="pointer-events-none absolute inset-x-0 bottom-0 z-10 flex justify-center p-1"
                          >
                            <ContributionStatus
                              status={userData.privateContributions.images[imageId]
                                .status}
                            />
                          </span>
                        {/if}
                        {#if !loadedThumbnails.has(
                          contributions.images.get(imageId)?.url ?? '',
                        )}
                          <span
                            aria-hidden="true"
                            class="bg-muted absolute inset-0 animate-pulse motion-reduce:animate-none"
                          >
                            <span
                              class="bg-muted-foreground/15 absolute inset-x-4 bottom-4 h-3 rounded"
                            ></span>
                          </span>
                        {/if}
                        {#if contributions.images.has(imageId)}
                          <img
                            src={contributions.images.get(imageId)?.url}
                            alt=""
                            class="h-full w-full object-cover transition-opacity duration-200"
                            loading="lazy"
                            onload={() =>
                              loadedThumbnails.add(
                                contributions.images.get(imageId)?.url ?? '',
                              )}
                            onerror={() =>
                              loadedThumbnails.add(
                                contributions.images.get(imageId)?.url ?? '',
                              )}
                            in:fade={{ duration: 200 }}
                          >
                        {/if}
                      </a>
                    {/each}
                  </div>
                </div>
              {/if}
            </div>
          {/each}
          {#if contributions.loading}
            <div
              role="status"
              aria-label={m.resource_loading()}
              class="grid grid-cols-2 gap-2 px-6 py-2 sm:grid-cols-3"
            >
              {#each Array(6) as _}
                <div
                  aria-hidden="true"
                  class="bg-muted aspect-square animate-pulse rounded-md motion-reduce:animate-none"
                >
                  <div class="bg-muted-foreground/15 mx-4 mt-4 h-3 w-1/2 rounded"></div>
                </div>
              {/each}
            </div>
          {/if}
          {#if contributions.failed}
            <p role="alert" class="text-muted-foreground px-6 py-2 text-sm">
              {m.due_candid_mole_imagine()}
            </p>
          {/if}
          {#if contributions.hasMore && !contributions.loading}
            <button
              type="button"
              class="border-border hover:bg-surface mx-6 my-3 rounded-md border px-3 py-2 text-sm"
              onclick={() => contributions.loadMore()}
            >
              {contributions.failed ? m.resource_retry() : m.resource_load_more()}
            </button>
          {/if}
        </div>
      </div>
      <Scrollbar
        {viewport}
        {contents}
        alwaysVisible={false}
        margin={{ right: 4, top: 45 }}
        width={{ track: 8, thumb: 4, thumbActive: 8 }}
        opacity={{ track: 0.3, thumb: 0.6, thumbActive: 0.8 }}
      />
    </div>
  {:else}
    <div class="text-base-content/60 flex items-center justify-center p-4">
      <span class="text-sm">{m.dirty_bland_hornet_reside()}</span>
    </div>
  {/if}
</div>
