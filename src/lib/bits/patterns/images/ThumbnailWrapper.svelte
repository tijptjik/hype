<script lang="ts">
// SVELTE
import { flip } from 'svelte/animate'
import { onDestroy } from 'svelte'
// THIRD-PARTY
import { dndzone, TRIGGERS, SOURCES, type DndEvent } from 'svelte-dnd-action'
// LIB
import { cx } from '#lib/bits/utils.js'
import { buildGallerySceneAssetUrls } from '#lib/client/services/image.js'
// BITS
import Thumbnail from './Thumbnail.svelte'
import AdminThumbnail from './AdminThumbnail.svelte'
// TYPES
import type { ThumbnailWrapperProps, ViewerRenderable } from './images.types'

let {
  onReorder,
  trackControls,
  reorderDisabled = false,
  items,
  activeId = $bindable<string | null>(null),
  followActiveIdRequestKey = 0,
  followActiveIdRequestId = null,
  fit = 'fit',
  prefetchFit = fit,
  variant = 'default',
  class: className = '',
  size = 128,
  orientation = 'horizontal',
  isDeleteMode = false,
  flipMode = true,
  getIsHighlighted,
  highlightClass = 'outline outline-2 outline-accent outline-offset-[-2px]',
  getBadgeLabel,
  getBadgeClass,
  getIsBlurred,
  getIsGreyscale,
  getIsLoading,
  getIsUploading,
  isIntentDisabled = false,
  onIntentChange,
  onDelete,
  onRetryUpload,
  onSelect,
  onHover,
  onLoad,
  onError,
  footer,
  trackClass = '',
}: ThumbnailWrapperProps = $props()

const dragZoneId = $props.id()
let dragItems = $state<ViewerRenderable[] | null>(null)
let reorderPending = $state(0)
const displayedItems = $derived(dragItems ?? items)

/** Commits only a completed in-zone gesture, leaving selection unchanged.
 * @param next Completed thumbnail sequence. @returns Completion after save or rollback.
 */
async function finishReorder(next: ViewerRenderable[]): Promise<void> {
  const ids = next.map(item => item.id)
  if (
    !onReorder ||
    reorderDisabled ||
    ids.length !== items.length ||
    new Set(ids).size !== ids.length ||
    ids.some(id => !items.some(item => item.id === id)) ||
    ids.every((id, index) => id === items[index].id)
  ) {
    dragItems = null
    return
  }
  reorderPending++
  clearHoverDebounce()
  pendingHoverItem = null
  // The editor owns the optimistic order after drop; a completed save must never clear a newer gesture.
  try {
    const saving = onReorder(ids)
    dragItems = null
    await saving
  } finally {
    reorderPending--
  }
}

/** Tracks DND previews; keyboard sorting commits once when the user drops the item.
 * @param event Svelte DND consideration event. @returns Nothing.
 */
function considerReorder(event: CustomEvent<DndEvent<ViewerRenderable>>): void {
  dragItems = event.detail.items
  clearHoverDebounce()
  pendingHoverItem = null
  if (event.detail.info.trigger === TRIGGERS.DRAG_STOPPED)
    void finishReorder(event.detail.items)
}

/** Completes pointer drops; keyboard movement remains a preview until drop.
 * @param event Svelte DND finalization event. @returns Nothing.
 */
function finalizeReorder(event: CustomEvent<DndEvent<ViewerRenderable>>): void {
  dragItems = event.detail.items
  if (event.detail.info.source === SOURCES.KEYBOARD) return
  if (event.detail.info.trigger === TRIGGERS.DROPPED_INTO_ZONE)
    void finishReorder(event.detail.items)
  else dragItems = null
}

let trackEl = $state<HTMLElement>()
let previousItemsLength = $state(0)
let lastHandledFollowActiveIdRequestKey = $state(0)
let skipNextActiveScroll = false
let isPointerInsideTrack = false
let pendingHoverItem: ViewerRenderable | null = null
let lastTrackInteractionAt = 0
let hoverDebounceTimeout: ReturnType<typeof setTimeout> | null = null
let uploadBatchScrollTimeout: ReturnType<typeof setTimeout> | null = null
let isWaitingForUploadBatchScroll = false
let prefetchedSceneAssetUrls = $state<string[]>([])
let visiblePrefetchFrame: number | null = null
let suppressTrackClick = $state(false)

const HOVER_TARGET_DEBOUNCE_MS = 80
const UPLOAD_BATCH_SCROLL_SETTLE_MS = 160

function handleSelect(item: ViewerRenderable): void {
  if (!dragItems && !reorderPending) onSelect?.(item)
}

function clearHoverDebounce(): void {
  if (hoverDebounceTimeout !== null) {
    clearTimeout(hoverDebounceTimeout)
    hoverDebounceTimeout = null
  }
}

function clearUploadBatchScroll(): void {
  if (uploadBatchScrollTimeout !== null) {
    clearTimeout(uploadBatchScrollTimeout)
    uploadBatchScrollTimeout = null
  }
}

function clearVisiblePrefetchFrame(): void {
  if (visiblePrefetchFrame !== null) {
    cancelAnimationFrame(visiblePrefetchFrame)
    visiblePrefetchFrame = null
  }
}

function flushPendingHover(): void {
  if (!isPointerInsideTrack || !pendingHoverItem) return
  onHover?.(pendingHoverItem)
  pendingHoverItem = null
  clearHoverDebounce()
}

function scheduleHoverDebounce(): void {
  if (!isPointerInsideTrack || !pendingHoverItem) return

  clearHoverDebounce()

  const elapsed = Date.now() - lastTrackInteractionAt
  const remainingDelay = Math.max(0, HOVER_TARGET_DEBOUNCE_MS - elapsed)

  if (remainingDelay === 0) {
    flushPendingHover()
    return
  }

  hoverDebounceTimeout = setTimeout(() => {
    flushPendingHover()
  }, remainingDelay)
}

function handleTrackPointerEnter(): void {
  isPointerInsideTrack = true
  lastTrackInteractionAt = Date.now()
}

function handleTrackPointerMove(): void {
  if (!isPointerInsideTrack) return
  lastTrackInteractionAt = Date.now()

  if (pendingHoverItem) {
    scheduleHoverDebounce()
  }
}
function handleTrackWheel(event: WheelEvent): void {
  if (!trackEl || orientation !== 'horizontal') return

  const hasHorizontalOverflow = trackEl.scrollWidth > trackEl.clientWidth
  if (!hasHorizontalOverflow) return

  const scrollDelta =
    Math.abs(event.deltaY) >= Math.abs(event.deltaX) ? event.deltaY : event.deltaX

  if (scrollDelta === 0) return

  event.preventDefault()
  trackEl.scrollLeft += scrollDelta
}

function handleTrackClickCapture(event: MouseEvent): void {
  if (!suppressTrackClick) return

  event.preventDefault()
  event.stopPropagation()
  suppressTrackClick = false
}

function handleTrackScroll(): void {
  scheduleVisiblePrefetchSync()

  if (!isPointerInsideTrack) return
  lastTrackInteractionAt = Date.now()

  if (pendingHoverItem) {
    scheduleHoverDebounce()
  }
}

function handleTrackPointerLeave(): void {
  isPointerInsideTrack = false
  pendingHoverItem = null
  clearHoverDebounce()
}

function handleItemHover(item: ViewerRenderable): void {
  if (!onHover || dragItems || reorderPending) return

  if (!isPointerInsideTrack) {
    onHover(item)
    return
  }

  pendingHoverItem = item
  scheduleHoverDebounce()
}

function resolveIsBlurred(item: ViewerRenderable): boolean {
  if (item.isPublished === true) return false
  return getIsBlurred?.(item) ?? false
}

function resolveIsGreyscale(item: ViewerRenderable): boolean {
  if (item.isPublished === true) return false
  return getIsGreyscale?.(item) ?? false
}

function hasUploadingItems(nextItems: ViewerRenderable[]): boolean {
  return nextItems.some(item => getIsUploading?.(item) ?? false)
}

function areStringListsEqual(left: string[], right: string[]): boolean {
  if (left.length !== right.length) return false

  return left.every((value, index) => value === right[index])
}

function syncVisibleScenePrefetch(): void {
  visiblePrefetchFrame = null

  if (!trackEl || items.length === 0) return

  const isVertical = orientation === 'vertical'
  const viewportStart = isVertical ? trackEl.scrollTop : trackEl.scrollLeft
  const viewportSize = isVertical ? trackEl.clientHeight : trackEl.clientWidth
  const viewportEnd = viewportStart + viewportSize
  const visibleIndices = new Set<number>()
  const nextSceneAssetUrls = new Set(prefetchedSceneAssetUrls)

  for (const node of trackEl.querySelectorAll<HTMLElement>(
    '[data-gallery-thumb-index]',
  )) {
    const index = Number.parseInt(node.dataset.galleryThumbIndex ?? '', 10)
    if (!Number.isInteger(index) || index < 0 || index >= items.length) continue

    const nodeStart = isVertical ? node.offsetTop : node.offsetLeft
    const nodeSize = isVertical ? node.offsetHeight : node.offsetWidth
    const nodeEnd = nodeStart + nodeSize

    if (nodeEnd > viewportStart && nodeStart < viewportEnd) {
      visibleIndices.add(index)
    }
  }

  if (visibleIndices.size === 0) return

  for (const visibleIndex of visibleIndices) {
    for (const candidateIndex of [visibleIndex - 1, visibleIndex, visibleIndex + 1]) {
      const item = items[candidateIndex]
      if (!item) continue

      for (const url of buildGallerySceneAssetUrls(item, prefetchFit)) {
        nextSceneAssetUrls.add(url)
      }
    }
  }

  const nextPrefetchedSceneAssetUrls = Array.from(nextSceneAssetUrls)
  if (areStringListsEqual(nextPrefetchedSceneAssetUrls, prefetchedSceneAssetUrls)) {
    return
  }

  prefetchedSceneAssetUrls = nextPrefetchedSceneAssetUrls
}

function scheduleVisiblePrefetchSync(): void {
  if (visiblePrefetchFrame !== null) return

  visiblePrefetchFrame = requestAnimationFrame(() => {
    syncVisibleScenePrefetch()
  })
}

function scheduleUploadBatchScroll(): void {
  clearUploadBatchScroll()
  isWaitingForUploadBatchScroll = true

  uploadBatchScrollTimeout = setTimeout(() => {
    skipNextActiveScroll = true
    isWaitingForUploadBatchScroll = false
    trackEl?.scrollTo({
      top: 0,
      behavior: 'smooth',
    })
    uploadBatchScrollTimeout = null
  }, UPLOAD_BATCH_SCROLL_SETTLE_MS)
}

function scrollActiveThumbnailIntoView(activeNode: HTMLElement): void {
  if (!trackEl) return

  const isVertical = orientation === 'vertical'
  const trackStyles = getComputedStyle(trackEl)
  const trackGap = Number.parseFloat(
    isVertical ? trackStyles.rowGap : trackStyles.columnGap,
  )
  const gutterSize = Number.isFinite(trackGap) ? trackGap : 0
  const startPadding = Number.parseFloat(
    isVertical ? trackStyles.paddingTop : trackStyles.paddingLeft,
  )
  const endPadding = Number.parseFloat(
    isVertical ? trackStyles.paddingBottom : trackStyles.paddingRight,
  )
  const startBuffer = Math.max(
    gutterSize,
    Number.isFinite(startPadding) ? startPadding : 0,
  )
  const endBuffer = Math.max(gutterSize, Number.isFinite(endPadding) ? endPadding : 0)
  const currentScroll = isVertical ? trackEl.scrollTop : trackEl.scrollLeft
  const activeStart = isVertical ? activeNode.offsetTop : activeNode.offsetLeft
  const activeSize = isVertical ? activeNode.offsetHeight : activeNode.offsetWidth
  const activeEnd = activeStart + activeSize
  const viewportStart = currentScroll
  const viewportSize = isVertical ? trackEl.clientHeight : trackEl.clientWidth
  const viewportEnd = viewportStart + viewportSize
  const maxScroll = isVertical
    ? trackEl.scrollHeight - viewportSize
    : trackEl.scrollWidth - viewportSize

  if (activeStart - startBuffer < viewportStart) {
    const targetScroll = Math.max(activeStart - startBuffer, 0)

    trackEl.scrollTo(
      isVertical
        ? {
            top: targetScroll,
            behavior: 'smooth',
          }
        : {
            left: targetScroll,
            behavior: 'smooth',
          },
    )
    return
  }

  if (activeEnd + endBuffer > viewportEnd) {
    const targetScroll = Math.min(
      Math.max(activeEnd + endBuffer - viewportSize, 0),
      Math.max(maxScroll, 0),
    )

    trackEl.scrollTo(
      isVertical
        ? {
            top: targetScroll,
            behavior: 'smooth',
          }
        : {
            left: targetScroll,
            behavior: 'smooth',
          },
    )
  }
}

$effect(() => {
  if (!trackEl) return

  const itemCountIncreased = items.length > previousItemsLength
  previousItemsLength = items.length

  if (orientation !== 'vertical' || !itemCountIncreased) {
    return
  }

  // Wait for a burst of optimistic upload previews to finish rendering before
  // moving the rail, so manual scrolling is only interrupted once per batch.
  if (hasUploadingItems(items)) {
    scheduleUploadBatchScroll()
    return
  }

  isWaitingForUploadBatchScroll = false
  clearUploadBatchScroll()
})

$effect(() => {
  if (!trackEl) return

  items.length
  prefetchFit
  orientation

  scheduleVisiblePrefetchSync()

  const resizeObserver = new ResizeObserver(() => {
    scheduleVisiblePrefetchSync()
  })

  resizeObserver.observe(trackEl)

  return () => {
    resizeObserver.disconnect()
  }
})

$effect(() => {
  if (!trackEl) return

  if (isWaitingForUploadBatchScroll) {
    return
  }

  if (followActiveIdRequestKey === lastHandledFollowActiveIdRequestKey) {
    return
  }

  lastHandledFollowActiveIdRequestKey = followActiveIdRequestKey

  if (skipNextActiveScroll) {
    skipNextActiveScroll = false
    return
  }

  const targetActiveId = followActiveIdRequestId ?? activeId
  if (!targetActiveId) return

  const activeNode = trackEl.querySelector<HTMLElement>(
    `[data-gallery-thumb-id="${targetActiveId}"]`,
  )
  if (!activeNode) return

  scrollActiveThumbnailIntoView(activeNode)
})

$effect(() => {
  return () => {
    clearHoverDebounce()
    clearUploadBatchScroll()
  }
})

onDestroy(() => {
  clearVisiblePrefetchFrame()
})
</script>

<div
  class={cx(
    'flex h-full w-full min-h-0 flex-col overflow-hidden select-none',
    className,
  )}
>
  {#each prefetchedSceneAssetUrls as url (url)}
    <img
      src={url}
      alt=""
      aria-hidden="true"
      class="pointer-events-none absolute h-0 w-0 opacity-0"
    >
  {/each}

  <div class="flex min-h-0 min-w-0 flex-1">
    <!-- One fixed control rail precedes the scrolling thumbnails and never follows selection. -->
    <div
      class="shrink-0 overflow-hidden transition-[width] duration-200 motion-reduce:transition-none"
      class:w-10={Boolean(trackControls)}
      class:w-0={!trackControls}
    >
      {#if trackControls}
        <fieldset
          class="flex w-10 min-w-0 flex-col items-center gap-1 pt-1"
          aria-label="Gallery order controls"
        >
          {@render trackControls()}
        </fieldset>
      {/if}
    </div>
    <section
      bind:this={trackEl}
      use:dndzone={{
        items: displayedItems,
        type: dragZoneId,
        flipDurationMs: 220,
        dragDisabled: !onReorder || reorderDisabled,
        zoneTabIndex: -1,
        zoneItemTabIndex: onReorder && !reorderDisabled ? 0 : -1,
        dropFromOthersDisabled: true,
        dropTargetStyle: {},
        transformDraggedElement: element => {
          if (element) element.style.outline = 'none'
        },
        delayTouchStart: 200,
      }}
      onconsider={considerReorder}
      onfinalize={finalizeReorder}
      aria-label="Gallery thumbnails"
      onmouseenter={handleTrackPointerEnter}
      onmousemove={handleTrackPointerMove}
      onwheel={handleTrackWheel}
      onclickcapture={handleTrackClickCapture}
      onmouseleave={handleTrackPointerLeave}
      onscroll={handleTrackScroll}
      class={cx(
        'flex min-h-0 w-full min-w-0 flex-1 gap-2 select-none',
        'overscroll-contain',
        orientation === 'vertical'
          ? variant === 'admin'
            ? 'flex-col overflow-x-hidden overflow-y-auto px-4 pb-3 pt-3 pr-2'
            : 'flex-col overflow-x-hidden overflow-y-auto pr-2'
          : variant === 'admin'
            ? 'overflow-x-auto overflow-y-hidden bg-surface p-3 mt-3 mr-3'
            : 'overflow-x-auto overflow-y-hidden pb-4',
        trackClass,
      )}
    >
      {#each displayedItems as item, index (item.id)}
        <!-- Thumbnail hover updates the visual preview without adding a separate control. -->
        <figure
          aria-label={`Photo ${index + 1}${item.alt ? `: ${item.alt}` : ''}`}
          data-gallery-thumb-id={item.id}
          data-gallery-thumb-index={index}
          class="relative shrink-0"
          animate:flip={flipMode ? { duration: 220 } : undefined}
          onmouseenter={() => handleItemHover(item)}
        >
          {#if variant === 'admin'}
            <AdminThumbnail
              {item}
              {fit}
              {size}
              isActive={item.id === activeId}
              isHighlighted={getIsHighlighted?.(item) ?? false}
              {highlightClass}
              badgeLabel={getBadgeLabel?.(item) ?? null}
              badgeClass={getBadgeClass?.(item) ?? ''}
              isLoading={getIsLoading?.(item) ?? false}
              isBlurred={resolveIsBlurred(item)}
              isGreyscale={resolveIsGreyscale(item)}
              isUploading={getIsUploading?.(item) ?? false}
              {isDeleteMode}
              {isIntentDisabled}
              intentPopoverSide={orientation === 'horizontal' ? 'top' : 'left'}
              {onIntentChange}
              onSelect={handleSelect}
              onHover={handleItemHover}
              onLoad={() => onLoad?.(item)}
              onError={() => onError?.(item)}
              {onDelete}
              {onRetryUpload}
            />
          {:else}
            <Thumbnail
              {item}
              {fit}
              {size}
              isActive={item.id === activeId}
              isHighlighted={getIsHighlighted?.(item) ?? false}
              {highlightClass}
              isLoading={getIsLoading?.(item) ?? false}
              onSelect={handleSelect}
              onLoad={() => onLoad?.(item)}
              onError={() => onError?.(item)}
            />
          {/if}
        </figure>
      {/each}
    </section>
  </div>

  {#if footer}
    <div
      class={cx(
        variant === 'admin' ? 'border-t border-border bg-base-300 px-3 py-3' : 'pt-4',
      )}
    >
      {@render footer()}
    </div>
  {/if}
</div>
