<script lang="ts" generics="T, C = T">
// SVELTE
import { tick, untrack } from 'svelte'
import { flip } from 'svelte/animate'
import { cubicOut } from 'svelte/easing'
import { prefersReducedMotion } from 'svelte/motion'
import type { Snippet } from 'svelte'
// BITS
import { Scrollbar } from '#lib/bits/custom/scrollbar/index.js'
import Secondary from './Secondary.svelte'
// CONTEXT
import { setVirtualListRenderContext } from './virtualListContext'

const DEFAULT_ITEM_HEIGHT = 50
const SECONDARY_RENDER_IDLE_MS = 80

let {
  items,
  height,
  itemHeight: estimatedItemHeight,
  children,
  placeholder,
  getKey,
  bufferBefore = 20,
  bufferAfter = 25,
  canResize = false,
  padding = 0,
  rowGap = 0,
  applyBottomOverflow = true,
  onRangeChange,
  getCells,
  getCellKey,
  cell,
  columnCount = 1,
  columnGap = 0,
}: {
  /** Fixed-height grid cells share one keyed list so sorting can animate across rows. */
  getCells?: (item: T) => C[]
  getCellKey?: (cell: C) => string | number
  cell?: Snippet<[C, number]>
  columnCount?: number
  columnGap?: number
  items: Array<T>
  height: string
  itemHeight?: number | undefined
  children: Snippet<[T, number]>
  /** Lightweight content for newly mounted rows until input settles. */
  placeholder?: Snippet<[number]>
  getKey?: (item: T) => string | number
  bufferBefore?: number
  bufferAfter?: number
  canResize?: boolean
  padding?: number
  rowGap?: number
  applyBottomOverflow?: boolean
  onRangeChange?: (start: number, end: number) => void
} = $props()

// Card height changes with responsive image width; include the gutter in the virtual stride.
let measuredCellHeight = $state(0)
const cellHeights = new Map<HTMLElement, number>()
const itemHeight = $derived(
  getCells && measuredCellHeight > 0
    ? measuredCellHeight + rowGap
    : estimatedItemHeight,
)

/** Tracks rendered card heights so virtual rows never overlap responsive content. */
function measureCell(node: HTMLElement): { destroy: () => void } {
  const observer = new ResizeObserver(() => {
    cellHeights.set(node, node.offsetHeight)
    measuredCellHeight = Math.max(0, ...cellHeights.values())
  })
  observer.observe(node)
  return {
    destroy() {
      observer.disconnect()
      cellHeights.delete(node)
      measuredCellHeight = Math.max(0, ...cellHeights.values())
    },
  }
}

let viewport = $state<HTMLElement | null>(null)
let contents = $state<HTMLElement | null>(null)
let renderedRows = $state<HTMLCollectionOf<Element> | null>(null)

let start = $state(0)
let end = $state(0)

// Notify consumers using the visible range, before the overscan buffer is applied.
$effect(() => {
  const first = start,
    last = end
  items.length
  untrack(() => onRangeChange?.(first, last))
})

const renderStart = $derived(Math.max(0, start - bufferBefore))
const renderEnd = $derived(Math.min(items.length, end + bufferAfter))

let top = $state(0)
let bottom = $state(0)

let heightMap: Array<number> = $state([])
let averageHeight: number = $state(DEFAULT_ITEM_HEIGHT)
let viewportHeight = $state(0)

let isMounted: boolean = $state(false)

let resizeObserver: ResizeObserver | null = null
let refreshVersion = 0

const renderedItems: Array<{ id: number | string; data: T; index: number }> = $derived(
  items.slice(renderStart, renderEnd).map((data, offset) => {
    return {
      id: getKey?.(data) ?? offset + renderStart,
      data,
      index: offset + renderStart,
    }
  }),
)

// Flatten only the virtual window, preserving each card's identity across row changes.
const renderedCells = $derived(
  renderedItems.flatMap(row =>
    (getCells?.(row.data) ?? []).map((data, column) => ({
      id: getCellKey?.(data) ?? row.index * columnCount + column,
      data,
      index: row.index * columnCount + column,
      row: row.index - renderStart,
      column,
    })),
  ),
)

let previousCellKeys: Array<string | number> = []
let animateCellReorder = $state(false)

// Animate permutations of the same visible cards, not navigation, resizing, or scrolling.
$effect.pre(() => {
  const keys = renderedCells.map(entry => entry.id)
  const previous = new Set(previousCellKeys)
  animateCellReorder =
    keys.length === previousCellKeys.length &&
    keys.every(key => previous.has(key)) &&
    keys.some((key, index) => key !== previousCellKeys[index])
  previousCellKeys = keys
})

let scrollRAF: number | null = null
let currentScrollTop = $state(0)
let previousScrollTop = 0
let secondaryRenderTimeout = $state<ReturnType<typeof setTimeout> | null>(null)

let renderContext = $state({
  canRenderSecondary: true,
  isScrolling: false,
  isScrollbarDragging: false,
})

setVirtualListRenderContext(renderContext)

const totalContentHeight = $derived.by(() => {
  if (!canResize) {
    return items.length * (itemHeight || DEFAULT_ITEM_HEIGHT) + padding * 2
  }

  // Sparse cache slots are unmeasured rows, and must still contribute to the track.
  const knownHeights = heightMap.filter(value => value > 0)
  const mappedHeight = knownHeights.reduce((sum, value) => sum + value, 0)
  const unmappedCount = Math.max(0, items.length - knownHeights.length)
  return mappedHeight + unmappedCount * averageHeight + padding * 2
})

function clearSecondaryRenderTimeout(): void {
  if (secondaryRenderTimeout !== null) {
    clearTimeout(secondaryRenderTimeout)
    secondaryRenderTimeout = null
  }
}

function setSecondaryRenderingPending(): void {
  if (!renderContext.isScrolling) {
    renderContext.isScrolling = true
  }

  if (renderContext.canRenderSecondary) {
    renderContext.canRenderSecondary = false
  }

  clearSecondaryRenderTimeout()
}

function scheduleSecondaryRenderingResume(): void {
  clearSecondaryRenderTimeout()

  // A paused thumb drag should also resolve placeholders without requiring release.
  secondaryRenderTimeout = setTimeout(() => {
    renderContext.isScrolling = false
    renderContext.canRenderSecondary = true
    secondaryRenderTimeout = null
  }, SECONDARY_RENDER_IDLE_MS)
}

function getBottomOverflow(): number {
  return applyBottomOverflow ? viewportHeight * 0.25 : 0
}

function clampScrollTop(nextScrollTop: number): number {
  const maxScroll = Math.max(
    0,
    totalContentHeight + getBottomOverflow() - viewportHeight,
  )

  return Math.min(Math.max(0, nextScrollTop), maxScroll)
}

$effect(() => {
  const nextItems = items
  const nextViewportHeight = viewportHeight
  const nextItemHeight = itemHeight
  canResize
  padding
  applyBottomOverflow
  bufferBefore
  bufferAfter

  if (isMounted) {
    // Internal range reads must not subscribe refresh to every scroll update.
    untrack(() => void refresh(nextItems, nextViewportHeight, nextItemHeight))
  }
})

/**
 * Updates fixed-height geometry without walking or measuring preceding rows.
 * @returns Nothing; updates the visible range and its surrounding spacers.
 * @remarks Both spacers retain padding and bottom overflow throughout scrolling.
 */
function updateFixedRange(): void {
  if (!viewport) return
  const stride = itemHeight || DEFAULT_ITEM_HEIGHT
  const offset = Math.max(0, viewport.scrollTop - padding)
  currentScrollTop = viewport.scrollTop
  start = Math.min(items.length, Math.floor(offset / stride))
  end = Math.min(items.length, Math.ceil((offset + viewportHeight) / stride))
  top = Math.max(0, start - bufferBefore) * stride
  bottom =
    (items.length - Math.min(items.length, end + bufferAfter)) * stride +
    getBottomOverflow()
}

/**
 * Measures mounted rows and derives the variable-height window from one height model.
 * @param items Current list, including newly appended pages.
 * @param viewportHeight Available scroll viewport height.
 * @param itemHeight Optional fixed row stride.
 * @returns Completion after the new window is mounted and observed.
 * @remarks Measured heights take precedence over estimates in both range selection
 * and spacers. Overscan rows are measured too, including after disclosure changes.
 */
async function refresh(
  items: Array<T>,
  viewportHeight: number,
  itemHeight?: number,
): Promise<void> {
  const version = ++refreshVersion
  const currentViewport = viewport
  const currentRenderedRows = renderedRows

  if (!currentViewport || !currentRenderedRows) return

  if (!canResize) {
    updateFixedRange()
    return
  }

  await tick()

  // The bound elements can disappear during the async tick while routes or portals update.
  if (
    version !== refreshVersion ||
    viewport !== currentViewport ||
    renderedRows !== currentRenderedRows
  )
    return

  // Refresh every mounted height, not just visible rows whose old size is unknown.
  heightMap.length = items.length
  for (let offset = 0; offset < currentRenderedRows.length; offset++) {
    const index = renderStart + offset
    if (index >= items.length) break
    const row = currentRenderedRows[offset] as HTMLElement
    heightMap[index] = itemHeight || row.offsetHeight || DEFAULT_ITEM_HEIGHT
  }
  const knownHeights = heightMap.filter(value => value > 0)
  averageHeight = knownHeights.length
    ? knownHeights.reduce((sum, value) => sum + value, 0) / knownHeights.length
    : itemHeight || DEFAULT_ITEM_HEIGHT

  // Use identical offsets for the visible window, both spacers, and scroll clamping.
  const offsets = [0]
  for (let index = 0; index < items.length; index++) {
    offsets.push(offsets[index] + (heightMap[index] || averageHeight))
  }
  const totalHeight = offsets[items.length]
  const maxScroll = Math.max(
    0,
    totalHeight + padding * 2 + getBottomOverflow() - viewportHeight,
  )
  const scrollTop = Math.min(currentViewport.scrollTop, maxScroll)
  const visibleTop = Math.max(0, scrollTop - padding)
  const visibleBottom = scrollTop + viewportHeight - padding
  let first = 0
  while (first < items.length && offsets[first + 1] <= visibleTop) first++
  let last = first
  while (last < items.length && offsets[last] < visibleBottom) last++

  start = first
  end = last
  top = offsets[Math.max(0, first - bufferBefore)]
  bottom =
    totalHeight -
    offsets[Math.min(items.length, last + bufferAfter)] +
    getBottomOverflow()

  await tick()
  if (
    version !== refreshVersion ||
    viewport !== currentViewport ||
    renderedRows !== currentRenderedRows
  )
    return

  // Observe newly mounted overscan rows so their estimates settle before scrolling.
  for (const row of currentRenderedRows) resizeObserver?.observe(row)
  if (currentViewport.scrollTop > maxScroll) currentViewport.scrollTop = maxScroll
  currentScrollTop = currentViewport.scrollTop
}

/**
 * Keeps normal scrolling populated and defers rendering only for large jumps.
 * @returns Nothing; schedules one visible-range update per animation frame.
 */
function handleScroll(): void {
  const nextScrollTop = viewport?.scrollTop ?? 0
  const distance = Math.abs(nextScrollTop - previousScrollTop)
  previousScrollTop = nextScrollTop

  // Normal input must keep filling the overscan window without waiting for idle.
  if (
    distance >
    Math.max(
      viewportHeight * 2,
      (itemHeight || DEFAULT_ITEM_HEIGHT) * Math.max(bufferBefore, bufferAfter),
    )
  ) {
    setSecondaryRenderingPending()
  } else if (distance > 0) {
    renderContext.isScrolling = true
    renderContext.canRenderSecondary = true
  }
  scheduleSecondaryRenderingResume()

  // Coalesce input into one range update per frame on every browser.
  if (scrollRAF !== null) return
  scrollRAF = requestAnimationFrame(() => {
    scrollRAF = null
    void handleScrollImmediate()
  })
}

/**
 * Reconciles scroll position using the same measured offsets as resize updates.
 * @returns Completion after the visible range and spacers agree.
 */
async function handleScrollImmediate(): Promise<void> {
  await refresh(items, viewportHeight, itemHeight)
}

function handleHeightChange(): void {
  void refresh(items, viewportHeight, itemHeight)
}

function handleVirtualScroll(nextScrollTop: number): void {
  if (!viewport) {
    return
  }

  // Let the scroll event assess distance; thumb input alone does not defer rows.
  viewport.scrollTop = clampScrollTop(nextScrollTop)
}

function handleVirtualInteractionChange(isActive: boolean): void {
  if (renderContext.isScrollbarDragging === isActive) {
    return
  }

  renderContext.isScrollbarDragging = isActive

  // Grabbing the thumb alone is not a reason to replace incoming rows with skeletons.
  if (!isActive) scheduleSecondaryRenderingResume()
}

$effect(() => {
  if (!viewport || !contents) {
    return
  }

  renderedRows = contents.getElementsByTagName('svelte-virtual-list-row')
  resizeObserver = new ResizeObserver(handleHeightChange)

  const scrollViewport = viewport
  scrollViewport.addEventListener('scroll', handleScroll, { passive: true })

  isMounted = true

  return () => {
    scrollViewport.removeEventListener('scroll', handleScroll)

    if (scrollRAF) {
      cancelAnimationFrame(scrollRAF)
      scrollRAF = null
    }

    clearSecondaryRenderTimeout()
    resizeObserver?.disconnect()
    resizeObserver = null
    isMounted = false
  }
})
</script>

<svelte-virtual-list-viewport
  bind:this={viewport}
  bind:offsetHeight={viewportHeight}
  style="height: {height};"
>
  <svelte-virtual-list-contents
    bind:this={contents}
    style="padding-top: {top + padding}px; padding-bottom: {bottom +
      padding}px; padding-left: {padding}px; padding-right: {padding}px;"
  >
    {#if getCells && cell && itemHeight}
      <div
        class="relative mx-2"
        style:height={`${renderedItems.length * itemHeight}px`}
      >
        {#each renderedCells as entry (entry.id)}
          <div
            class="absolute min-w-0"
            use:measureCell
            style:top={`${entry.row * itemHeight}px`}
            style:left={`calc(${entry.column} * ((100% + ${columnGap}px) / ${columnCount}))`}
            style:width={`calc((100% - ${(columnCount - 1) * columnGap}px) / ${columnCount})`}
            animate:flip={{
              duration: animateCellReorder && !prefersReducedMotion.current ? 250 : 0,
              easing: cubicOut,
            }}
          >
            {#if placeholder}
              <Secondary>
                {@render cell(entry.data, entry.index)}
                {#snippet fallback()}
                  {@render placeholder(Math.max(0, itemHeight - rowGap))}
                {/snippet}
              </Secondary>
            {:else}
              {@render cell(entry.data, entry.index)}
            {/if}
          </div>
        {/each}
      </div>
    {:else}
      {#each renderedItems as row (row.id)}
        <svelte-virtual-list-row
          style={`--bits-virtual-list-row-gap: ${Math.max(0, rowGap)}px;`}
        >
          {#if placeholder && !canResize}
            <Secondary>
              {@render children(row.data, row.index)}
              {#snippet fallback()}
                {@render placeholder(
                  Math.max(0, (itemHeight || DEFAULT_ITEM_HEIGHT) - rowGap),
                )}
              {/snippet}
            </Secondary>
          {:else}
            {@render children(row.data, row.index)}
          {/if}
        </svelte-virtual-list-row>
      {/each}
    {/if}
  </svelte-virtual-list-contents>
</svelte-virtual-list-viewport>

{#if viewportHeight > 0 && totalContentHeight > 0}
  <Scrollbar
    virtual={true}
    {viewport}
    {viewportHeight}
    contentsHeight={totalContentHeight + getBottomOverflow()}
    scrollTop={currentScrollTop}
    onVirtualScroll={handleVirtualScroll}
    onVirtualInteractionChange={handleVirtualInteractionChange}
    showThumbOnTrackEnter={true}
    alwaysVisible={true}
    width={{
      track: 18,
      thumb: 10,
      thumbActive: 12,
    }}
    margin={{ top: 16, bottom: 24 }}
  />
{/if}

<style>
svelte-virtual-list-viewport {
  position: relative;
  overflow-y: auto;
  -webkit-overflow-scrolling: touch;
  display: block;
  will-change: scroll-position;
  overflow-anchor: none;
  /* The custom Scrollbar owns the visible thumb; retain native scrolling only. */
  scrollbar-width: none;
}

svelte-virtual-list-viewport::-webkit-scrollbar {
  display: none;
}

svelte-virtual-list-contents,
svelte-virtual-list-row {
  display: block;
  transform: translateZ(0);
  backface-visibility: hidden;
  will-change: transform;
}

svelte-virtual-list-row {
  overflow: visible;
  text-rendering: geometricPrecision;
  -webkit-font-smoothing: subpixel-antialiased;
  contain: layout style;
  position: relative;
  z-index: 1;
  box-sizing: border-box;
  padding-bottom: var(--bits-virtual-list-row-gap, 0px);
}

svelte-virtual-list-row * {
  transform: translateZ(0);
  backface-visibility: hidden;
}

@supports (-webkit-appearance: none) {
  svelte-virtual-list-viewport {
    overscroll-behavior: contain;
    scroll-behavior: auto;
    overflow-anchor: none;
  }
}

@supports (-moz-appearance: none) {
  svelte-virtual-list-viewport {
    will-change: scroll-position;
    scroll-behavior: auto;
  }

  svelte-virtual-list-contents,
  svelte-virtual-list-row {
    will-change: transform;
  }

  svelte-virtual-list-row * {
    will-change: transform;
  }
}
</style>
