<script lang="ts">
// SVELTE
import { page } from '$app/state'
// ADAPTERS
import { useImageProviderModel } from '$lib/adapters/image'
// BITS
import { FeatureCard } from '$lib/bits'
// NAVIGATION
import { getCollectionDescriptorFromSearchParams } from '$lib/navigation'
// PROVIDERS
import ImageProvider from '$lib/providers/ImageProvider.svelte'
// import FullScreenCarousel from '$lib/components/modals/FullScreenCarousel.svelte'
// CONTEXT
import { getAppCtx } from '$lib/context/app.svelte'
import { getOmniCtx } from '$lib/context/omni.svelte'
import { getCardCtx, setCardCtx } from '$lib/context/card.svelte'
// ENUMS
import { ImageContextResource, OmniMode } from '$lib/enums'
// TYPES
import type { ImageCtxEnvelope } from '$lib/db/zod/schema/image.types'
import type { Feature } from '$lib/db/zod/schema/feature.types'

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
let feature: Feature | undefined = $state()!

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

const loadFeatureAndSetContext = async () => {
  const id = page.params.id
  if (!id) return

  if (omniCtx.isIntentionallyClosing) {
    return
  }

  const routeCollection = getCollectionDescriptorFromSearchParams(page.url.searchParams)
  const isColdStart = omniCtx.isColdStart(id)

  // 1. Set featureId for consistency
  featureId = id
  // 2. Load the fresh feature data
  const loadedFeature = await appCtx.getFeatureById(id)
  // 3. Update the feature state atomically
  feature = loadedFeature as Feature

  // Rehydrate collection-backed feature routes from the URL so collection
  // navigation survives refreshes and direct deep links.
  if (routeCollection && !hasActiveCollectionContext(id, routeCollection)) {
    const didInitCollection = omniCtx.initCollectionFromDescriptor(routeCollection, {
      activeFeatureId: id,
      focus: false,
      focusFeature: false,
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
    })
  } else if (appCtx.getActiveFeature()?.id !== id) {
    appCtx.setActiveFeature(id, {
      focus: false,
      openCard: false,
    })
  }
}

// Load feature in effect to avoid component hierarchy destruction
$effect(() => {
  if (!page.params.id) {
    return
  }
  loadFeatureAndSetContext()
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
      ? {
          ctxType: ImageContextResource.feature,
          ctxId: featureId,
          organisation: appCtx.getHierarchySync(feature).organisation as never,
          project: appCtx.getHierarchySync(feature).project as never,
        }
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
