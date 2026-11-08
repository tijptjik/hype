<script lang="ts">
// SVELTE
import type { Snippet } from 'svelte'
// ADAPTERS
import { useGalleryOrdering } from '#lib/adapters/image/useGalleryOrdering.svelte.js'
import { useImageEditorGalleryModel } from '#lib/adapters/image/index.js'
// BITS COMPONENTS
import Icon from '#lib/bits/custom/icon/Icon.svelte'
import ImageEditor from '#lib/bits/patterns/images/ImageEditor.svelte'
import UserAttributionCard from '#lib/bits/patterns/cards/userAttributionCard/UserAttributionCard.svelte'
import ImageMetadataCard from './components/ImageMetadataCard.svelte'
import {
  IMAGE_ATTRIBUTION_CLASSES,
  IMAGE_METADATA_BUTTON_CLASSES,
} from './components/imageChrome.styles'
// CONTEXT
import { getImageCtx } from '#lib/context/image.svelte.js'
// I18N
import { m } from '#lib/i18n.js'
// ICONS
import CameraIcon from 'virtual:icons/proicons/camera'
import LoaderCircle from 'virtual:icons/proicons/spinner'

let {
  featureId,
  textControls: imageTextControls,
}: { featureId?: string; textControls?: Snippet<[string | null, boolean]> } = $props()

const imageCtx = getImageCtx()
const model = useImageEditorGalleryModel(imageCtx)
const ordering = useGalleryOrdering(
  () => featureId,
  () => model.state.items,
  () => imageCtx.refreshImages(),
)
const hasActiveText = $derived(
  [
    ...Object.values(model.state.activeImage?.image.galleryCaption ?? {}),
    ...Object.values(model.state.activeImage?.image.galleryAlt ?? {}),
  ].some(text => text.trim().length > 0),
)
</script>

<ImageEditor
  isLoading={imageCtx.state.isFetchingImages || !imageCtx.state.context}
  sortScope={featureId ?? undefined}
  sortMode={ordering.mode}
  canSort={ordering.enabled}
  onSortChange={ordering.save}
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
  canDeleteActiveImage={model.state.canMutateActiveImage}
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
  {#snippet textControls()}
    {@render imageTextControls?.(model.state.activeId, hasActiveText)}
  {/snippet}

  {#snippet leftRail(_item)}
    {#if model.state.activeImage}
      <UserAttributionCard
        userId={model.state.activeImage.image.contributorId}
        date={model.state.activeImage.image.createdAt || undefined}
        type="imageContributor"
        openDirection="right"
        isOpen={true}
        class={IMAGE_ATTRIBUTION_CLASSES}
      />
    {/if}
  {/snippet}

  {#snippet rightRail(_item)}
    {#if model.state.activeImage}
      <!-- biome-ignore lint/a11y/noStaticElementInteractions: Hover and focus events keep the metadata popover open around its button. -->
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
          class={IMAGE_METADATA_BUTTON_CLASSES}
          aria-label={m.image__metadata_open()}
        >
          {#if model.state.isMetadataLoading}
            <Icon src={LoaderCircle} class="h-[22px] w-[22px] animate-spin" />
          {:else}
            <CameraIcon class="h-[22px] w-[22px]" />
          {/if}
        </button>

        <div
          class="pointer-events-none absolute right-0 bottom-0 origin-bottom-right opacity-0 transition-opacity duration-150 group-focus-within/metadata:opacity-100 group-hover/metadata:opacity-100"
        >
          <div
            class="pointer-events-none group-focus-within/metadata:pointer-events-auto group-hover/metadata:pointer-events-auto"
          >
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
