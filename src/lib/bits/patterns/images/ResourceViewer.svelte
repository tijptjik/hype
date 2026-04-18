<script module lang="ts">
import type { ImageMetadataBasic } from '$lib/db/zod/schema/image.types'
import type { ViewerRenderable } from './images.types'
import type { ImageCtx } from '$lib/context/image.svelte'

const RESOURCE_VIEWER_RETAIN_MS = 1500

type ResourceViewerSnapshot = {
  item: ViewerRenderable | null
  activeImage: ImageCtx['activeImage']
  presentationMode: 'cover' | 'contain'
  canEditActiveImage: boolean
  canRotateActiveImage: boolean
  canReplaceActiveImage: boolean
  canDeleteActiveImage: boolean
  canDownloadActiveImage: boolean
  canMutateActiveImage: boolean
  isEditBusy: boolean
  isMetadataLoading: boolean
  hasLoadedMetadata: boolean
  metadata: ImageMetadataBasic | null
  canDeleteImage: boolean
}

let retainedViewerSnapshot: ResourceViewerSnapshot | null = null
let retainedViewerSnapshotAt = 0

function cloneViewerRenderable(item: ViewerRenderable): ViewerRenderable {
  return {
    ...item,
    status: item.status ? { ...item.status } : item.status,
    meta: item.meta ? { ...item.meta } : item.meta,
  }
}

function cloneRetainedViewerSnapshot(
  snapshot: ResourceViewerSnapshot,
): ResourceViewerSnapshot {
  return {
    ...snapshot,
    item: snapshot.item ? cloneViewerRenderable(snapshot.item) : null,
    metadata: snapshot.metadata ? { ...snapshot.metadata } : snapshot.metadata,
  }
}

function getRetainedViewerSnapshot(): ResourceViewerSnapshot | null {
  if (!retainedViewerSnapshot) return null
  if (Date.now() - retainedViewerSnapshotAt > RESOURCE_VIEWER_RETAIN_MS) {
    retainedViewerSnapshot = null
    retainedViewerSnapshotAt = 0
    return null
  }

  const snapshot = cloneRetainedViewerSnapshot(retainedViewerSnapshot)
  retainedViewerSnapshot = null
  retainedViewerSnapshotAt = 0
  return snapshot
}

function setRetainedViewerSnapshot(snapshot: ResourceViewerSnapshot | null): void {
  retainedViewerSnapshot = snapshot ? cloneRetainedViewerSnapshot(snapshot) : null
  retainedViewerSnapshotAt = snapshot ? Date.now() : 0
}
</script>

<script lang="ts">
import { onDestroy, untrack } from 'svelte'
// ADAPTERS
import { useEntityImageViewerModel } from '$lib/adapters/image'
// BITS COMPONENTS
import { UserAttributionCard } from '$lib/bits'
import { AdminViewer, Dropzone } from '$lib/bits/patterns/images'
import ImageMetadataCard from '$lib/bits/patterns/images/components/ImageMetadataCard.svelte'
import ViewerControls from '$lib/bits/patterns/images/components/controls/ViewerControls.svelte'
// COMPONENTS
import { Icon } from '$lib/bits'
// CONTEXT
import { getImageCtx } from '$lib/context/image.svelte'
import { getAdminCtx } from '$lib/context/admin.svelte'
// ICONS
import CameraIcon from 'virtual:icons/lucide/camera'
import LoaderCircle from 'virtual:icons/lucide/loader-circle'
import { m } from '$lib/i18n'

let {
  canEditPresentationMode = true,
  canEditDropzone = false,
  hasBottomPadding = false,
  isReadonly = false,
  prefetchMetadata = false,
  onPresentationModeCommitted,
}: {
  canEditPresentationMode?: boolean
  canEditDropzone?: boolean
  hasBottomPadding?: boolean
  isReadonly?: boolean
  prefetchMetadata?: boolean
  onPresentationModeCommitted?: (nextMode: 'cover' | 'contain') => void
} = $props()

const imageCtx = getImageCtx()
const model = useEntityImageViewerModel(imageCtx, {
  onPresentationModeCommitted: mode => onPresentationModeCommitted?.(mode),
})
const adminCtx = getAdminCtx()
const hasActiveImage = $derived(Boolean(model.state.activeImage))
const hasItems = $derived(model.state.items.length > 0)
const canUseEditFacility = $derived(canEditPresentationMode || canEditDropzone)
const canDeleteImage = $derived(
  !isReadonly && adminCtx.appCtx.isSuperAdmin() && model.state.canDeleteActiveImage,
)
const canChangePresentationMode = $derived(
  !isReadonly && canEditPresentationMode && hasActiveImage,
)
const isDropzoneDisabled = $derived(
  isReadonly ||
    !canEditDropzone ||
    model.state.isUploadBusy ||
    (hasActiveImage && !model.state.canReplaceActiveImage),
)
let isMetadataOpen = $state(false)
let retainedSnapshot = $state<ResourceViewerSnapshot | null>(
  getRetainedViewerSnapshot(),
)
let latestStableSnapshot = $state<ResourceViewerSnapshot | null>(null)
const retainedItem = $derived(retainedSnapshot?.item ?? null)
const currentViewerItem = $derived.by(() => {
  const activeId = model.state.activeId
  const items = model.state.items

  if (!items.length) return null
  return items.find(candidate => candidate.id === activeId) ?? items[0] ?? null
})
const shouldShowRetainedSnapshot = $derived(Boolean(retainedSnapshot?.item))
const displayedActiveImage = $derived(
  shouldShowRetainedSnapshot
    ? (retainedSnapshot?.activeImage ?? null)
    : model.state.activeImage,
)
const displayedPresentationMode = $derived(
  shouldShowRetainedSnapshot
    ? (retainedSnapshot?.presentationMode ?? 'contain')
    : model.state.presentationMode,
)
const displayedCanEditActiveImage = $derived(
  shouldShowRetainedSnapshot
    ? (retainedSnapshot?.canEditActiveImage ?? false)
    : model.state.canEditActiveImage,
)
const displayedCanRotateActiveImage = $derived(
  shouldShowRetainedSnapshot
    ? (retainedSnapshot?.canRotateActiveImage ?? false)
    : model.state.canRotateActiveImage,
)
const displayedCanReplaceActiveImage = $derived(
  shouldShowRetainedSnapshot
    ? (retainedSnapshot?.canReplaceActiveImage ?? false)
    : model.state.canReplaceActiveImage,
)
const displayedCanDeleteActiveImage = $derived(
  shouldShowRetainedSnapshot
    ? (retainedSnapshot?.canDeleteActiveImage ?? false)
    : model.state.canDeleteActiveImage,
)
const displayedCanDownloadActiveImage = $derived(
  shouldShowRetainedSnapshot
    ? (retainedSnapshot?.canDownloadActiveImage ?? false)
    : model.state.canDownloadActiveImage,
)
const displayedCanMutateActiveImage = $derived(
  shouldShowRetainedSnapshot
    ? (retainedSnapshot?.canMutateActiveImage ?? false)
    : model.state.canMutateActiveImage,
)
const displayedCanChangePresentationMode = $derived(
  !isReadonly && canEditPresentationMode && Boolean(displayedActiveImage),
)
const displayedCanReplaceImage = $derived(
  !isReadonly && canEditDropzone && displayedCanReplaceActiveImage,
)
const displayedCanDeleteImage = $derived(
  shouldShowRetainedSnapshot
    ? (retainedSnapshot?.canDeleteImage ?? false)
    : !isReadonly && adminCtx.appCtx.isSuperAdmin() && displayedCanDeleteActiveImage,
)
const displayedIsEditBusy = $derived(
  shouldShowRetainedSnapshot
    ? (retainedSnapshot?.isEditBusy ?? false)
    : model.state.isEditBusy,
)
const displayedIsMetadataLoading = $derived(
  shouldShowRetainedSnapshot
    ? (retainedSnapshot?.isMetadataLoading ?? false)
    : model.state.isMetadataLoading,
)
const displayedHasLoadedMetadata = $derived(
  shouldShowRetainedSnapshot
    ? (retainedSnapshot?.hasLoadedMetadata ?? false)
    : model.state.hasLoadedMetadata,
)
const displayedMetadata = $derived(
  shouldShowRetainedSnapshot
    ? (retainedSnapshot?.metadata ?? null)
    : model.state.metadata,
)

$effect(() => {
  if (
    !prefetchMetadata ||
    shouldShowRetainedSnapshot ||
    !displayedActiveImage?.image.id ||
    displayedHasLoadedMetadata ||
    displayedIsMetadataLoading
  ) {
    return
  }

  void model.actions.ensureMetadataLoaded()
})

$effect(() => {
  if (
    !latestStableSnapshot?.item ||
    imageCtx.state.lastChangeType !== 'context' ||
    !imageCtx.state.isFetchingImages
  ) {
    return
  }

  // Avoid re-subscribing this effect to the state it updates.
  if (untrack(() => retainedSnapshot)) return

  retainedSnapshot = latestStableSnapshot
})

$effect(() => {
  if (!retainedSnapshot || !currentViewerItem || imageCtx.state.isFetchingImages) return

  retainedSnapshot = null
})

$effect(() => {
  if (currentViewerItem || imageCtx.state.isFetchingImages) return

  // Once the current resource has settled into a real empty state, clear both
  // the in-memory and module-retained snapshots so deleted images cannot
  // reappear during the next route mount.
  latestStableSnapshot = null
  retainedSnapshot = null
  setRetainedViewerSnapshot(null)
})

$effect(() => {
  if (!currentViewerItem || !model.state.activeImage) return

  latestStableSnapshot = {
    item: currentViewerItem,
    activeImage: model.state.activeImage,
    presentationMode: model.state.presentationMode,
    canEditActiveImage: model.state.canEditActiveImage,
    canRotateActiveImage: model.state.canRotateActiveImage,
    canReplaceActiveImage: model.state.canReplaceActiveImage,
    canDeleteActiveImage: model.state.canDeleteActiveImage,
    canDownloadActiveImage: model.state.canDownloadActiveImage,
    canMutateActiveImage: model.state.canMutateActiveImage,
    isEditBusy: model.state.isEditBusy,
    isMetadataLoading: model.state.isMetadataLoading,
    hasLoadedMetadata: model.state.hasLoadedMetadata,
    metadata: model.state.metadata,
    canDeleteImage,
  }
})

async function handleDeleteActive(): Promise<void> {
  if (!canDeleteImage) return

  if (
    typeof window !== 'undefined' &&
    !window.confirm(
      `${m.gallery__delete_image_confirm_title()}\n${m.gallery__delete_image_confirm_description()}`,
    )
  ) {
    return
  }

  // Clear any retained handoff state before deleting so a removed image cannot
  // be resurrected during the next resource mount.
  latestStableSnapshot = null
  retainedSnapshot = null
  setRetainedViewerSnapshot(null)

  await model.actions.deleteActive()
}

function handleCurrentItemLoad(item: ViewerRenderable): void {
  model.actions.markCurrentItemLoaded(item)

  const isDestinationItem =
    model.state.items.find(candidate => candidate.id === item.id) != null

  if (!isDestinationItem || imageCtx.state.isFetchingImages) return

  retainedSnapshot = null
}

onDestroy(() => {
  const snapshotToRetain =
    currentViewerItem && model.state.activeImage ? latestStableSnapshot : null

  setRetainedViewerSnapshot(snapshotToRetain)
})
</script>

<div
  class={hasBottomPadding
    ? 'h-full w-full select-none bg-black pb-4 pr-4 pt-1'
    : 'h-full w-full select-none bg-black pr-4 pt-1'}
>
  <Dropzone
    disabled={!hasItems || isDropzoneDisabled}
    {hasItems}
    rounded="rounded-2xl"
    uploadSelectionMode="single"
    onFiles={model.actions.addFiles}
  >
    <AdminViewer
      items={model.state.items}
      activeId={model.state.activeId}
      {retainedItem}
      fit="fit"
      viewerFit={displayedPresentationMode === 'cover' ? 'cover' : 'fit'}
      isEmptyUploadEnabled={true}
      isEmptyDropzoneEnabled={!isReadonly && canEditDropzone}
      isEmptyUploadDisabled={isReadonly || !canEditDropzone}
      uploadSelectionMode="single"
      onUploadFiles={!isReadonly && canEditDropzone
        ? files => {
            void model.actions.addFiles(files)
          }
        : undefined}
      onActiveIdChange={model.actions.select}
      onCurrentItemLoad={handleCurrentItemLoad}
    >
      {#snippet leftRail(_item)}
        {#if displayedActiveImage}
          <UserAttributionCard
            userId={displayedActiveImage.image.contributorId}
            date={displayedActiveImage.image.createdAt || undefined}
            type="imageContributor"
            openDirection="right"
            isOpen={true}
            class="[&_.bits-feature-attribution__avatar]:h-9 [&_.bits-feature-attribution__avatar]:w-9"
          />
        {/if}
      {/snippet}

      {#snippet centerRail(_item)}
        <ViewerControls
          presentationMode={displayedPresentationMode}
          canMutate={displayedCanChangePresentationMode}
          canEdit={canUseEditFacility && displayedCanEditActiveImage}
          canRotate={canUseEditFacility && displayedCanRotateActiveImage}
          canReplace={displayedCanReplaceImage}
          canDelete={displayedCanDeleteImage}
          canDownload={displayedCanDownloadActiveImage}
          isEditBusy={displayedIsEditBusy}
          disabled={!displayedActiveImage}
          freezeInteractions={shouldShowRetainedSnapshot}
          offsetClass="bottom-4"
          onPresentationModeChange={displayedCanChangePresentationMode
            ? model.actions.setPresentationMode
            : undefined}
          onReplaceFiles={displayedCanReplaceImage
            ? model.actions.replaceFiles
            : undefined}
          onDelete={displayedCanDeleteImage ? handleDeleteActive : undefined}
          onDownload={model.actions.downloadActive}
          onRotateLeft={model.actions.rotateLeft}
          onRotateRight={model.actions.rotateRight}
          showPublishedToggle={false}
          showDeleteButton={displayedCanDeleteImage}
          showReplaceButton={displayedCanReplaceImage || shouldShowRetainedSnapshot}
        />
      {/snippet}

      {#snippet rightRail(_item)}
        {#if displayedActiveImage}
          <div
            class="group/metadata relative"
            onmouseleave={() => {
              isMetadataOpen = false
            }}
            onmouseenter={() => {
              if (shouldShowRetainedSnapshot) return
              isMetadataOpen = true
              void model.actions.ensureMetadataLoaded()
            }}
            onfocusin={() => {
              if (shouldShowRetainedSnapshot) return
              isMetadataOpen = true
              void model.actions.ensureMetadataLoaded()
            }}
            onfocusout={() => {
              isMetadataOpen = false
            }}
          >
            <button
              type="button"
              class="inline-flex h-11 w-11 items-center justify-center rounded-full bg-black/70 text-white transition hover:bg-black/85 disabled:cursor-default disabled:opacity-45"
              disabled={shouldShowRetainedSnapshot}
              aria-label="Open image metadata"
              onclick={() => {
                if (shouldShowRetainedSnapshot) return
                isMetadataOpen = !isMetadataOpen
                if (isMetadataOpen) {
                  void model.actions.ensureMetadataLoaded()
                }
              }}
            >
              {#if displayedIsMetadataLoading}
                <Icon src={LoaderCircle} class="h-[22px] w-[22px] animate-spin" />
              {:else}
                <CameraIcon class="h-[22px] w-[22px]" />
              {/if}
            </button>

            <div
              class="pointer-events-none absolute bottom-0 right-0 origin-bottom-right transition-opacity duration-150"
              class:opacity-0={!isMetadataOpen}
              class:opacity-100={isMetadataOpen}
            >
              <div class="pointer-events-auto">
                {#if displayedIsMetadataLoading || displayedHasLoadedMetadata}
                  <ImageMetadataCard
                    image={displayedActiveImage.image}
                    metadata={displayedMetadata}
                    loading={displayedIsMetadataLoading}
                  />
                {/if}
              </div>
            </div>
          </div>
        {/if}
      {/snippet}
    </AdminViewer>
  </Dropzone>
</div>
