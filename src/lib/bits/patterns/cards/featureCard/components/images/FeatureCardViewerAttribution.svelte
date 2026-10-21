<script lang="ts">
// SVELTE
import { untrack } from 'svelte'
// BITS UI
import { Popover } from 'bits-ui'
// CONTEXT
import { getSurfaceCtx } from '#lib/context/resourceView.svelte.js'
import { getImageCtx } from '#lib/context/image.svelte.js'
// ADAPTERS
import { useImageEditorGalleryModel } from '#lib/adapters/image/index.js'
// API
import { getUserForAttribution } from '#lib/api/user.remote.js'
// I18N
import { m } from '#lib/i18n.js'
// COMPONENTS
import FeatureCardAttributionDetails from './FeatureCardAttributionDetails.svelte'
// ICONS
import InfoIcon from 'virtual:icons/proicons/info'
// TYPES
import type { ImageCtxEnvelope } from '#lib/db/zod/schema/image.types.js'
import type { Feature } from '#lib/db/zod/schema/feature.types.js'
import type { UserHydrationResult } from '#lib/db/zod/schema/user.types.js'

const surface = getSurfaceCtx()
let {
  currentImage,
  gallery: providedGallery,
}: {
  currentImage: ImageCtxEnvelope
  gallery?: ReturnType<typeof useImageEditorGalleryModel>
} = $props()
// One mounted viewer owns this adapter; fallback supports standalone consumption.
const gallery =
  untrack(() => providedGallery) ?? useImageEditorGalleryModel(getImageCtx())
let open = $state(false)
let imageCredit = $state<string | null>(null)
let featureCredit = $state<string | null>(null)
const featureId = $derived(
  currentImage.ctxType === 'feature' ? currentImage.ctxId : null,
)
const feature = $derived(
  featureId ? (surface.cache.feature.get(featureId) as Feature | undefined) : undefined,
)
const contributorId = $derived(
  feature?.contributor?.id ?? feature?.contributorId ?? null,
)
const metadata = $derived(
  gallery.state.activeId === currentImage.image.id ? gallery.state.metadata : null,
)
const metadataLoading = $derived(
  gallery.state.activeId === currentImage.image.id && gallery.state.isMetadataLoading,
)

// Metadata belongs to the shared gallery cache: opening this UI never creates another metadata request.
$effect(() => {
  if (!open) return
  const id = currentImage.image.id
  if (gallery.state.activeId === id)
    untrack(() => void gallery.actions.ensureMetadataLoaded())
})

// Each image/Feature change cancels its profile projection, so late responses cannot label a new image.
$effect(() => {
  const imageId = currentImage.image.id
  const ownerId = currentImage.image.contributorId
  const recordId = featureId
  const recordContributorId = contributorId
  imageCredit = null
  featureCredit = null
  if (!open) return
  let cancelled = false
  /** Read a public attribution profile, with the existing admin projection only on the admin surface.
   * @param id Persisted contributor identity. @returns Display credit or null when unavailable.
   */
  async function credit(id: string | null | undefined): Promise<string | null> {
    if (!id) return null
    try {
      const user = (await getUserForAttribution({
        id,
        meta: {
          profile: 'card',
          ...(surface.isAdmin() ? { isAdminRequest: true } : {}),
        },
      })) as UserHydrationResult | null
      return user?.attribution || (user && 'name' in user ? user.name : null) || null
    } catch {
      return null
    }
  }
  // Shared contributor IDs need only one profile request for both attribution roles.
  void (async () => {
    const [photo, record] = await Promise.all([
      credit(ownerId),
      ownerId && ownerId === recordContributorId
        ? Promise.resolve(null)
        : credit(recordContributorId),
    ])
    if (cancelled || currentImage.image.id !== imageId || featureId !== recordId) return
    imageCredit = photo
    featureCredit = ownerId && ownerId === recordContributorId ? photo : record
  })()
  return () => {
    cancelled = true
  }
})
const fallbackFeatureCredit = $derived(
  feature?.contributor?.attribution ||
    (feature?.contributor && 'name' in feature.contributor
      ? (feature.contributor.name as string | null)
      : null),
)
</script>

<Popover.Root bind:open>
  <Popover.Trigger
    aria-label={m.image_attribution_title()}
    title={m.image_attribution_title()}
    class="inline-flex size-10 items-center justify-center rounded-full border border-border bg-panel/95 text-foreground shadow-sm backdrop-blur-sm transition hover:bg-primary hover:text-primary-content focus-visible:outline-2 focus-visible:outline-primary"
    ><InfoIcon class="size-4" aria-hidden="true" /></Popover.Trigger
  >
  <Popover.Portal>
    <Popover.Content
      side="top"
      align="start"
      sideOffset={10}
      class="bits-theme z-[250] max-h-[min(70dvh,36rem)] w-80 max-w-[calc(100vw-2rem)] overflow-y-auto rounded-xl border border-border bg-panel p-4 text-foreground shadow-xl"
    >
      <FeatureCardAttributionDetails
        {metadata}
        loading={metadataLoading}
        imageCredit={imageCredit || currentImage.image.attribution}
        featureCredit={featureCredit || fallbackFeatureCredit}
        featureCreatedAt={feature?.createdAt}
        imageUploadedAt={currentImage.image.createdAt}
      />
    </Popover.Content>
  </Popover.Portal>
</Popover.Root>
