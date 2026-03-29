<script lang="ts">
// ADAPTERS
import { useEntityImageViewerModel } from '$lib/adapters/image'
// BITS COMPONENTS
import { UserAttributionCard } from '$lib/bits'
import { AdminViewer, Dropzone } from '$lib/bits/patterns/images'
import ImageMetadataCard from '$lib/bits/patterns/images/components/ImageMetadataCard.svelte'
import ImageEditorViewerControls from '$lib/bits/patterns/images/components/ImageEditorViewerControls.svelte'
// COMPONENTS
import Icon from '$lib/components/common/Icon.svelte'
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
  onPresentationModeCommitted,
}: {
  canEditPresentationMode?: boolean
  canEditDropzone?: boolean
  onPresentationModeCommitted?: (nextMode: 'cover' | 'contain') => void
} = $props()

const model = useEntityImageViewerModel(getImageCtx(), {
  onPresentationModeCommitted,
})
const adminCtx = getAdminCtx()
const hasActiveImage = $derived(Boolean(model.state.activeImage))
const hasItems = $derived(model.state.items.length > 0)
const canUseEditFacility = $derived(canEditPresentationMode || canEditDropzone)
const canDeleteImage = $derived(
  adminCtx.appCtx.isSuperAdmin() && model.state.canDeleteActiveImage,
)
const canChangePresentationMode = $derived(
  canEditPresentationMode && model.state.canMutateActiveImage,
)
const canReplaceImage = $derived(canEditDropzone && model.state.canReplaceActiveImage)
const isDropzoneDisabled = $derived(
  !canEditDropzone ||
    model.state.isUploadBusy ||
    (hasActiveImage && !model.state.canReplaceActiveImage),
)

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

  await model.actions.deleteActive()
}
</script>

<div class="h-full w-full bg-black pr-4 pb-4 pt-1">
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
      fit="fit"
      viewerFit={model.state.presentationMode === 'cover' ? 'cover' : 'fit'}
      isEmptyUploadEnabled={true}
      isEmptyDropzoneEnabled={canEditDropzone}
      isEmptyUploadDisabled={!canEditDropzone}
      uploadSelectionMode="single"
      onUploadFiles={canEditDropzone
        ? files => {
            void model.actions.addFiles(files)
          }
        : undefined}
      onActiveIdChange={model.actions.select}
      onCurrentItemLoad={model.actions.markCurrentItemLoaded}
    >
      {#snippet leftRail(_item)}
        {#if model.state.activeImage}
          <UserAttributionCard
            userId={model.state.activeImage.image.contributorId}
            date={model.state.activeImage.image.createdAt || undefined}
            type="imageContributor"
            openDirection="right"
            isOpen={true}
          />
        {/if}
      {/snippet}

      {#snippet centerRail(_item)}
        <ImageEditorViewerControls
          presentationMode={model.state.presentationMode}
          canMutate={canChangePresentationMode}
          canEdit={canUseEditFacility && model.state.canEditActiveImage}
          canRotate={canUseEditFacility && model.state.canRotateActiveImage}
          canReplace={canReplaceImage}
          canDelete={canDeleteImage}
          canDownload={model.state.canDownloadActiveImage}
          isEditBusy={model.state.isEditBusy}
          disabled={!hasActiveImage || (!canUseEditFacility && !canDeleteImage)}
          onPresentationModeChange={canChangePresentationMode
            ? model.actions.setPresentationMode
            : undefined}
          onReplaceFiles={canReplaceImage ? model.actions.replaceFiles : undefined}
          onDelete={canDeleteImage ? handleDeleteActive : undefined}
          onDownload={model.actions.downloadActive}
          onRotateLeft={model.actions.rotateLeft}
          onRotateRight={model.actions.rotateRight}
          showPublishedToggle={false}
          showDeleteButton={canDeleteImage}
          showReplaceButton={canEditDropzone}
        />
      {/snippet}

      {#snippet rightRail(_item)}
        {#if model.state.activeImage}
          <div
            class="group/metadata relative"
            onmouseenter={() => {
              void model.actions.ensureMetadataLoaded()
            }}
            onfocusin={() => {
              void model.actions.ensureMetadataLoaded()
            }}
          >
            <button
              type="button"
              class="inline-flex h-11 w-11 items-center justify-center rounded-full bg-black/70 text-white transition hover:bg-black/85"
              aria-label="Open image metadata"
            >
              {#if model.state.isMetadataLoading}
                <Icon src={LoaderCircle} class="h-[22px] w-[22px] animate-spin" />
              {:else}
                <CameraIcon class="h-[22px] w-[22px]" />
              {/if}
            </button>

            <div
              class="pointer-events-none absolute bottom-0 right-0 origin-bottom-right opacity-0 transition-opacity duration-150 group-hover/metadata:opacity-100 group-focus-within/metadata:opacity-100"
            >
              <div class="pointer-events-auto">
                {#if model.state.hasLoadedMetadata && !model.state.isMetadataLoading}
                  <ImageMetadataCard
                    image={model.state.activeImage.image}
                    metadata={model.state.metadata}
                    loading={false}
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
