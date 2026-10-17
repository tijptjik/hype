<script lang="ts">
// SVELTE
import { untrack } from 'svelte'
// SVELTEKIT
import { page } from '$app/state'
// ADAPTERS
import { useImageProviderModel } from '#lib/adapters/image/index.js'
// BITS
import { FeatureCard } from '#lib/bits/index.js'
// NAVIGATION
import { getCollectionDescriptorFromSearchParams } from '#lib/navigation/index.js'
// PROVIDERS
import ImageProvider from '#lib/providers/ImageProvider.svelte'
// import FullScreenCarousel from '#lib/components/modals/FullScreenCarousel.svelte'
// CONTEXT
import { getAppCtx } from '#lib/context/app.svelte.js'
import { getOmniCtx } from '#lib/context/omni.svelte.js'
import { getCardCtx, setCardCtx } from '#lib/context/card.svelte.js'
// ENUMS
import { ImageContextResource, OmniMode } from '#lib/enums.js'
// TYPES
import type { ImageCtxEnvelope } from '#lib/db/zod/schema/image.types.js'
import type { Feature } from '#lib/db/zod/schema/feature.types.js'

// PARAMS
let featureId = $state(page.params.id ?? '')

// CONTEXT
const appCtx = getAppCtx()
const omniCtx = getOmniCtx()

// CONTEXT :: FEATURE CARD
setCardCtx()
const cardCtx = getCardCtx()
omniCtx.setCardCtx(cardCtx)

// Use state instead of async derived to prevent component destruction
let feature: Feature | undefined = $state()

// ═══════════════════════
// 1. LOADING
// ═══════════════════════

/**
 * Detect whether the current feature route is fully backed by an already-active collection flow.
 *
 * @param id - Feature id from the route.
 * @param routeCollection - Collection descriptor from the current URL, when present.
 * @returns Whether the active collection and active feature already match the route context.
 */
const hasActiveCollectionContext = (
  id: string,
  routeCollection: ReturnType<typeof getCollectionDescriptorFromSearchParams>,
): boolean => {
  const activeCollection = appCtx.getActiveCollection()
  const activeFeature = appCtx.getActiveFeature()
  if (!activeCollection || activeCollection.type === 'feature') {
    return false
  }

  if (
    routeCollection &&
    (activeCollection.type !== routeCollection.kind ||
      activeCollection.id !== routeCollection.ref)
  ) {
    return false
  }

  if (activeFeature?.id !== id) {
    return false
  }

  return activeCollection.items.some(item => item.id === id)
}

/**
 * Derives a URL-safe collection descriptor from the current in-memory collection.
 *
 * @returns Serializable collection descriptor or `null` for standalone features.
 */
const getCollectionDescriptorFromActiveCollection = (): ReturnType<
  typeof getCollectionDescriptorFromSearchParams
> => {
  const activeCollection = appCtx.getActiveCollection()
  if (
    !activeCollection ||
    (activeCollection.type !== 'neighbourhood' && activeCollection.type !== 'walk')
  ) {
    return null
  }

  return {
    kind: activeCollection.type,
    ref: activeCollection.id,
  }
}

/**
 * Refreshes a card mounted from retained collection data.
 * @param id - Feature id whose authoritative snapshot should replace the preview.
 * @returns Nothing; stale results are discarded when route selection changes.
 */
function refreshFeatureSnapshot(id: string): void {
  void appCtx
    .getFeatureById(id)
    .then(refreshedFeature => {
      if (
        !refreshedFeature ||
        page.params.id !== id ||
        featureId !== id ||
        omniCtx.isIntentionallyClosing
      ) {
        return
      }

      feature = refreshedFeature as Feature
    })
    .catch(console.error)
}

/**
 * Loads one route snapshot and aligns feature selection without rewriting that route.
 * @param id - Feature id captured by the route effect.
 * @param routeCollection - Collection descriptor captured from the same URL snapshot.
 * @returns Completion after the current route context has been initialized.
 */
const loadFeatureAndSetContext = async (
  id: string,
  routeCollection: ReturnType<typeof getCollectionDescriptorFromSearchParams>,
): Promise<void> => {
  if (omniCtx.isIntentionallyClosing) {
    return
  }

  const isColdStart = omniCtx.isColdStart(id)

  // Clear the previous marker while this route resolves; retain collection navigation context.
  if (appCtx.selection.featureId !== id) appCtx.resetActiveFeature()

  // 1. Set featureId for consistency
  featureId = id
  // 2. Mount retained map or collection data immediately; direct routes still
  // wait for their first authoritative read because they have no cached row.
  const cachedFeature = await appCtx.getFeatureById(id, false)
  if (page.params.id !== id || omniCtx.isIntentionallyClosing) return
  if (cachedFeature) {
    feature = cachedFeature as Feature
    refreshFeatureSnapshot(id)
  } else {
    const loadedFeature = await appCtx.getFeatureById(id)
    if (page.params.id !== id || omniCtx.isIntentionallyClosing) return
    feature = loadedFeature as Feature
  }

  // Rehydrate collection-backed feature routes from the URL so collection
  // navigation survives refreshes and direct deep links.
  if (routeCollection && !hasActiveCollectionContext(id, routeCollection)) {
    const didInitCollection = omniCtx.initCollectionFromDescriptor(routeCollection, {
      activeFeatureId: id,
      focus: false,
      focusFeature: false,
      updateUrl: false,
    })

    if (didInitCollection) {
      return
    }
  }

  // Align the omnibar mode with the current route context so collection-backed
  // feature routes stay in collection navigation.
  if (hasActiveCollectionContext(id, routeCollection)) {
    const effectiveCollectionDescriptor =
      routeCollection ?? getCollectionDescriptorFromActiveCollection()

    if (effectiveCollectionDescriptor) {
      omniCtx.setActiveCollectionDescriptor(effectiveCollectionDescriptor)
    }

    if (omniCtx.state.mode !== OmniMode.navigation) {
      omniCtx.setMode(OmniMode.navigation, { openCard: false })
    }
  } else if (omniCtx.state.mode !== OmniMode.feature) {
    omniCtx.setMode(OmniMode.feature, { openCard: false })
  }

  if (isColdStart) {
    // Cold start: initialize the feature with card open
    // Prevent navigation since we're already on the feature page
    await omniCtx.initFeature(id, {
      focus: false,
      updateUrl: false,
    })
  } else if (appCtx.getActiveFeature()?.id !== id) {
    appCtx.setActiveFeature(id, {
      focus: false,
      openCard: false,
      updateUrl: false,
    })
  }
}

// Load feature in effect to avoid component hierarchy destruction
$effect(() => {
  const id = page.params.id
  if (!id) return

  const routeCollection = getCollectionDescriptorFromSearchParams(page.url.searchParams)
  untrack(() => {
    void loadFeatureAndSetContext(id, routeCollection)
  })
})

const imageProviderProps = $derived({
  isAdminMode: false,
  // Only provide valid props when feature and featureId match
  // This prevents intermediate mismatched state during navigation
  isValid: feature?.id === featureId,
  image:
    feature?.id === featureId
      ? ((feature.image as ImageCtxEnvelope | null) ?? null)
      : undefined,
  images:
    feature?.id === featureId
      ? ((feature.images as ImageCtxEnvelope[] | null) ?? null)
      : undefined,
  context:
    feature?.id === featureId && feature
      ? (() => {
          const hierarchy = appCtx.getHierarchySync(feature)

          return {
            ctxType: ImageContextResource.feature,
            ctxId: featureId,
            organisation: hierarchy.organisation
              ? {
                  id: hierarchy.organisation.id,
                  code: hierarchy.organisation.code,
                }
              : undefined,
            project: hierarchy.project
              ? {
                  id: hierarchy.project.id,
                  organisationId: hierarchy.project.organisationId,
                  code: hierarchy.project.code,
                }
              : undefined,
          }
        })()
      : undefined, // Don't provide mismatched context during transitions
})
const imageProviderModel = useImageProviderModel(
  () => page,
  () => imageProviderProps,
)
</script>

{#if appCtx}
  {#if feature}
    <ImageProvider model={imageProviderModel}>
      <FeatureCard feature={feature as Feature} />
    </ImageProvider>
  {/if}
{:else}
  <div class="absolute inset-0 flex items-center justify-center rounded-lg bg-base-300">
    <div class="loading loading-ring loading-lg text-primary"></div>
  </div>
{/if}
