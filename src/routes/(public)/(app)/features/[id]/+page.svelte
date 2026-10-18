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

// CONTEXT
const appCtx = getAppCtx()
const omniCtx = getOmniCtx()

// CONTEXT :: FEATURE CARD
setCardCtx()
const cardCtx = getCardCtx()
omniCtx.setCardCtx(cardCtx)

// Retain presentation through temporary selection gaps so ImageProvider and the
// viewer's outgoing scene survive until the next selected resource can crossfade.
let feature = $state.raw<ReturnType<typeof appCtx.getActiveFeature>>(null)
let presentedAccountRevision = untrack(() => appCtx.view.account.revision)
$effect(() => {
  const selectedFeature = appCtx.getActiveFeature()
  const accountRevision = appCtx.view.account.revision
  if (accountRevision !== presentedAccountRevision) {
    // Never retain the previous account's presentation across an identity change.
    feature = selectedFeature
    presentedAccountRevision = accountRevision
  } else if (selectedFeature) {
    // Shared selection remains authoritative for replacements and fresh resource data.
    feature = selectedFeature
  }
})
// Surface navigation projects committed URLs, including shallow and history changes.
const routeFeatureId = $derived(
  appCtx.navigation.state.resourceType === 'feature'
    ? appCtx.navigation.getActiveResourceId()
    : null,
)

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

  // Mount retained map or collection data immediately; direct routes still
  // wait for their first authoritative read because they have no cached row.
  const cachedFeature = await appCtx.view.getFeatureById(id, false)
  if (routeFeatureId !== id || omniCtx.isIntentionallyClosing) return
  if (cachedFeature) {
    // Refresh the resource projection; selection resolves the new data reactively.
    void appCtx.view.getFeatureById(id).catch(console.error)
  } else {
    await appCtx.view.getFeatureById(id)
    if (routeFeatureId !== id || omniCtx.isIntentionallyClosing) return
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
  const id = routeFeatureId
  if (!id) return

  const routeCollection = getCollectionDescriptorFromSearchParams(page.url.searchParams)
  untrack(() => {
    void loadFeatureAndSetContext(id, routeCollection)
  })
})

const imageProviderProps = $derived({
  isAdminMode: false,
  // Content and image context resolve the same selected identity during navigation.
  isValid: Boolean(feature),
  image: feature ? ((feature.image as ImageCtxEnvelope | null) ?? null) : undefined,
  images:
    feature && 'images' in feature
      ? ((feature.images as ImageCtxEnvelope[] | null) ?? null)
      : undefined,
  context: feature
    ? (() => {
        const hierarchy = appCtx.view.getHierarchySync(feature)

        return {
          ctxType: ImageContextResource.feature,
          ctxId: feature.id,
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
