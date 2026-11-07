<script lang="ts">
// SVELTE
import { untrack } from 'svelte'
import { fly } from 'svelte/transition'
import { cubicOut } from 'svelte/easing'
import { prefersReducedMotion } from 'svelte/motion'
// BITS UI
import { Popover } from 'bits-ui'
// CONTEXT
import { getSurfaceCtx } from '#lib/context/resourceView.svelte.js'
import { getImageCtx } from '#lib/context/image.svelte.js'
// ADAPTERS
import { useImageEditorGalleryModel } from '#lib/adapters/image/index.js'
// API
import { getProject } from '#lib/api/project.remote.js'
import { getUserForAttribution } from '#lib/api/user.remote.js'
// NAVIGATION
import { Panel } from '#lib/enums.js'
// I18N
import { m } from '#lib/i18n.js'
// COMPONENTS
import FeatureCardAttributionDetails from './FeatureCardAttributionDetails.svelte'
// ICONS
import CloseIcon from 'virtual:icons/proicons/cancel'
import InfoIcon from 'virtual:icons/proicons/info'
// TYPES
import type { ImageCtxEnvelope } from '#lib/db/zod/schema/image.types.js'
import type { ProjectLicense } from '#lib/db/zod/schema/projectLicense.types.js'
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
let contributorsLoading = $state(true)
let licenseLoading = $state(true)
let photoLoading = $state(true)
let imageUser = $state<UserHydrationResult>(null)
let featureUser = $state<UserHydrationResult>(null)
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

let projectLicense = $state<ProjectLicense | null>(null)
const projectId = $derived(
  feature?.projectId ??
    (currentImage.ctxType === 'project' ? currentImage.ctxId : null),
)

// Fetch public project terms only while open; stale responses cannot label another project.
$effect(() => {
  const id = projectId
  if (!open) return
  projectLicense = null
  licenseLoading = Boolean(id)
  if (!id) return
  let cancelled = false
  void getProject({
    ref: id,
    meta: { profile: 'detail', ...(surface.isAdmin() ? { isAdminRequest: true } : {}) },
  })
    .then(result => {
      if (!cancelled) projectLicense = result.data?.license ?? null
    })
    .catch(() => {
      // Unavailable project terms must not be replaced with an assumed license.
      if (!cancelled) projectLicense = null
    })
    .finally(() => {
      if (!cancelled) licenseLoading = false
    })
  return () => {
    cancelled = true
  }
})

// Metadata belongs to the shared gallery cache: opening this UI never creates another metadata request.
$effect(() => {
  if (!open) return
  const id = currentImage.image.id
  let cancelled = false
  photoLoading = true
  if (gallery.state.activeId === id) {
    untrack(
      () =>
        void gallery.actions
          .ensureMetadataLoaded()
          .catch(() => undefined)
          .finally(() => {
            if (!cancelled) photoLoading = false
          }),
    )
  } else {
    photoLoading = false
  }
  return () => {
    cancelled = true
  }
})

// Each image/Feature change cancels its profile projection, so late responses cannot label a new image.
$effect(() => {
  const imageId = currentImage.image.id
  const ownerId = currentImage.image.contributorId
  const recordId = featureId
  const recordContributorId = contributorId
  if (!open) return
  contributorsLoading = true
  imageUser = null
  featureUser = null
  let cancelled = false
  /** Read the existing card profile used by the attribution viewer.
   * @param id Persisted contributor identity. @returns Attribution profile or null when unavailable.
   */
  async function credit(id: string | null | undefined): Promise<UserHydrationResult> {
    if (!id) return null
    try {
      const user = (await getUserForAttribution({
        id,
        meta: {
          profile: 'card',
          ...(surface.isAdmin() ? { isAdminRequest: true } : {}),
        },
      })) as UserHydrationResult | null
      return user
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
    contributorsLoading = false
    imageUser = photo
    featureUser = ownerId && ownerId === recordContributorId ? photo : record
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
    data-tooltip={m.image_attribution_title()}
    class="{open
      ? 'pointer-events-none opacity-0'
      : ''} inline-flex size-12 items-center justify-center rounded-full border border-transparent bg-panel/95 text-white shadow-sm backdrop-blur-sm transition hover:bg-primary hover:text-white focus-visible:outline-2 focus-visible:outline-white"
    ><InfoIcon class="size-6" aria-hidden="true" /></Popover.Trigger
  >
  <Popover.Portal>
    <Popover.Content
      side="top"
      align="start"
      sideOffset={-48}
      forceMount
      class="bits-theme border-border bg-panel text-foreground relative z-[250] max-h-[calc(100dvh-2rem)] w-80 max-w-[calc(100vw-2rem)] overflow-y-auto rounded-xl border p-4 shadow-xl"
    >
      {#snippet child({ props, wrapperProps, open: contentOpen })}
        {#if contentOpen}
          <div {...wrapperProps}>
            <div
              {...props}
              transition:fly={{
                y: prefersReducedMotion.current ? 0 : 8,
                duration: prefersReducedMotion.current ? 0 : 180,
                easing: cubicOut,
              }}
            >
              <Popover.Close
                aria-label={m.guest__close()}
                class="border-foreground/15 bg-foreground/5 text-foreground hover:bg-foreground/15 focus-visible:outline-primary absolute top-2 right-2 z-10 flex size-12 items-center justify-center rounded-full border transition-colors focus-visible:outline-2 focus-visible:outline-offset-2"
              >
                <CloseIcon class="size-6" aria-hidden="true" />
              </Popover.Close>
              <FeatureCardAttributionDetails
                {metadata}
                {projectLicense}
                loading={photoLoading ||
                  metadataLoading ||
                  contributorsLoading ||
                  licenseLoading}
                {imageUser}
                {featureUser}
                onOpenProfile={username => {
                  surface.panels.setPanelCtx(Panel.profile, 'username', username)
                  surface.panels.openPanel(Panel.profile)
                  open = false
                }}
                imageCredit={imageUser?.attribution ||
                  (imageUser && 'name' in imageUser ? imageUser.name : null) ||
                  currentImage.image.attribution}
                featureCredit={featureUser?.attribution ||
                  (featureUser && 'name' in featureUser ? featureUser.name : null) ||
                  fallbackFeatureCredit}
                featureCreatedAt={feature?.createdAt}
              />
            </div>
          </div>
        {/if}
      {/snippet}
    </Popover.Content>
  </Popover.Portal>
</Popover.Root>
