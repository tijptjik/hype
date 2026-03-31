<script lang="ts">
// ADAPTERS
import { useImageEditorGalleryModel } from '$lib/adapters/image'
// BITS
import { Icon, ImageEditor, UserAttributionCard } from '$lib/bits'
import ImageMetadataCard from '$lib/bits/patterns/images/components/ImageMetadataCard.svelte'
// IMAGE
import {
  getTaskImageBadgeClass,
  getTaskImageBadgeLabel,
  isTaskImage,
} from '$lib/client/services/task'
// CONTEXT
import { getImageCtx } from '$lib/context/image.svelte'
// ICONS
import CameraIcon from 'virtual:icons/lucide/camera'
import LoaderCircle from 'virtual:icons/lucide/loader-circle'

const imageCtx = getImageCtx()
const model = useImageEditorGalleryModel(imageCtx)
let {
  readonly = false,
  isReviewed = false,
}: {
  readonly?: boolean
  isReviewed?: boolean
} = $props()
let isMetadataOpen = $state(false)
const canDeleteTaskImages = $derived(!readonly && model.state.canMutateActiveImage)
</script>

<ImageEditor
  class="pb-4"
  items={model.state.items}
  activeId={model.state.activeId}
  fit="fit"
  isProcessingUploads={model.state.isProcessingUploads}
  isPublished={model.state.isPublished}
  presentationMode={model.state.presentationMode}
  canMutateActiveImage={!readonly && model.state.canMutateActiveImage}
  canRotateActiveImage={!readonly && model.state.canRotateActiveImage}
  canEditActiveImage={Boolean(model.state.activeImage?.image.id)}
  canReplaceActiveImage={!readonly && model.state.canReplaceActiveImage}
  canDeleteActiveImage={canDeleteTaskImages}
  canDownloadActiveImage={model.state.canDownloadActiveImage}
  isEditBusy={model.state.isRotatePending}
  isReadonly={readonly}
  isIntentDisabled={readonly}
  viewerControlsOffsetClass="bottom-9"
  getIsLoading={model.status.isLoading}
  getIsUploading={model.status.isUploading}
  getIsHighlighted={item =>
    isTaskImage(item, model.state.items, imageId => imageCtx.isImageHighlighted(imageId))}
  highlightClass="ring-2 ring-accent shadow-[0_0_0_2px_rgba(20,184,166,0.75)]"
  getBadgeLabel={item =>
    getTaskImageBadgeLabel(
      item,
      model.state.items,
      isReviewed,
      imageId => imageCtx.isImageHighlighted(imageId),
    )}
  getBadgeClass={item =>
    getTaskImageBadgeClass(
      item,
      model.state.items,
      isReviewed,
      imageId => imageCtx.isImageHighlighted(imageId),
    )}
  onThumbnailLoad={model.actions.markThumbnailLoaded}
  onThumbnailError={model.actions.markThumbnailErrored}
  onActiveIdChange={model.actions.select}
  onCurrentItemLoad={model.actions.markCurrentItemLoaded}
  onRotateLeft={readonly ? undefined : model.actions.rotateLeft}
  onRotateRight={readonly ? undefined : model.actions.rotateRight}
  onTogglePublished={readonly ? undefined : model.actions.togglePublished}
  onPresentationModeChange={readonly ? undefined : model.actions.setPresentationMode}
  onReplaceFiles={readonly ? undefined : model.actions.replaceFiles}
  onAddFiles={readonly ? undefined : model.actions.addFiles}
  onDownload={model.actions.downloadActive}
  onDelete={canDeleteTaskImages ? model.actions.deleteItem : undefined}
  onIntentChange={model.actions.setIntent}
  onRetryUpload={model.actions.retryUpload}
>
  {#snippet leftRail(_item)}
    {#if model.state.activeImage}
      <UserAttributionCard
        userId={model.state.activeImage.image.contributorId}
        date={model.state.activeImage.image.createdAt || undefined}
        type="imageContributor"
        openDirection="right"
        isOpen={true}
        class="[&_.bits-feature-attribution__avatar]:h-9 [&_.bits-feature-attribution__avatar]:w-9"
      />
    {/if}
  {/snippet}

  {#snippet rightRail(_item)}
    {#if model.state.activeImage}
      <div
        class="group/metadata relative"
        onmouseleave={() => {
          isMetadataOpen = false
        }}
        onmouseenter={() => {
          isMetadataOpen = true
          void model.actions.ensureMetadataLoaded()
        }}
        onfocusin={() => {
          isMetadataOpen = true
          void model.actions.ensureMetadataLoaded()
        }}
        onfocusout={() => {
          isMetadataOpen = false
        }}
      >
        <button
          type="button"
          class="inline-flex h-11 w-11 items-center justify-center rounded-full bg-black/70 text-white transition hover:bg-black/85"
          aria-label={m.image__metadata_open()}
          onclick={() => {
            isMetadataOpen = !isMetadataOpen
            if (isMetadataOpen) {
              void model.actions.ensureMetadataLoaded()
            }
          }}
        >
          {#if model.state.isMetadataLoading}
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
</ImageEditor>
