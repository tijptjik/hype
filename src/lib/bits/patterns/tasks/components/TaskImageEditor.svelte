<script lang="ts">
// COMPONENTS
import FeatureGalleryImageTextEditor from '#lib/bits/patterns/revisionHistory/FeatureGalleryImageTextEditor.svelte'
// I18N
import { m } from '#lib/i18n.js'
// ADAPTERS
import { useGalleryOrdering } from '#lib/adapters/image/useGalleryOrdering.svelte.js'
import { useImageEditorGalleryModel } from '#lib/adapters/image/index.js'
// BITS
import Icon from '#lib/bits/custom/icon/Icon.svelte'
import ImageEditor from '#lib/bits/patterns/images/ImageEditor.svelte'
import UserAttributionCard from '#lib/bits/patterns/cards/userAttributionCard/UserAttributionCard.svelte'
import ImageMetadataCard from '#lib/bits/patterns/images/components/ImageMetadataCard.svelte'
import { IMAGE_METADATA_BUTTON_CLASSES } from '#lib/bits/patterns/images/components/imageChrome.styles.js'
// IMAGE
import {
  getTaskImageBadgeClass,
  getTaskImageBadgeLabel,
  isTaskImage,
} from '#lib/client/services/task.js'
// CONTEXT
import { getImageCtx } from '#lib/context/image.svelte.js'
// ICONS
import CameraIcon from 'virtual:icons/proicons/camera'
import LoaderCircle from 'virtual:icons/proicons/spinner'

const imageCtx = getImageCtx()
const model = useImageEditorGalleryModel(imageCtx, { publishFromIntent: false })
let {
  featureId,
  pendingItemCount = 0,
  layout = 'sidebar',
  readonly = false,
  intentReadonly = readonly,
  isReviewed = false,
  researchOutcome,
  multilingualExpanded,
  onMultilingualExpandedChange,
}: {
  featureId?: string | null
  pendingItemCount?: number
  layout?: 'sidebar' | 'bottom' | 'top'
  readonly?: boolean
  intentReadonly?: boolean
  isReviewed?: boolean
  researchOutcome?: 'accepted' | 'rejected' | null
  multilingualExpanded?: boolean
  onMultilingualExpandedChange?: (expanded: boolean) => void
} = $props()
const ordering = useGalleryOrdering(
  () => featureId,
  () => model.state.items,
  () => imageCtx.refreshImages(),
)
let isMetadataOpen = $state(false)
const canDeleteTaskImages = $derived(!readonly && model.state.canMutateActiveImage)
</script>

<ImageEditor
  {pendingItemCount}
  isLoading={imageCtx.state.isFetchingImages || !imageCtx.state.context}
  sortScope={featureId ?? undefined}
  sortMode={ordering.mode}
  canSort={!readonly && ordering.enabled}
  onSortChange={ordering.save}
  {layout}
  showNavButtons={false}
  items={model.state.items}
  activeId={model.state.activeId}
  fit="fit"
  isProcessingUploads={model.state.isProcessingUploads}
  isPublished={model.state.isPublished}
  presentationMode={model.state.presentationMode}
  canMutateActiveImage={!readonly && model.state.canMutateActiveImage}
  canRotateActiveImage={!readonly && model.state.canRotateActiveImage}
  canEditActiveImage={!readonly && Boolean(model.state.activeImage?.image.id)}
  canReplaceActiveImage={!readonly && model.state.canReplaceActiveImage}
  canDeleteActiveImage={canDeleteTaskImages}
  canDownloadActiveImage={model.state.canDownloadActiveImage}
  isEditBusy={model.state.isRotatePending}
  isReadonly={readonly}
  isIntentDisabled={intentReadonly}
  getIsLoading={model.status.isLoading}
  getIsUploading={model.status.isUploading}
  getIsHighlighted={item =>
    isTaskImage(item, model.state.items, imageId =>
      imageCtx.isImageHighlighted(imageId),
    )}
  highlightClass=""
  getBadgeLabel={item =>
    getTaskImageBadgeLabel(
      item,
      model.state.items,
      isReviewed,
      imageId => imageCtx.isImageHighlighted(imageId),
      researchOutcome,
    )}
  getBadgeClass={item =>
    getTaskImageBadgeClass(
      item,
      model.state.items,
      isReviewed,
      imageId => imageCtx.isImageHighlighted(imageId),
      researchOutcome,
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
  {#snippet textControls()}
    {#if featureId}
      <FeatureGalleryImageTextEditor
        isDirty={readonly}
        {multilingualExpanded}
        {onMultilingualExpandedChange}
        {featureId}
        imageId={model.state.activeImage?.image.id ?? null}
        hasText={Object.values(
          model.state.activeImage?.image.galleryCaption ?? {},
        ).some(Boolean) ||
          Object.values(model.state.activeImage?.image.galleryAlt ?? {}).some(Boolean)}
        onSaved={() => {
          void imageCtx.refreshImages()
        }}
      />
    {/if}
  {/snippet}

  {#snippet leftRail(_item)}
    {#if model.state.activeImage}
      <UserAttributionCard
        userId={model.state.activeImage.image.contributorId}
        date={model.state.activeImage.image.createdAt || undefined}
        type="imageContributor"
        openDirection="right"
        isOpen={false}
        class="[&_.bits-feature-attribution__avatar]:h-9 [&_.bits-feature-attribution__avatar]:w-9 [&:not(:hover):not(:has(:focus-visible))_.bits-feature-attribution-shell__panel]:pointer-events-none! [&:not(:hover):not(:has(:focus-visible))_.bits-feature-attribution-shell__panel]:opacity-0!"
      />
    {/if}
  {/snippet}

  {#snippet rightRail(_item)}
    {#if model.state.activeImage}
      <!-- biome-ignore lint/a11y/noStaticElementInteractions: Hover and focus events keep the metadata popover open around its button. -->
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
          class={IMAGE_METADATA_BUTTON_CLASSES}
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
          class="pointer-events-none absolute right-0 bottom-0 origin-bottom-right transition-opacity duration-150"
          class:opacity-0={!isMetadataOpen}
          class:opacity-100={isMetadataOpen}
        >
          <div class={isMetadataOpen ? 'pointer-events-auto' : 'pointer-events-none'}>
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
