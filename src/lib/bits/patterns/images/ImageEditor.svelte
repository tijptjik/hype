<script lang="ts">
import { cx } from '$lib/bits/utils'
import { m } from '$lib/i18n'
import * as ImagePrimitive from './components'
import AdminViewer from './AdminViewer.svelte'
import ThumbnailWrapper from './ThumbnailWrapper.svelte'
import type { ImageEditorProps } from './images.types'

let {
  items,
  activeId = $bindable<string | null>(null),
  isFullscreen = $bindable(false),
  fullscreenRequestKey = 0,
  fit = 'fit',
  uploadSelectionMode = 'multiple',
  disableHoverPreview = false,
  isProcessingUploads = false,
  leftRail,
  rightRail,
  isPublished = false,
  presentationMode = 'contain',
  canMutateActiveImage = false,
  canRotateActiveImage = false,
  canEditActiveImage = false,
  canReplaceActiveImage = false,
  canDownloadActiveImage = false,
  isEditBusy = false,
  isReadonly = false,
  viewerControlsOffsetClass = 'bottom-4',
  getIsHighlighted,
  highlightClass = 'outline outline-2 outline-accent outline-offset-[-2px]',
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
const hasItems = $derived(items.length > 0)
const adminThumbnailSize = 192
const verticalRailPaddingLeftPx = 12
const verticalRailPaddingRightPx = 12
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

$effect(() => {
  if (!items.length) {
    isDeleteMode = false
  }
})
</script>

<div class="h-full w-full select-none bg-black px-0">
  <div class="flex h-full w-full min-h-0 gap-4">
    <div class="relative min-h-0 min-w-0 flex-1 pt-2">
      <AdminViewer
        {items}
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
        onUploadFiles={onAddFiles}
        {leftRail}
        {rightRail}
      />

      <div
        class="pointer-events-none absolute inset-x-0 bottom-4 z-40 flex justify-center"
      >
        <div
          class={cx(
            'transition-opacity duration-200 ease-out',
            hasItems ? 'pointer-events-auto opacity-100' : 'opacity-0',
          )}
        >
          <ImagePrimitive.ImageViewerControls
            {isPublished}
            {presentationMode}
            canMutate={canMutateActiveImage}
            canRotate={canRotateActiveImage}
            canEdit={canEditActiveImage}
            canReplace={canReplaceActiveImage}
            canDownload={canDownloadActiveImage}
            {isEditBusy}
            offsetClass={viewerControlsOffsetClass}
            disabled={!activeId}
            {onRotateLeft}
            {onRotateRight}
            {onTogglePublished}
            {onPresentationModeChange}
            {onReplaceFiles}
            {onDownload}
          />
        </div>
      </div>
    </div>

    <div
      class={cx(
        'relative flex h-full shrink-0 flex-col overflow-hidden bg-base-400 transition-[width,transform,opacity] duration-220 ease-out',
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
          class="min-h-0 h-full"
          size={adminThumbnailSize}
          {fit}
          prefetchFit={viewerFit}
          {isDeleteMode}
          {getIsHighlighted}
          {highlightClass}
          {getIsBlurred}
          {getIsGreyscale}
          {getIsLoading}
          {getIsUploading}
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
        class="pointer-events-none absolute inset-x-0 bottom-0 z-20 border-t border-black/10 bg-black"
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
          disabled={isReadonly}
          {isProcessingUploads}
          {isDeleteMode}
          onToggleDeleteMode={() => {
            isDeleteMode = !isDeleteMode
          }}
          {onAddFiles}
        />
      </div>
    </div>
  </div>
</div>
