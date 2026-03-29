<script lang="ts">
import { ImageEditor, UserAttributionCard } from '$lib/bits'
import ImageMetadataCard from '$lib/bits/patterns/images/components/ImageMetadataCard.svelte'
import { useImageEditorGalleryModel } from '$lib/adapters/image'
import { m } from '$lib/i18n'
import Icon from '$lib/components/common/Icon.svelte'
import { getImageCtx } from '$lib/context/image.svelte'
import CameraIcon from 'virtual:icons/lucide/camera'
import LoaderCircle from 'virtual:icons/lucide/loader-circle'

const model = useImageEditorGalleryModel(getImageCtx())
</script>

<ImageEditor
  items={model.state.items}
  activeId={model.state.activeId}
  fit="fit"
  isProcessingUploads={model.state.isProcessingUploads}
  isPublished={model.state.isPublished}
  presentationMode={model.state.presentationMode}
  canMutateActiveImage={model.state.canMutateActiveImage}
  canRotateActiveImage={model.state.canRotateActiveImage}
  canEditActiveImage={!!model.state.activeId}
  canReplaceActiveImage={model.state.canReplaceActiveImage}
  canDownloadActiveImage={model.state.canDownloadActiveImage}
  isEditBusy={model.state.isRotatePending}
  getIsLoading={model.status.isLoading}
  getIsUploading={model.status.isUploading}
  onThumbnailLoad={model.actions.markThumbnailLoaded}
  onThumbnailError={model.actions.markThumbnailErrored}
  onActiveIdChange={model.actions.select}
  onCurrentItemLoad={model.actions.markCurrentItemLoaded}
  onRotateLeft={model.actions.rotateLeft}
  onRotateRight={model.actions.rotateRight}
  onTogglePublished={model.actions.togglePublished}
  onPresentationModeChange={model.actions.setPresentationMode}
  onReplaceFiles={model.actions.replaceFiles}
  onAddFiles={model.actions.addFiles}
  onDownload={model.actions.downloadActive}
  onDelete={model.actions.deleteItem}
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
      />
    {/if}
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
          aria-label={m.image__metadata_open()}
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
</ImageEditor>
