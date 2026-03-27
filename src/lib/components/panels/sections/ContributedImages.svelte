<script lang="ts">
// SVELTE
import { fade, slide } from 'svelte/transition'
import { SvelteMap, SvelteSet } from 'svelte/reactivity'
// I18N
import { m } from '$lib/i18n'
import { getI18n } from '$lib/i18n'
// CONTEXT
import { getAppCtx } from '$lib/context/app.svelte'
import { getOmniCtx } from '$lib/context/omni.svelte'
// COMPONENTS
import Icon from '$lib/components/common/Icon.svelte'
import ChevronDown from 'virtual:icons/lucide/chevron-down'
import { Scrollbar } from '$lib/bits/custom/scrollbar'
// REMOTE
import { getImagesForIds } from '$lib/api/server/image.remote'
// SERVICES
import { getURLfromImage } from '$lib/client/services/image'
// NAVIGATION
import { navigateToContributedImage } from '$lib/navigation'
// TYPES
import type { Id, ResourceContext } from '$lib/types'
import type { ImageContextEnvelope } from '$lib/db/zod/schema/image.types'
import type { Project } from '$lib/db/zod/schema/project.types'
import type { UserPreferences, UserProfile } from '$lib/db/zod/schema/user.types'
import { untrack } from 'svelte'

// MAGICAL CONSTANTS
const BATCH_SIZE = 24
const TRIGGER_POSITION = 12 // Load next batch when 12th image becomes visible

// CONTEXT
const appCtx = getAppCtx()
const omniCtx = getOmniCtx()

// PROPS
type Props = {
  userData: UserProfile
}

let { userData }: Props = $props()

// SCROLLBAR
let viewport: HTMLDivElement | null = $state(null)
let contents: HTMLDivElement | undefined = $state()

type Hierarchy = Record<Id, ResourceContext>

// GROUPING
let hierarchies: Hierarchy | null = $state(null)

$effect(() => {
  if (userData?.contributedImages) {
    untrack(() => {
      getHierarchiesFromUserData(userData).then(result => {
        hierarchies = result
      })
    })
  }
})

let collapsedGroups = $state<SvelteSet<Id>>(new SvelteSet())

let projectImageIds = $derived<Record<Id, Id[]>>(userData.contributedImages) // Map of projectId -> imageIds
let projectGroups = $derived<Id[]>(Object.keys(userData.contributedImages)) // Ordered list of project IDs
let projectLoadProgress = $state<Record<Id, number>>({}) // Track how many images loaded per project

// INFINITE SCROLL :: STATE
type ContributedImage = ImageContextEnvelope['image'] & {
  featureId?: Id
  href?: string
  url: string
}

let loadedImages: SvelteMap<Id, ContributedImage> = $state(new SvelteMap())
let currentBatchIndex = $state(0)
let isLoadingBatch = $state(false)
let hasMoreImages = $state(true)
let isInitializing = $state(false)
let isInitialized = $state(false)
let lastUserDataId = $state<string | null>(null)

// INFINITE SCROLL :: OBSERVER
let intersectionObserver: IntersectionObserver | null = null

// INFINITE SCROLL :: ELEMENTS
let currentTriggerElement: HTMLElement | null = null

// ================================
// LOADING
// ================================

$effect(() => {
  if (userData?.contributedImages && !isInitializing) {
    // How many images did the user contribute across all (or all selected) projects?
    const totalImages = getTotalImagesFromUserData(userData)
    // Create a stable identifier for userData to detect real changes
    const userDataId = `${userData.id}-${totalImages}`

    // Prevent infinite loops - only reinitialize if userData actually changed
    // Prevent concurrent initialization
    if ((userDataId === lastUserDataId && isInitialized) || isInitializing) {
      return
    }

    isInitializing = true

    // Reset state when userData actually changes
    resetState(userDataId)

    // Initialize project-grouped state
    resetLoadProgress(userData)

    // Only set hasMoreImages to true if we actually have more than one batch worth
    hasMoreImages = totalImages > BATCH_SIZE

    // Setup intersection observer first (only if we'll need it)
    if (hasMoreImages) {
      setupIntersectionObserver()
    }

    // Load first batch and then clear initializing flag
    loadNextBatch().finally(() => {
      isInitializing = false
    })
  }

  return () => {
    if (intersectionObserver) {
      intersectionObserver.disconnect()
    }
  }
})

const loadNextBatch = async () => {
  if (!userData?.contributedImages || isLoadingBatch || projectGroups.length === 0)
    return

  isLoadingBatch = true

  // Stop observing the current trigger
  if (currentTriggerElement && intersectionObserver) {
    intersectionObserver.unobserve(currentTriggerElement)
    currentTriggerElement = null
  }

  try {
    // Find next batch of images to load across visible projects only
    const batchIds: string[] = []
    let remainingBatchSize = BATCH_SIZE

    for (const projectId of projectGroups) {
      if (remainingBatchSize <= 0) break

      // Skip collapsed groups - don't load their images
      if (collapsedGroups.has(projectId)) {
        continue
      }

      const projectImages = projectImageIds[projectId] || []
      const alreadyLoaded = projectLoadProgress[projectId] || 0
      const availableFromProject = projectImages.length - alreadyLoaded

      if (availableFromProject > 0) {
        const takeFromProject = Math.min(remainingBatchSize, availableFromProject)
        const projectBatch = projectImages.slice(
          alreadyLoaded,
          alreadyLoaded + takeFromProject,
        )
        batchIds.push(...projectBatch)
        projectLoadProgress[projectId] = alreadyLoaded + takeFromProject
        remainingBatchSize -= takeFromProject
      }
    }

    if (batchIds.length === 0) {
      hasMoreImages = false
      return
    }

    const batchResult = await getImagesForIds({
      ids: batchIds,
      meta: { isAdminRequest: true },
    })
    const batchImages = batchResult?.data ?? []

    const processedImages = batchImages
      .map((entity: ImageContextEnvelope) => {
        const featureId = entity.ctxType === 'feature' ? entity.ctxId : undefined
        const image = {
          ...entity.image,
          ...(featureId ? { featureId } : {}),
        }
        return {
          ...image,
          url: getURLfromImage({
            image: entity,
            transformation: 'c_fill,h_256,w_256',
            quality: 'auto',
          }),
          href: featureId ? `/features/${featureId}` : undefined,
        }
      })
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())

    for (const img of processedImages) {
      loadedImages.set(img.id as Id, img)
    }

    // Check if there are more images to load from visible projects only
    const visibleTotalImages = getVisibleImageCount()
    const visibleLoadedImages = getVisibleLoadedImageCount()
    hasMoreImages = visibleLoadedImages < visibleTotalImages

    if (hasMoreImages) {
      setTimeout(() => {
        setupNextTrigger()
      }, 200)
    }
  } catch (error) {
    console.error('Failed to load image batch:', error)
  } finally {
    isLoadingBatch = false
  }
}

// ================================
// LOADING :: UTILS
// ================================

async function getHierarchiesFromUserData(
  userData: UserProfile,
): Promise<Record<Id, ResourceContext>> {
  if (
    !userData.contributedImages ||
    Object.keys(userData.contributedImages).length === 0
  ) {
    return {}
  }

  const hierarchyData = await Promise.all(
    Object.keys(userData.contributedImages).map(async id => {
      const project = (await appCtx.getProjectById(id as Id)) as Project
      const hierarchy = await appCtx.getHierarchy(project)
      return { id, hierarchy }
    }),
  )
  return hierarchyData.reduce(
    (acc, curr) => {
      acc[curr.id] = curr.hierarchy
      return acc
    },
    {} as Record<Id, ResourceContext>,
  )
}

function getTotalImagesFromUserData(userData: UserProfile): number {
  return Object.values(userData.contributedImages as Record<string, string[]>).reduce(
    (sum: number, ids: string[]) => sum + ids.length,
    0,
  )
}

// ================================
// LOADING :: RESET
// ================================

function resetState(userDataId: string) {
  loadedImages = new SvelteMap()
  currentBatchIndex = 0
  currentTriggerElement = null
  isInitialized = true
  lastUserDataId = userDataId
}

function resetLoadProgress(userData: UserProfile) {
  projectLoadProgress = Object.keys(userData.contributedImages).reduce(
    (acc, projectId) => {
      acc[projectId] = 0
      return acc
    },
    {} as Record<string, number>,
  )
}

// ================================
// HELPERS
// ================================

const getVisibleImageCount = (): number => {
  let count = 0
  for (const projectId of projectGroups) {
    if (!collapsedGroups.has(projectId)) {
      const projectImages = projectImageIds[projectId] || []
      count += projectImages.length
    }
  }
  return count
}

const getVisibleLoadedImageCount = (): number => {
  let count = 0
  for (const projectId of projectGroups) {
    if (!collapsedGroups.has(projectId)) {
      const projectImages = projectImageIds[projectId] || []
      // Count how many of this project's images are actually loaded
      for (const imageId of projectImages) {
        if (loadedImages.has(imageId)) {
          count++
        }
      }
    }
  }
  return count
}

// ================================
// HANDLERS
// ================================

// Grouping
const toggleGroup = (projectId: string) => {
  const wasCollapsed = collapsedGroups.has(projectId)

  if (wasCollapsed) {
    collapsedGroups.delete(projectId)
  } else {
    collapsedGroups.add(projectId)
  }

  // Reset intersection observer since the observed element may have been unmounted
  if (intersectionObserver && currentTriggerElement) {
    intersectionObserver.unobserve(currentTriggerElement)
    currentTriggerElement = null
  }

  // Calculate how many images should be visible with current group state
  const visibleImageCount = getVisibleImageCount()
  const visibleLoadedImageCount = getVisibleLoadedImageCount()

  // If we just expanded a group, check if that specific group needs more images
  let shouldLoadForExpandedGroup = false
  if (wasCollapsed) {
    // Group was just expanded - check if it has unloaded images
    const projectImages = projectImageIds[projectId] || []
    const alreadyLoaded = projectLoadProgress[projectId] || 0
    const availableFromProject = projectImages.length - alreadyLoaded
    shouldLoadForExpandedGroup = availableFromProject > 0
  }

  // Update hasMoreImages based on current visible state
  const visibleTotalImages = getVisibleImageCount()
  const currentVisibleLoadedImages = getVisibleLoadedImageCount()
  hasMoreImages = currentVisibleLoadedImages < visibleTotalImages

  // If we have fewer visible loaded images than should be visible, OR if we just expanded a group that needs more images
  if (
    (visibleLoadedImageCount < visibleImageCount && hasMoreImages) ||
    shouldLoadForExpandedGroup
  ) {
    loadNextBatch()
  } else {
    // Set up observer for the new state
    setupNextTrigger()
  }
}

// ================================
// INTERACTIONS
// ================================

const setupIntersectionObserver = () => {
  if (intersectionObserver) {
    intersectionObserver.disconnect()
  }

  intersectionObserver = new IntersectionObserver(
    entries => {
      entries.forEach(entry => {
        if (entry.isIntersecting && !isLoadingBatch && hasMoreImages) {
          loadNextBatch()
        }
      })
    },
    { threshold: 0.1 },
  )
}

// Set up the next trigger element for infinite scroll
const setupNextTrigger = () => {
  if (!intersectionObserver || !hasMoreImages) return

  // Don't set up a new trigger if we already have one active
  if (currentTriggerElement) return

  // Get all visible image IDs in the same order as rendered in DOM (excluding collapsed groups)
  const allImageIds: string[] = []
  for (const projectId of projectGroups) {
    if (!collapsedGroups.has(projectId)) {
      const projectImages = projectImageIds[projectId] || []
      allImageIds.push(...projectImages)
    }
  }

  // Find the trigger position (12th image from the end of loaded images)
  // We need to find loaded images within the allImageIds array, not just use loadedImages.size
  const loadedImageIds = allImageIds.filter(id => loadedImages.has(id))
  const triggerIndex = Math.max(0, loadedImageIds.length - TRIGGER_POSITION)
  const triggerImageId = loadedImageIds[triggerIndex]

  if (triggerImageId && loadedImages.has(triggerImageId)) {
    // Use a more robust DOM query with a small delay to ensure elements are rendered
    setTimeout(() => {
      const triggerElement = document.querySelector(
        `[data-image-id="${triggerImageId}"]`,
      ) as HTMLElement

      if (triggerElement && viewport) {
        const containerRect = viewport.getBoundingClientRect()
        const triggerRect = triggerElement.getBoundingClientRect()
        const relativeTop = triggerRect.top - containerRect.top

        if (relativeTop <= 0) {
          // The trigger is already passed, fire immediately
          loadNextBatch()
        } else {
          // Observe as usual
          if (intersectionObserver) {
            intersectionObserver.observe(triggerElement)
            currentTriggerElement = triggerElement
          }
        }
      } else {
        // Retry once more if element not found
        setTimeout(() => {
          const retryElement = document.querySelector(
            `[data-image-id="${triggerImageId}"]`,
          ) as HTMLElement
          if (retryElement && intersectionObserver) {
            intersectionObserver.observe(retryElement)
            currentTriggerElement = retryElement
          }
        }, 100)
      }
    }, 50)
  } else {
    // If no trigger is found but we have more images, try loading the next batch anyway
    if (hasMoreImages && loadedImageIds.length > 0) {
      setTimeout(() => loadNextBatch(), 500)
    }
  }
}
</script>

<div id="contributed-images" class="border-b border-base-300">
  <h3
    class="p-4 pb-2 text-sm font-semibold uppercase tracking-wide text-base-content/60"
  >
    {m.filters__image()}
  </h3>

  {#if userData?.contributedImages && typeof userData.contributedImages === 'object'}
    <div class="relative pb-3 pr-2.25">
      <div class="max-h-[75vh] space-y-0 overflow-auto" bind:this={viewport}>
        {#each Object.entries(userData.contributedImages) as [ projectId, imageIds ] (projectId)}
          <div class="group-container px-1" bind:this={contents}>
            <!-- Sticky Group Header -->
            <button
              class="sticky top-0 z-10 flex w-full items-center justify-between border-b border-base-300/10 bg-black px-4 py-2 transition-colors"
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
                <p class="flex space-x-0.5 font-mono text-xs uppercase tracking-widest">
                  {#if hierarchies?.[projectId]?.organisation}
                    <span class="text-primary"
                      >{appCtx.getContextualOrganisationName(
                        hierarchies?.[projectId]?.organisation,
                        false
                      )}</span
                    >
                  {/if}
                  {#if appCtx.getContextualProjectName(hierarchies?.[projectId]?.project)}
                    <span class="px-0">›</span>
                    <span class="text-accent"
                      >{appCtx.getContextualProjectName(
                        hierarchies?.[projectId]?.project
                      )}</span
                    >
                  {/if}
                </p>
              </div>
              <div
                class="text-sm text-base-content/60"
                style="font-family: 'Tilt Neon', sans-serif"
              >
                {imageIds.length}
              </div>
            </button>

            <!-- Collapsible Group Images -->
            {#if !collapsedGroups.has(projectId)}
              <div class="py-2" transition:slide={{ duration: 300 }}>
                <div class="grid grid-cols-2 gap-2 pl-4 pr-2 sm:grid-cols-3">
                  {#each imageIds as imageId, idx (imageId)}
                    <a
                      class="aspect-square cursor-pointer overflow-hidden rounded bg-base-200 transition-transform hover:scale-105"
                      data-image-id={imageId}
                      href={loadedImages.get(imageId)?.href}
                      onclick={async (e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        const image = loadedImages.get(imageId);
                        if (image?.featureId) {
                          navigateToContributedImage(
                            appCtx,
                            omniCtx,
                            image.featureId,
                            projectId,
                            imageId,
                            getI18n(hierarchies?.[projectId]?.project, 'name', {
                              allowMachineTranslation: true
                            } as UserPreferences)!,
                            userData?.username!,
                            loadedImages,
                            projectImageIds
                          );
                        } else {
                          // Fallback: If image not in loadedImages but is visible, try to load it
                          try {
                            const fallbackResult = await getImagesForIds({
                              ids: [imageId],
                              meta: { isAdminRequest: true }
                            });
                            const fallbackEntity = fallbackResult?.data?.[0] as
                              | ImageContextEnvelope
                              | undefined;
                            const fallbackFeatureId = fallbackEntity?.ctxType === 'feature'
                              ? fallbackEntity.ctxId
                              : undefined;
                            if (fallbackEntity?.image && fallbackFeatureId) {
                              const fallbackImage = {
                                ...fallbackEntity.image,
                                featureId: fallbackFeatureId
                              };
                              // Add to loadedImages for future use
                              const processedImage = {
                                ...fallbackImage,
                                url: getURLfromImage({
                                  image: fallbackEntity,
                                  transformation: 'c_fill,h_256,w_256',
                                  quality: 'auto'
                                }),
                                href: `/features/${fallbackFeatureId}`
                              };
                              loadedImages.set(imageId as Id, processedImage);

                              navigateToContributedImage(
                                appCtx,
                                omniCtx,
                                fallbackFeatureId,
                                projectId,
                                imageId,
                                getI18n(hierarchies?.[projectId]?.project, 'name', {
                                  allowMachineTranslation: true
                                } as UserPreferences)!,
                                userData?.username!,
                                loadedImages,
                                projectImageIds
                              );
                            }
                          } catch (_error) {
                            // Silently handle errors for fallback loading
                          }
                        }
                      }}
                    >
                      {#if loadedImages.has(imageId)}
                        <img
                          src={loadedImages.get(imageId)?.url}
                          alt=""
                          class="h-full w-full object-cover transition-opacity duration-200"
                          loading="lazy"
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
    <div class="flex items-center justify-center p-4 text-base-content/60">
      <span class="text-sm">{m.dirty_bland_hornet_reside()}</span>
    </div>
  {/if}
</div>
