<script lang="ts">
import { useImageEditorGalleryModel } from '$lib/adapters/image'
import { formatDistanceToNow } from '$lib'
import { Icon } from '$lib/bits'
import { Popover } from 'bits-ui'
import { getImageSrc } from '$lib/client/services/image'
import { m } from '$lib/i18n'
import { getUserForAttribution } from '$lib/api/server/user.remote'
import { getAppCtx } from '$lib/context/app.svelte'
import { getImageCtx } from '$lib/context/image.svelte'
import FeatureCardViewerAttributionAvatar from './FeatureCardViewerAttributionAvatar.svelte'
import InfoIcon from 'virtual:icons/lucide/info'
import CameraIcon from 'virtual:icons/lucide/camera'
import MapPinIcon from 'virtual:icons/lucide/map-pin'
import type { Component } from 'svelte'
import type { ImageCtxEnvelope } from '$lib/db/zod/schema/image.types'
import type { Feature } from '$lib/db/zod/schema/feature.types'
import type { UserHydrationResult } from '$lib/db/zod/schema/user.types'

const appCtx = getAppCtx()
const imageCtx = getImageCtx()
const imageModel = useImageEditorGalleryModel(imageCtx)

let { currentImage }: { currentImage: ImageCtxEnvelope } = $props()

let open = $state(false)
let animateRows = $state(false)
let featureContributorRequestVersion = 0
let imageContributorRequestVersion = 0
let hasLoadedMetadata = $state(false)
let isResolvingMetadata = $state(false)
let hasLoadedFeatureContributor = $state(false)
let hasLoadedImageContributor = $state(false)
let featureContributor = $state<{
  id?: string | null
  attribution?: string | null
  name?: string | null
  image?: unknown
} | null>(null)
let imageContributor = $state<{
  id?: string | null
  attribution?: string | null
  name?: string | null
  image?: unknown
} | null>(null)

const featureId = $derived.by(() => {
  if (currentImage?.ctxType === 'feature') return currentImage.ctxId
  if (imageCtx.state.context?.ctxType === 'feature') return imageCtx.state.context.ctxId
  return null
})
const feature = $derived(
  featureId ? (appCtx.cache.feature.get(featureId) as Feature | undefined) : undefined,
)
const featureContributorId = $derived(
  (feature as Feature)?.contributor?.id ?? (feature as Feature)?.contributorId ?? null,
)
const featureContributorName = $derived(
  featureContributor?.attribution ||
    featureContributor?.name ||
    (feature as Feature)?.contributor?.attribution ||
    ('name' in ((feature as Feature)?.contributor ?? {})
      ? ((feature as Feature)?.contributor?.name as string | null | undefined)
      : null) ||
    m.anonymous(),
)
const featureContributorImage = $derived(
  getContributorAvatarSrc(
    featureContributor?.image ?? (feature as Feature)?.contributor?.image,
    featureContributorId ?? featureContributorName,
  ),
)
const imageContributorName = $derived(
  imageContributor?.attribution ||
    imageContributor?.name ||
    currentImage.image.attribution ||
    imageModel.state.metadata?.credit ||
    null,
)
const imageContributorImage = $derived(
  getContributorAvatarSrc(
    imageContributor?.image,
    imageContributor?.id ??
      currentImage.image.contributorId ??
      imageContributorName ??
      currentImage.image.id,
  ),
)
const createdAt = $derived((feature as Feature | undefined)?.createdAt)
const photoDate = $derived.by(() => {
  if (!hasLoadedMetadata) return null
  return imageModel.state.metadata?.capturedAt ?? currentImage.image.createdAt
})
const isFeatureContributorDateLoading = $derived(
  open && !hasLoadedFeatureContributor && Boolean(featureContributorId),
)
const isImageContributorDateLoading = $derived(open && isResolvingMetadata)

function getContributorAvatarSrc(
  image: unknown,
  fallbackId: string | null,
): string | null {
  if (!fallbackId) return null

  return getImageSrc(image, {
    transformation: 'c_fill,h_128,w_128',
  })
}

function formatRelativeDate(value: string | null | undefined): string {
  if (!value) return 'Unknown'

  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return 'Unknown'

  return formatDistanceToNow(date, { addSuffix: true })
}

$effect(() => {
  if (!open || hasLoadedFeatureContributor) {
    return
  }

  if ((feature as Feature | undefined)?.contributor || !featureContributorId) {
    featureContributorRequestVersion += 1
    featureContributor = null
    hasLoadedFeatureContributor = true
    return
  }

  const requestVersion = ++featureContributorRequestVersion

  const loadFeatureContributor = async (): Promise<void> => {
    try {
      const user = (await getUserForAttribution({
        id: featureContributorId,
        meta: {
          profile: 'card',
          ...(appCtx.isAdmin() ? { isAdminRequest: true } : {}),
        },
      })) as UserHydrationResult | null

      if (requestVersion !== featureContributorRequestVersion) return

      featureContributor = user
        ? {
            id: user.id ?? null,
            attribution: user.attribution ?? null,
            name: 'name' in user ? user.name : null,
            image: 'image' in user ? user.image : null,
          }
        : null
      hasLoadedFeatureContributor = true
    } catch {
      if (requestVersion !== featureContributorRequestVersion) return
      featureContributor = null
      hasLoadedFeatureContributor = true
    }
  }

  void loadFeatureContributor()
})

$effect(() => {
  if (!open || hasLoadedImageContributor) {
    return
  }

  const contributorId = currentImage?.image.contributorId

  if (!contributorId) {
    imageContributorRequestVersion += 1
    imageContributor = null
    hasLoadedImageContributor = true
    return
  }

  const requestVersion = ++imageContributorRequestVersion

  const loadImageContributor = async (): Promise<void> => {
    try {
      const user = (await getUserForAttribution({
        id: contributorId,
        meta: {
          profile: 'card',
          ...(appCtx.isAdmin() ? { isAdminRequest: true } : {}),
        },
      })) as UserHydrationResult | null

      if (requestVersion !== imageContributorRequestVersion) return

      imageContributor = user
        ? {
            id: user.id ?? null,
            attribution: user.attribution ?? null,
            name: 'name' in user ? user.name : null,
            image: 'image' in user ? user.image : null,
          }
        : null
      hasLoadedImageContributor = true
    } catch {
      if (requestVersion !== imageContributorRequestVersion) return
      imageContributor = null
      hasLoadedImageContributor = true
    }
  }

  void loadImageContributor()
})

$effect(() => {
  if (!open || hasLoadedMetadata) {
    return
  }

  const imageId = currentImage?.image.id
  if (!imageId) {
    isResolvingMetadata = false
    hasLoadedMetadata = true
    return
  }

  isResolvingMetadata = true
  void imageModel.actions.ensureMetadataLoaded().finally(() => {
    if (currentImage?.image.id !== imageId) return
    isResolvingMetadata = false
    hasLoadedMetadata = true
  })
})

$effect(() => {
  currentImage?.image.id
  hasLoadedMetadata = false
  isResolvingMetadata = false
  hasLoadedFeatureContributor = false
  hasLoadedImageContributor = false
})

$effect(() => {
  if (!open) {
    animateRows = false
    return
  }

  animateRows = false
  requestAnimationFrame(() => {
    animateRows = true
  })
})
</script>

{#snippet metadataRow(
  icon: Component,
  label: string,
  name: string | null,
  avatarSrc: string | null,
  date: string | null | undefined,
  delayClass: string,
  dateDetails?: Record<string, string | null | undefined>,
  isDateLoading: boolean = false
)}
  <div
    class={`relative flex w-full min-h-[3.4rem] max-w-full items-center gap-2.5 rounded-[0.875rem] border border-white/10 bg-black/58 pl-2 pr-[4.625rem] py-2 text-white/92 shadow-[0_10px_24px_rgba(0,0,0,0.18)] backdrop-blur-md transition-all duration-300 ${delayClass} ${animateRows ? 'translate-y-0 opacity-100' : 'translate-y-3 opacity-0'}`}
  >
    <FeatureCardViewerAttributionAvatar {name} src={avatarSrc} {icon} />
    <div class="min-w-0 flex-1">
      <div class="flex min-w-0 items-center justify-between gap-3">
        {#if isDateLoading}
          <div
            class="h-[12px] w-18 animate-pulse rounded-full bg-white/10"
            aria-hidden="true"
          ></div>
        {:else}
          <div
            class="shrink-0 font-mono text-[9px] uppercase tracking-[0.16em] text-white/45"
          >
            {formatRelativeDate(date)}
          </div>
        {/if}
      </div>
      <div class="min-w-0 pt-0.5 text-[0.98rem] leading-tight text-white">
        <span class="block truncate font-semibold">{name || 'Unknown'}</span>
      </div>
    </div>
    <div
      class="pointer-events-none absolute right-[1.15rem] top-1/2 -translate-y-1/2 text-white/35 opacity-35 blur-[0.9px]"
    >
      <Icon src={icon} class="h-8 w-8" />
    </div>
  </div>
{/snippet}

<Popover.Root bind:open>
  <Popover.Trigger
    aria-label="Open image attribution"
    class="inline-flex h-7 w-7 items-center justify-center rounded-full bg-black/55 text-white/92 backdrop-blur-sm transition hover:bg-black/70"
  >
    <InfoIcon class="h-3.5 w-3.5" />
  </Popover.Trigger>

  <Popover.Portal>
    <Popover.Content
      forceMount
      side="top"
      align="start"
      sideOffset={12}
      class={`bits-theme z-[220] w-fit max-w-[calc(100vw-4rem)] rounded-[1.5rem] bg-transparent p-0 shadow-none transition-opacity duration-200 ${open ? 'pointer-events-auto opacity-100' : 'pointer-events-none opacity-0'}`}
    >
      <div class="inline-grid w-full max-w-full grid-cols-1 gap-2">
        {@render metadataRow(
          MapPinIcon,
          'Mapped by',
          featureContributorName,
          featureContributorImage,
          createdAt,
          'delay-75',
          {
            featureId,
            featureCreatedAt: createdAt,
          },
          isFeatureContributorDateLoading,
        )}
        {@render metadataRow(
          CameraIcon,
          'Photo by',
          imageContributorName,
          imageContributorImage,
          photoDate,
          'delay-0',
          {
            publicId: currentImage.image.publicId,
            metadataCapturedAt: imageModel.state.metadata?.capturedAt,
            uploadCreatedAt: currentImage.image.createdAt,
          },
          isImageContributorDateLoading,
        )}
      </div>
    </Popover.Content>
  </Popover.Portal>
</Popover.Root>
