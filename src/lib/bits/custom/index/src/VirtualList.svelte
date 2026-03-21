<script lang="ts" generics="T">
// SVELTE
import { tick } from 'svelte'
import type { Snippet } from 'svelte'
// BITS
import { Scrollbar } from '$lib/bits/custom/scrollbar'
// CONTEXT
import { setVirtualListRenderContext } from './virtualListContext'

const DEFAULT_ITEM_HEIGHT = 50
const SECONDARY_RENDER_IDLE_MS = 50

let {
  items,
  height,
  itemHeight,
  children,
  getKey,
  bufferBefore = 20,
  bufferAfter = 25,
  canResize = false,
  padding = 0,
  rowGap = 0,
  applyBottomOverflow = true,
}: {
  items: Array<T>
  height: string
  itemHeight?: number | undefined
  children: Snippet<[T, number]>
  getKey?: (item: T) => string | number
  bufferBefore?: number
  bufferAfter?: number
  canResize?: boolean
  padding?: number
  rowGap?: number
  applyBottomOverflow?: boolean
} = $props()

let viewport = $state<HTMLElement | null>(null)
let contents = $state<HTMLElement | null>(null)
let renderedRows = $state<HTMLCollectionOf<Element> | null>(null)

let start = $state(0)
let end = $state(0)

const renderStart = $derived(Math.max(0, start - bufferBefore))
const renderEnd = $derived(Math.min(items.length, end + bufferAfter))

let top = $state(0)
let bottom = $state(0)

let heightMap: Array<number> = $state([])
let averageHeight: number = $state(DEFAULT_ITEM_HEIGHT)
let viewportHeight = $state(0)

let isChrome =
  typeof window !== 'undefined' &&
  /Chrome/.test(navigator.userAgent) &&
  !/Edg|OPR/.test(navigator.userAgent)
let isMounted: boolean = $state(false)

let resizeObserver: ResizeObserver | null = null

const renderedItems: Array<{ id: number | string; data: T; index: number }> = $derived(
  items.slice(renderStart, renderEnd).map((data, offset) => {
    return {
      id: getKey?.(data) ?? offset + renderStart,
      data,
      index: offset + renderStart,
    }
  }),
)

let scrollRAF: number | null = null
let currentScrollTop = $state(0)
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

  const mappedHeight = heightMap.reduce(
    (sum, value) => sum + (value || averageHeight || DEFAULT_ITEM_HEIGHT),
    0,
  )
  const unmappedCount = Math.max(0, items.length - heightMap.length)
  const unmappedHeight = unmappedCount * (averageHeight || DEFAULT_ITEM_HEIGHT)

  return mappedHeight + unmappedHeight + padding * 2
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

  if (renderContext.isScrollbarDragging) {
    return
  }

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
  items
  viewportHeight
  itemHeight

  if (isMounted) {
    void refresh(items, viewportHeight, itemHeight)
  }
})

async function refresh(
  items: Array<T>,
  viewportHeight: number,
  itemHeight?: number,
): Promise<void> {
  if (!viewport || !renderedRows) {
    return
  }

  const { scrollTop } = viewport
  await tick()

  let contentHeight = scrollTop - top
  let index = start

  while (contentHeight < viewportHeight && index < items.length) {
    let row = renderedRows[index - renderStart]

    if (!row) {
      end = index + 1
      await tick()
      row = renderedRows[index - renderStart]
    }

    const rowHeight =
      itemHeight || (row && (row as HTMLElement).offsetHeight) || DEFAULT_ITEM_HEIGHT
    heightMap[index] = rowHeight
    contentHeight += rowHeight
    index += 1
  }

  end = index

  const knownHeights = heightMap.filter(value => value > 0)
  averageHeight =
    knownHeights.length > 0
      ? knownHeights.reduce((sum, value) => sum + value, 0) / knownHeights.length
      : itemHeight || DEFAULT_ITEM_HEIGHT

  top = heightMap
    .slice(0, renderStart)
    .reduce((sum, value) => sum + (value || averageHeight), 0)

  const remaining = items.length - renderEnd
  const bottomOverflow = getBottomOverflow()
  bottom = remaining * averageHeight + bottomOverflow

  heightMap.length = items.length

  const totalHeight = canResize
    ? heightMap.reduce((sum, value) => sum + (value || averageHeight), 0)
    : items.length * (itemHeight || DEFAULT_ITEM_HEIGHT)

  if (scrollTop + viewportHeight > totalHeight + bottomOverflow) {
    const maxScroll = Math.max(0, totalHeight + bottomOverflow - viewportHeight)

    if (scrollTop > maxScroll) {
      viewport.scrollTo(0, maxScroll)
    }
  }

  currentScrollTop = viewport.scrollTop

  if (canResize) {
    for (const row of renderedRows) {
      if (row) {
        resizeObserver?.observe(row)
      }
    }
  }
}

async function handleScroll(): Promise<void> {
  setSecondaryRenderingPending()
  scheduleSecondaryRenderingResume()

  if (isChrome) {
    await handleScrollImmediate()
    return
  }

  if (scrollRAF) {
    cancelAnimationFrame(scrollRAF)
  }

  scrollRAF = requestAnimationFrame(async () => {
    await handleScrollImmediate()
    scrollRAF = null
  })
}

async function handleScrollImmediate(): Promise<void> {
  if (!viewport || !renderedRows) {
    return
  }

  const { scrollTop } = viewport
  currentScrollTop = scrollTop
  const oldRenderStart = renderStart
  const oldRenderEnd = renderEnd

  if (canResize) {
    for (
      let renderedIndex = 0;
      renderedIndex < renderedRows.length;
      renderedIndex += 1
    ) {
      const element = renderedRows[renderedIndex] as HTMLElement
      const actualIndex = renderStart + renderedIndex

      if (element && actualIndex < items.length) {
        if (
          !heightMap[actualIndex] ||
          actualIndex < oldRenderStart ||
          actualIndex >= oldRenderEnd
        ) {
          heightMap[actualIndex] = element.offsetHeight
        }
      }
    }
  }

  let index = 0
  let y = 0

  while (index < items.length) {
    const rowHeight =
      (canResize ? averageHeight || heightMap[index] : itemHeight) ||
      DEFAULT_ITEM_HEIGHT

    if (y + rowHeight > scrollTop) {
      start = index
      top = y
      break
    }

    y += rowHeight
    index += 1
  }

  while (index < items.length) {
    const rowHeight =
      (canResize ? averageHeight || heightMap[index] : itemHeight) ||
      DEFAULT_ITEM_HEIGHT

    y += rowHeight
    index += 1

    if (y > scrollTop + viewportHeight) {
      break
    }
  }

  end = index

  if (canResize && end > 0) {
    const newAverage = y / end || itemHeight || DEFAULT_ITEM_HEIGHT
    averageHeight = averageHeight ? averageHeight * 0.8 + newAverage * 0.2 : newAverage
  } else {
    averageHeight = itemHeight || DEFAULT_ITEM_HEIGHT
  }

  if (canResize) {
    const nextRenderStart = Math.max(0, start - bufferBefore)
    const nextRenderEnd = Math.min(items.length, end + bufferAfter)

    for (let fillIndex = nextRenderStart; fillIndex < nextRenderEnd; fillIndex += 1) {
      if (!heightMap[fillIndex]) {
        heightMap[fillIndex] = averageHeight
      }
    }
  }

  const nextRenderStart = Math.max(0, start - bufferBefore)

  if (canResize) {
    top = heightMap
      .slice(0, nextRenderStart)
      .reduce((sum, value) => sum + (value || averageHeight), 0)
  } else {
    top = nextRenderStart * (itemHeight || DEFAULT_ITEM_HEIGHT)
  }

  const nextRenderEnd = Math.min(items.length, end + bufferAfter)
  const remaining = items.length - nextRenderEnd
  const estimatedHeight = canResize ? averageHeight : itemHeight || DEFAULT_ITEM_HEIGHT

  bottom = remaining * estimatedHeight
}

function handleHeightChange(): void {
  void refresh(items, viewportHeight, itemHeight)
}

function handleVirtualScroll(nextScrollTop: number): void {
  if (!viewport) {
    return
  }

  setSecondaryRenderingPending()
  viewport.scrollTop = clampScrollTop(nextScrollTop)
}

function handleVirtualInteractionChange(isActive: boolean): void {
  if (renderContext.isScrollbarDragging === isActive) {
    return
  }

  renderContext.isScrollbarDragging = isActive

  if (isActive) {
    setSecondaryRenderingPending()
    return
  }

  scheduleSecondaryRenderingResume()
}

$effect(() => {
  if (!viewport || !contents) {
    return
  }

  renderedRows = contents.getElementsByTagName('svelte-virtual-list-row')
  resizeObserver = new ResizeObserver(handleHeightChange)

  if (isChrome) {
    viewport.addEventListener('scroll', handleScroll, { passive: true })
  }

  isMounted = true

  return () => {
    if (isChrome) {
      viewport?.removeEventListener('scroll', handleScroll)
    }

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
  onscroll={isChrome ? undefined : handleScroll}
  style="height: {height};"
>
  <svelte-virtual-list-contents
    bind:this={contents}
    style="padding-top: {top + padding}px; padding-bottom: {bottom +
      padding}px; padding-left: {padding}px; padding-right: {padding}px;"
  >
    {#each renderedItems as row (row.id)}
      <svelte-virtual-list-row
        style={`--bits-virtual-list-row-gap: ${Math.max(0, rowGap)}px;`}
      >
        {@render children(row.data, row.index)}
      </svelte-virtual-list-row>
    {/each}
  </svelte-virtual-list-contents>
</svelte-virtual-list-viewport>

{#if viewportHeight > 0 && totalContentHeight > 0}
  <Scrollbar
    virtual={true}
    {viewport}
    {viewportHeight}
    contentsHeight={totalContentHeight}
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
  scrollbar-width: auto;
  scrollbar-color: auto;
}

svelte-virtual-list-viewport::-webkit-scrollbar {
  width: 12px;
  will-change: auto;
  contain: none;
}

svelte-virtual-list-viewport::-webkit-scrollbar-track {
  background: transparent;
  will-change: auto;
  transform: translateZ(0);
}

svelte-virtual-list-viewport::-webkit-scrollbar-thumb {
  background-color: rgba(0, 0, 0, 0.3);
  border-radius: 6px;
  will-change: auto;
  transform: translateZ(0);
  contain: none;
}

svelte-virtual-list-viewport::-webkit-scrollbar-thumb:hover {
  background-color: rgba(0, 0, 0, 0.5);
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
    overflow-anchor: auto;
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
