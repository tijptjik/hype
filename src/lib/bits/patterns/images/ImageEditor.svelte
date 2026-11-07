<script lang="ts">
// SVELTE
import { tick, onDestroy } from 'svelte'
// ICONS
import AutoSortIcon from 'virtual:icons/proicons/sparkle-2'
import UndoIcon from 'virtual:icons/proicons/arrow-counterclockwise'
import { cx } from '#lib/bits/utils.js'
import { m } from '#lib/i18n.js'
import * as ImagePrimitive from './components'
import AdminViewer from './AdminViewer.svelte'
import ThumbnailWrapper from './ThumbnailWrapper.svelte'
import ImageBackdrop from './components/ImageBackdrop.svelte'
import { getGalleryBackgroundSrc } from '#lib/client/services/image.js'
import ImageSkeleton from './components/ImageSkeleton.svelte'
import Skeleton from '#lib/bits/custom/skeleton/Skeleton.svelte'
// IMAGE ORDER
import { orderGalleryForReview } from '#lib/images/galleryOrder.js'
import { ImageIntentCatalogueSchema } from '#lib/images/intents.js'
// TYPES
import type { ImageEditorProps, ViewerRenderable } from './images.types'

let {
  sortScope,
  sortMode: savedSortMode = 'automatic',
  canSort = false,
  onSortChange,
  onSortPendingChange,
  items: savedItems,
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
  showSortControls = !isReadonly,
  isLoading = false,
  pendingItemCount = 0,
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

// Keep the latest local arrangement visible while older revision saves reconcile.
let optimisticSort = $state<{ mode: 'automatic' | 'manual'; order: string[] } | null>(
  null,
)
const sortMode = $derived(optimisticSort?.mode ?? savedSortMode)
const items = $derived.by<ViewerRenderable[]>(() => {
  if (!optimisticSort) return savedItems
  const positions = new Map(optimisticSort.order.map((id, index) => [id, index]))
  const ordered = [...savedItems].sort(
    (a, b) =>
      (positions.get(a.id) ?? Number.MAX_SAFE_INTEGER) -
      (positions.get(b.id) ?? Number.MAX_SAFE_INTEGER),
  )
  if (optimisticSort.mode === 'manual') return ordered
  const intentOrder = ImageIntentCatalogueSchema.safeParse(
    savedItems[0]?.meta?.intentOptions,
  ).data?.map(intent => intent.id)
  return orderGalleryForReview(
    ordered.map(item => ({
      ...item,
      createdAt: item.createdAt ?? item.status?.sortCreatedAt,
    })),
    'automatic',
    intentOrder,
  )
})
let sortBusy = $state(false)
let sortMessage = $state('')
let previousSort = $state<{ mode: 'automatic' | 'manual'; order: string[] } | null>(
  null,
)
let sortMembership = $state('')
let undoState = $state('')
let lastSortScope = $state<string | undefined>()

let pendingSort: Promise<boolean> | null = null
let sortRequest = 0
let confirmedPreviousSort: typeof previousSort = null
let disposed = false
onDestroy(() => {
  disposed = true
})

/** Apply each drag immediately and persist only the newest order still waiting to be sent.
 * @param mode Desired mode. @param order Explicit drag order, or the latest visible order for Automatic.
 * @param undo Whether to consume Undo.
 * @returns Completion after persistence or rollback to the latest confirmed gallery.
 * @remarks Writes remain sequential so each save uses a fresh revision token; older responses never replace a newer local order.
 */
async function changeSort(
  mode: 'automatic' | 'manual',
  order?: string[],
  undo = false,
): Promise<void> {
  if (!onSortChange || (!canSort && !sortBusy)) return
  const requestedScope = sortScope
  const request = ++sortRequest
  const predecessor = pendingSort
  if (!predecessor) confirmedPreviousSort = previousSort
  const nextOrder = [...(order ?? items.map(item => item.id))]
  const previous = { mode: sortMode, order: items.map(item => item.id) }
  const nextUndo =
    !undo && mode === 'automatic' && previous.mode === 'manual' ? previous : null
  optimisticSort = { mode, order: nextOrder }
  previousSort = nextUndo
  sortBusy = true
  sortMessage = ''
  const operation = (async (): Promise<boolean> => {
    // Publish the settlement handle before issuing a request, and coalesce superseded waiting gestures.
    if (!(await (predecessor ?? Promise.resolve(true)))) return false
    if (disposed || sortScope !== requestedScope) return false
    if (request !== sortRequest) return true
    if (!canSort || !onSortChange) return false
    try {
      await onSortChange(mode, nextOrder)
      await tick()
      if (disposed || sortScope !== requestedScope) return false
      confirmedPreviousSort = nextUndo
      return true
    } catch (cause) {
      if (!disposed && sortScope === requestedScope)
        sortMessage =
          cause instanceof Error ? cause.message : 'Could not save gallery order.'
      return false
    }
  })()
  pendingSort = operation
  onSortPendingChange?.(operation)
  await operation
  if (pendingSort === operation) {
    // Only the newest request can clear the optimistic overlay or restore a failed save.
    optimisticSort = null
    previousSort = confirmedPreviousSort
    undoState = `${savedSortMode}:${savedItems.map(item => item.id).join('|')}`
    sortMembership = savedItems
      .map(item => item.id)
      .sort()
      .join('|')
    pendingSort = null
    sortBusy = false
    if (!disposed) onSortPendingChange?.(null)
  }
}

$effect(() => {
  if (lastSortScope !== sortScope) {
    lastSortScope = sortScope
    pendingSort = null
    sortRequest++
    optimisticSort = null
    confirmedPreviousSort = null
    sortBusy = false
    onSortPendingChange?.(null)
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
const loadingItems = $derived(isLoading && !items.length)
const displayedItemCount = $derived(loadingItems ? pendingItemCount : items.length)
const hasItems = $derived(displayedItemCount > 0)
const adminThumbnailSize = 192
const verticalRailPaddingLeftPx = 16
const verticalRailPaddingRightPx = 16
const hasSortControls = $derived(
  Boolean(
    showSortControls &&
      (canSort || sortBusy) &&
      onSortChange &&
      (sortMode === 'manual' || sortBusy || previousSort?.mode === 'manual'),
  ),
)
const hasGalleryActions = $derived(Boolean(onAddFiles || onDelete || hasSortControls))
const verticalRailBottomBarHeightPx = $derived(hasGalleryActions ? 79 : 0)
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
    {#if sortMessage}
      <p
        role="status"
        class="bg-base-100 text-warning pointer-events-none absolute inset-x-0 top-0 z-50 px-3 py-2 text-sm"
      >
        {sortMessage}
      </p>
    {/if}
    {#if layout === 'top'}
      {@render expandingThumbnailTrack()}
    {/if}
    <div class={cx('relative min-h-0 min-w-0 flex-1', className)}>
      {#if isLoading && !items.length}
        <div class="relative h-full w-full" aria-busy="true" data-image-editor-loading>
          <ImageSkeleton />
        </div>
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

      {#if !isStackedLayout && !loadingItems}
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
      {#if layout === 'bottom'}
        {@render expandingThumbnailTrack()}
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
          {#if loadingItems}
            <div class="flex flex-col gap-4 p-4" aria-hidden="true">
              {#each Array.from({ length: Math.min(displayedItemCount, 6) }) as _}
                <Skeleton class="size-48 shrink-0 rounded-xl" />
              {/each}
            </div>
          {:else}
            <ThumbnailWrapper
              {items}
              onReorder={onSortChange ? ids => changeSort('manual', ids) : undefined}
              reorderDisabled={!canSort || isDeleteMode}
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
          {/if}
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
            leadingControls={hasSortControls ? sortingControls : undefined}
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

{#snippet expandingThumbnailTrack()}
  <div
    data-image-thumbnail-strip
    class={cx(
      'shrink-0 overflow-hidden transition-[height,opacity] duration-300 ease-out motion-reduce:transition-none',
      displayedItemCount > 1 ? 'h-32 opacity-100' : 'h-0 opacity-0',
    )}
  >
    {#if loadingItems && displayedItemCount > 1}
      <div class="flex h-32 gap-2 px-3 py-2" aria-hidden="true">
        {#each Array.from({ length: Math.min(displayedItemCount, 8) }) as _}
          <Skeleton class="size-28 shrink-0 rounded-xl" />
        {/each}
      </div>
    {:else if items.length > 1}
      {@render thumbnailTrack()}
    {/if}
  </div>
{/snippet}

{#snippet thumbnailTrack()}
  <div class="bg-base-100 h-32 shrink-0 px-2 py-1">
    <ThumbnailWrapper
      trackControls={hasSortControls ? sortingControls : undefined}
      {items}
      {activeId}
      variant="admin"
      orientation="horizontal"
      onReorder={onSortChange ? ids => changeSort('manual', ids) : undefined}
      reorderDisabled={!canSort || isDeleteMode}
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
  {#if sortMode === 'automatic' && previousSort?.mode === 'manual'}
    <button
      type="button"
      aria-label="Restore manual image order"
      title="Restore manual image order"
      class="text-base-content/88 hover:text-base-content focus-visible:outline-primary flex size-12 items-center justify-center border-0 bg-transparent shadow-none focus-visible:outline-2 focus-visible:outline-offset-2 disabled:opacity-35"
      disabled={!canSort && !sortBusy}
      onclick={() =>
        previousSort && void changeSort(previousSort.mode, previousSort.order, true)}
    >
      <UndoIcon class="size-[1.71875rem]" />
    </button>
  {:else}
    <button
      type="button"
      aria-label="Automatic image sorting"
      aria-pressed={sortMode === 'automatic'}
      title={sortMode === 'manual' ? 'Restore automatic order' : 'Automatic order'}
      class="text-base-content/88 hover:text-base-content focus-visible:outline-primary flex size-12 items-center justify-center border-0 bg-transparent shadow-none focus-visible:outline-2 focus-visible:outline-offset-2 disabled:opacity-35"
      class:text-primary={sortMode === 'automatic'}
      disabled={(!canSort && !sortBusy) || (sortMode === 'automatic' && !sortBusy)}
      onclick={() => void changeSort('automatic')}
    >
      <AutoSortIcon class="size-[1.71875rem]" />
    </button>
  {/if}
{/snippet}
