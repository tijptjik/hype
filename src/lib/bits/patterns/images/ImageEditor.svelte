<script lang="ts">
// SVELTE
import { tick } from 'svelte'
// ICONS
import SortIcon from 'virtual:icons/proicons/arrow-swap'
import UndoIcon from 'virtual:icons/proicons/arrow-counterclockwise'
import { cx } from '#lib/bits/utils.js'
import { m } from '#lib/i18n.js'
import * as ImagePrimitive from './components'
import AdminViewer from './AdminViewer.svelte'
import ThumbnailWrapper from './ThumbnailWrapper.svelte'
import ImageBackdrop from './components/ImageBackdrop.svelte'
import { getGalleryBackgroundSrc } from '#lib/client/services/image.js'
import ImageSkeleton from './components/ImageSkeleton.svelte'
import type { ImageEditorProps } from './images.types'

let {
  sortScope,
  sortMode = 'automatic',
  canSort = false,
  onSortChange,
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
  isLoading = false,
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

let sortBusy = $state(false)
let sortMessage = $state('')
let previousSort = $state<{ mode: 'automatic' | 'manual'; order: string[] } | null>(
  null,
)
let sortMembership = $state('')
let undoState = $state('')
let lastSortScope = $state<string | undefined>()

/** Persists a completed gesture or mode choice, retaining the last manual arrangement while Automatic is active in this session.
 * @param mode Desired mode. @param order Complete displayed membership. @param undo Whether to consume Undo.
 * @returns Completion after persistence or a visible recoverable error.
 */
async function changeSort(
  mode: 'automatic' | 'manual',
  order = items.map(item => item.id),
  undo = false,
): Promise<void> {
  if (!onSortChange || !canSort || sortBusy) return
  const requestedScope = sortScope
  const previous = { mode: sortMode, order: items.map(item => item.id) }
  sortBusy = true
  sortMessage = ''
  try {
    await onSortChange(mode, order)
    await tick()
    if (sortScope !== requestedScope) return
    previousSort =
      !undo && mode === 'automatic' && previous.mode === 'manual' ? previous : null
    undoState = `${sortMode}:${items.map(item => item.id).join('|')}`
    sortMembership = [...order].sort().join('|')
    // Successful changes are reflected by the toggle; only failures need a message.
  } catch (cause) {
    sortMessage =
      cause instanceof Error ? cause.message : 'Could not save gallery order.'
  } finally {
    sortBusy = false
  }
}

$effect(() => {
  if (lastSortScope !== sortScope) {
    lastSortScope = sortScope
    previousSort = null
    sortMessage = ''
  }
  if (
    !sortBusy &&
    previousSort &&
    ([...items.map(item => item.id)].sort().join('|') !== sortMembership ||
      `${sortMode}:${items.map(item => item.id).join('|')}` !== undoState)
  )
    previousSort = null
})

$effect(() => {
  if (items.length && !items.some(item => item.id === activeId)) {
    activeId = items[0].id
    onActiveIdChange?.(activeId)
  }
})

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
const hasSortControls = $derived(
  Boolean(onSortChange && (sortMode === 'manual' || previousSort?.mode === 'manual')),
)
const railWidth = $derived(
  hasItems ? `${verticalRailWidthPx + (hasSortControls ? 40 : 0)}px` : '0px',
)
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
    {#if sortMessage}
      <p
        role="status"
        class="bg-base-100 text-warning pointer-events-none absolute inset-x-0 top-0 z-50 px-3 py-2 text-sm"
      >
        {sortMessage}
      </p>
    {/if}
    {#if layout === 'top' && items.length > 1}
      {@render thumbnailTrack()}
    {/if}
    <div class={cx('relative min-h-0 min-w-0 flex-1', className)}>
      {#if isLoading && !items.length}
        <div class="relative h-full w-full" aria-busy="true" data-image-editor-loading><ImageSkeleton /></div>
      {:else}
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
        isEmptyUploadEnabled={Boolean(onAddFiles)}
        isEmptyUploadDisabled={isReadonly}
        isEmptyDropzoneEnabled={!isReadonly}
        onUploadFiles={onAddFiles}
        leftRail={isStackedLayout ? undefined : leftRail}
        rightRail={isStackedLayout ? undefined : rightRail}
      />
      {/if}

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
            trackControls={onSortChange &&
            (sortMode === 'manual' || previousSort?.mode === 'manual')
              ? sortingControls
              : undefined}
            {items}
            onReorder={onSortChange ? ids => changeSort('manual', ids) : undefined}
            reorderDisabled={!canSort || sortBusy || isDeleteMode}
            {activeId}
            followActiveIdRequestKey={thumbnailFollowActiveRequestKey}
            followActiveIdRequestId={thumbnailFollowActiveRequestId}
            variant="admin"
            orientation="vertical"
            trackClass="pt-4!"
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
      trackControls={onSortChange &&
      (sortMode === 'manual' || previousSort?.mode === 'manual')
        ? sortingControls
        : undefined}
      {items}
      {activeId}
      variant="admin"
      orientation="horizontal"
      onReorder={onSortChange ? ids => changeSort('manual', ids) : undefined}
      reorderDisabled={!canSort || sortBusy || isDeleteMode}
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

{#snippet sortingControls()}
  <button
    type="button"
    aria-label="Automatic image sorting"
    aria-pressed={sortMode === 'automatic'}
    title={sortMode === 'manual' ? 'Restore automatic order' : 'Automatic order'}
    class="border-border bg-base-100/95 text-base-content flex size-8 items-center justify-center rounded-full border shadow-sm disabled:opacity-50"
    class:text-primary={sortMode === 'automatic'}
    disabled={!canSort || sortBusy || sortMode === 'automatic'}
    onclick={() => void changeSort('automatic')}
  >
    <SortIcon class="size-4" />
  </button>
  {#if sortMode === 'automatic' && previousSort?.mode === 'manual'}
    <button
      type="button"
      aria-label="Restore manual image order"
      title="Restore manual image order"
      class="border-border bg-base-100/95 text-base-content flex size-8 items-center justify-center rounded-full border shadow-sm disabled:opacity-50"
      disabled={!canSort || sortBusy}
      onclick={() =>
        previousSort && void changeSort(previousSort.mode, previousSort.order, true)}
    >
      <UndoIcon class="size-4" />
    </button>
  {/if}
{/snippet}
