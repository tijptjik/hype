<script lang="ts">
import { cx } from '#lib/bits/utils.js'
import { m } from '#lib/i18n.js'
import * as ImagePrimitive from './components'
import AdminViewer from './AdminViewer.svelte'
import ThumbnailWrapper from './ThumbnailWrapper.svelte'
import ImageBackdrop from './components/ImageBackdrop.svelte'
import { getGalleryBackgroundSrc } from '#lib/client/services/image.js'
import type { ImageEditorProps } from './images.types'

let {
  items,
  layout = 'sidebar',
  showNavButtons = true,
  class: className = '',
  activeId = $bindable<string | null>(null),
  isFullscreen = $bindable(false),
  fullscreenRequestKey = 0,
  fit = 'fit',
  uploadSelectionMode = 'multiple',
  disableHoverPreview = false,
  isProcessingUploads = false,
  textControls,
  leftRail,
  rightRail,
  isPublished = false,
  presentationMode = 'contain',
  canMutateActiveImage = false,
  canRotateActiveImage = false,
  canEditActiveImage = false,
  canReplaceActiveImage = false,
  canDeleteActiveImage = false,
  canDownloadActiveImage = false,
  isEditBusy = false,
  isReadonly = false,
  isIntentDisabled = false,
  viewerControlsOffsetClass = 'bottom-4',
  getIsHighlighted,
  highlightClass = 'outline outline-2 outline-accent outline-offset-[-2px]',
  getBadgeLabel,
  getBadgeClass,
  getIsBlurred,
  getIsGreyscale,
  getIsLoading,
  getIsUploading,
  onIntentChange,
  onActiveIdChange,
  onCurrentItemLoad,
  onRotateLeft,
  onRotateRight,
  onTogglePublished,
  onPresentationModeChange,
  onReplaceFiles,
  onToggleFullscreen,
  onAddFiles,
  onDownload,
  onDelete,
  onRetryUpload,
  onThumbnailLoad,
  onThumbnailError,
}: ImageEditorProps = $props()

let isDeleteMode = $state(false)
let viewerFullscreenRequestKey = $state(0)
let thumbnailFollowActiveRequestKey = $state(0)
let thumbnailFollowActiveRequestId = $state<string | null>(null)
const isStackedLayout = $derived(layout !== 'sidebar')
const activeItem = $derived(items.find(item => item.id === activeId) ?? items[0])
const hasItems = $derived(items.length > 0)
const adminThumbnailSize = 192
const verticalRailPaddingLeftPx = 16
const verticalRailPaddingRightPx = 16
const verticalRailBottomBarHeightPx = 79
const verticalRailWidthPx =
  adminThumbnailSize + verticalRailPaddingLeftPx + verticalRailPaddingRightPx
const viewerFit = $derived.by<'fit' | 'cover'>(() =>
  presentationMode === 'cover' ? 'cover' : fit,
)
const railWidth = $derived(hasItems ? `${verticalRailWidthPx}px` : '0px')
const railVisibilityClass = $derived(
  hasItems
    ? 'translate-x-0 opacity-100'
    : 'pointer-events-none translate-x-6 opacity-0',
)
const controlsDisabled = $derived(!canEditActiveImage && !canDownloadActiveImage)

$effect(() => {
  if (!items.length) {
    isDeleteMode = false
  }
})
</script>

<div
  class={cx(
    '@container/image-editor relative isolate h-full w-full overflow-hidden select-none bg-base-100 px-0',
  )}
>
  {#if isStackedLayout && activeItem && getGalleryBackgroundSrc(activeItem)}
    <ImageBackdrop src={getGalleryBackgroundSrc(activeItem)!} />
  {/if}
  <div class={cx('relative flex h-full min-h-0 w-full', isStackedLayout && 'flex-col')}>
    {#if layout === 'top' && items.length > 1}
      {@render thumbnailTrack()}
    {/if}
    <div
      class={cx(
        'relative min-h-0 min-w-0 flex-1',
        className,
      )}
    >
      <AdminViewer
        rounded="rounded-none"
        {items}
        {showNavButtons}
        showBackdrop={!isStackedLayout}
        {activeId}
        bind:isFullscreen
        fullscreenRequestKey={fullscreenRequestKey + viewerFullscreenRequestKey}
        {fit}
        {viewerFit}
        {uploadSelectionMode}
        centerAction="fullscreen"
        centerActionLabel={isFullscreen
          ? m.gallery__fullscreen_exit_viewer()
          : m.gallery__fullscreen_view_image()}
        {onActiveIdChange}
        onNavigateToItem={itemId => {
          thumbnailFollowActiveRequestId = itemId
          thumbnailFollowActiveRequestKey += 1
        }}
        {onCurrentItemLoad}
        isEmptyUploadEnabled={true}
        isEmptyUploadDisabled={isReadonly}
        isEmptyDropzoneEnabled={!isReadonly}
        onUploadFiles={onAddFiles}
        leftRail={isStackedLayout ? undefined : leftRail}
        rightRail={isStackedLayout ? undefined : rightRail}
      />

      {#if !isStackedLayout}
        <div
          class="pointer-events-none absolute inset-x-0 bottom-4 z-40 flex justify-center"
        >
          <div
            class={cx(
              'transition-opacity duration-200 ease-out',
              hasItems ? 'pointer-events-auto opacity-100' : 'opacity-0',
            )}
          >
            {@render toolbar()}
          </div>
        </div>
      {/if}
      {#if isStackedLayout && activeItem}
        <div
          class="pointer-events-none absolute inset-x-0 bottom-0 z-40 grid grid-cols-[3rem_minmax(0,1fr)_3rem] items-center gap-2 p-4"
        >
          <div
            class="pointer-events-auto relative z-50 col-start-1 row-start-1 w-12 overflow-visible"
          >
            {@render leftRail?.(activeItem)}
          </div>
          <div
            class="pointer-events-auto col-span-3 col-start-1 row-start-2 flex min-w-0 justify-center @min-[30rem]/image-editor:col-span-1 @min-[30rem]/image-editor:col-start-2 @min-[30rem]/image-editor:row-start-1"
          >
            {@render toolbar()}
          </div>
          <div
            class="pointer-events-auto relative z-50 col-start-3 row-start-1 justify-self-end"
          >
            {@render rightRail?.(activeItem)}
          </div>
        </div>
      {/if}
      {#if isStackedLayout && items.length === 1 && activeItem && onIntentChange}
        <div class="absolute top-2 right-2 z-40 h-10 w-32">
          <ImagePrimitive.ThumbnailIntent
            item={activeItem}
            disabled={isIntentDisabled}
            {onIntentChange}
            contentSide="bottom"
          />
        </div>
      {/if}
    </div>

    {#if isStackedLayout}
      {#if layout === 'bottom' && items.length > 1}
        {@render thumbnailTrack()}
      {/if}
    {:else}
      <div
        class={cx(
          'relative flex h-full shrink-0 flex-col overflow-hidden transition-[width,transform,opacity] duration-220 ease-out',
          'bg-surface',
          railVisibilityClass,
        )}
        style={`width: ${railWidth};`}
        aria-hidden={!hasItems}
      >
        <div
          class="min-h-0 flex-1"
          style={`padding-bottom: ${verticalRailBottomBarHeightPx}px;`}
        >
          <ThumbnailWrapper
            {items}
            {activeId}
            followActiveIdRequestKey={thumbnailFollowActiveRequestKey}
            followActiveIdRequestId={thumbnailFollowActiveRequestId}
            variant="admin"
            orientation="vertical"
            trackClass="pt-0!"
            class="h-full min-h-0"
            size={adminThumbnailSize}
            {fit}
            prefetchFit={viewerFit}
            {isDeleteMode}
            {getIsHighlighted}
            {highlightClass}
            {getBadgeLabel}
            {getBadgeClass}
            {getIsBlurred}
            {getIsGreyscale}
            {getIsLoading}
            {getIsUploading}
            {isIntentDisabled}
            {onIntentChange}
            {onDelete}
            {onRetryUpload}
            onLoad={onThumbnailLoad}
            onError={onThumbnailError}
            onSelect={item => {
              onActiveIdChange?.(item.id)
            }}
            onHover={item => {
              if (disableHoverPreview) return
              onActiveIdChange?.(item.id)
            }}
          />
        </div>

        <div
          class="border-border bg-base-100 pointer-events-none absolute inset-x-0 bottom-0 z-20 border-t"
          style={`height: ${verticalRailBottomBarHeightPx}px;`}
        >
          <ImagePrimitive.ThumbnailControls
            class={cx(
              'transition-opacity duration-200 ease-out',
              hasItems
                ? 'pointer-events-auto opacity-100'
                : 'pointer-events-none opacity-0',
            )}
            {uploadSelectionMode}
            variant="footer"
            disabled={isReadonly && !canDeleteActiveImage}
            disableUpload={isReadonly}
            disableDeleteMode={!canDeleteActiveImage}
            {isProcessingUploads}
            {isDeleteMode}
            onToggleDeleteMode={() => {
              isDeleteMode = !isDeleteMode
            }}
            {onAddFiles}
          />
        </div>
      </div>
    {/if}
  </div>
</div>

{#snippet toolbar()}
  <ImagePrimitive.ViewerControls
    {textControls}
    {isPublished}
    {presentationMode}
    canMutate={canMutateActiveImage}
    canRotate={canRotateActiveImage}
    canEdit={canEditActiveImage}
    canReplace={canReplaceActiveImage}
    canDelete={canDeleteActiveImage}
    canDownload={canDownloadActiveImage}
    showEditButton={canEditActiveImage || canRotateActiveImage}
    {isEditBusy}
    offsetClass={isStackedLayout
      ? 'static! translate-x-0! flex-wrap justify-center gap-1! p-1! max-w-full'
      : viewerControlsOffsetClass}
    disabled={controlsDisabled}
    {onRotateLeft}
    {onRotateRight}
    {onTogglePublished}
    {onPresentationModeChange}
    {onReplaceFiles}
    {onDownload}
  />
{/snippet}

{#snippet thumbnailTrack()}
  <div class="bg-base-100 h-32 shrink-0 px-2 py-1">
    <ThumbnailWrapper
      {items}
      {activeId}
      variant="admin"
      orientation="horizontal"
      size={112}
      trackClass="m-0! gap-2 p-1! bg-transparent! [&_button[aria-pressed]>div]:bg-transparent!"
      {fit}
      {getIsLoading}
      {getIsUploading}
      {getIsHighlighted}
      {highlightClass}
      {getBadgeLabel}
      {getBadgeClass}
      {isIntentDisabled}
      {onIntentChange}
      {onRetryUpload}
      onLoad={onThumbnailLoad}
      onError={onThumbnailError}
      onSelect={item => onActiveIdChange?.(item.id)}
      onHover={item => {
        if (disableHoverPreview) return
        onActiveIdChange?.(item.id)
      }}
    />
  </div>
{/snippet}
