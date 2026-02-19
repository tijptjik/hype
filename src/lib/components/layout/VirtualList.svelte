<script lang="ts" generics="T">
// SVELTE
import { tick, untrack } from 'svelte'
// COMPONENTS
import Scrollbar from '../common/scrollbars/Scrollbar.svelte'
// TYPES
import type { Snippet } from 'svelte'

// ═══════════════════════
// 1. PROPS
// ═══════════════════════

const {
  items,
  height,
  itemHeight,
  children,
  getKey,
  bufferBefore = 20,
  bufferAfter = 25,
  canResize = false,
  padding = 0,
  applyBottomOverflow = true,
}: {
  items: Array<T>
  height: string
  itemHeight?: number | undefined
  children: Snippet<[T]>
  getKey?: (item: T) => string | number
  bufferBefore?: number
  bufferAfter?: number
  canResize?: boolean
  padding?: number
  applyBottomOverflow?: boolean
} = $props()

// ═══════════════════════
// 2. ELEMENTS
// ═══════════════════════

let viewport: HTMLElement = $state(null!)
let contents: HTMLElement = $state(null!)
let renderedRows: HTMLCollectionOf<Element> = $state(null!)

// ═══════════════════════
// 3. STATE
// ═══════════════════════

// STATE :: INDEXES :: VISIBLE
let start = $state(0)
let end = $state(0)

// STATE :: INDEXES :: RENDER
// Calculate render bounds including buffers
const renderStart = $derived(Math.max(0, start - bufferBefore))
const renderEnd = $derived(Math.min(items.length, end + bufferAfter))

// STATE :: PADDING
let top = $state(0)
let bottom = $state(0)

// STATE :: HEIGHTS
let heightMap: Array<number> = $state([])
let averageHeight: number = $state(null!)
let viewportHeight = $state(0)

// STATE :: BOOLEAN
let isChrome = typeof window !== 'undefined' && /Chrome/.test(navigator.userAgent)
let isMounted: boolean = $state(false)

// STATE :: OBSERVERS
let resizeObserver: ResizeObserver | null = null

// STATE :: DERIVED :: ITEMS :: RENDERED
// Rendered items include buffered items
const renderedItems: Array<{ id: number | string; data: T }> = $derived(
  items.slice(renderStart, renderEnd).map((data, i) => {
    return { id: getKey?.(data) ?? i + renderStart, data }
  }),
)

// STATE :: ANIMATION :: RAF
let scrollRAF: number | null = null

// STATE :: SCROLLBAR :: CALCULATED DIMENSIONS
let currentScrollTop = $state(0)

// Calculate the true content dimensions for stable scrollbar
const totalContentHeight = $derived(() => {
  if (canResize) {
    // Use heightMap for precise calculation when available
    const mappedHeight = heightMap.reduce(
      (sum, h) => sum + (h || averageHeight || 50),
      0,
    )
    const unmappedCount = Math.max(0, items.length - heightMap.length)
    const unmappedHeight = unmappedCount * (averageHeight || 50)
    return mappedHeight + unmappedHeight + padding * 2
  } else {
    // Fixed height calculation
    return items.length * (itemHeight || 50) + padding * 2
  }
})

// ═══════════════════════
// 4. EFFECTS
// ═══════════════════════

// STATE :: INVALIDATION :: HEIGHT MAP
$effect(() => {
  // whenever `items` changes, invalidate the current heightmap
  if (isMounted) {
    refresh(items, viewportHeight, itemHeight)
  }
})

// ═══════════════════════
// 5. REFRESH
// ═══════════════════════

// Refresh the height map and adjust the padding to match the new content.
// Used when (1) items change, (2) viewport height changes, or (3) item height changes.
async function refresh(items: Array<any>, viewportHeight: number, itemHeight?: number) {
  const { scrollTop } = viewport
  await tick() // wait until the DOM is up to date

  // Start with the height of rendered content that is currently scrolled out of view above the viewport.
  let contentHeight = scrollTop - top
  let i = start

  while (contentHeight < viewportHeight && i < items.length) {
    let row = renderedRows[i - renderStart]

    if (!row) {
      end = i + 1
      await tick() // render the newly visible row
      row = renderedRows[i - renderStart]
    }

    // Defensive check - use itemHeight if DOM element isn't ready
    const rowHeight = (heightMap[i] =
      itemHeight || (row && (row as HTMLElement).offsetHeight) || 50)
    contentHeight += rowHeight
    i += 1
  }

  end = i

  // Calculate average height based on all known heights
  const knownHeights = heightMap.filter(h => h > 0)
  averageHeight =
    knownHeights.length > 0
      ? knownHeights.reduce((sum, h) => sum + h, 0) / knownHeights.length
      : itemHeight || 50

  // Adjust top padding: height of items before renderStart
  top = heightMap
    .slice(0, renderStart)
    .reduce((sum, h) => sum + (h || averageHeight), 0)

  // Adjust bottom padding: height of items after renderEnd
  const remaining = items.length - renderEnd
  const bottomOverflow = applyBottomOverflow ? viewportHeight * 0.25 : 0
  bottom = remaining * averageHeight + bottomOverflow

  heightMap.length = items.length

  // Only check total height if we have meaningful measurements
  const totalHeight = heightMap.reduce((x, y) => x + (y || averageHeight), 0)

  // Prevent scrolling beyond actual content + overflow
  if (scrollTop + viewportHeight > totalHeight + bottomOverflow) {
    const maxScroll = Math.max(0, totalHeight + bottomOverflow - viewportHeight)
    if (scrollTop > maxScroll) {
      viewport.scrollTo(0, maxScroll)
    }
  }
  if (canResize) {
    for (const row of renderedRows) {
      if (row) {
        resizeObserver?.observe(row)
      }
    }
  }
}

// ═══════════════════════
// 6. HANDLERS :: SCROLL
// ═══════════════════════

async function handle_scroll() {
  // Chrome: Skip RAF debouncing for immediate response
  if (isChrome) {
    await handle_scroll_immediate()
    return
  }

  // Firefox: Keep RAF for smooth performance
  if (scrollRAF) {
    cancelAnimationFrame(scrollRAF)
  }

  scrollRAF = requestAnimationFrame(async () => {
    await handle_scroll_immediate()
    scrollRAF = null
  })
}

async function handle_scroll_immediate() {
  const { scrollTop } = viewport
  currentScrollTop = scrollTop
  const oldRenderStart = renderStart
  const oldRenderEnd = renderEnd

  // Only measure heights for newly rendered items if canResize is true
  if (canResize) {
    // Only check items that are newly added to the render range
    for (let v = 0; v < renderedRows.length; v += 1) {
      const element = renderedRows[v] as HTMLElement
      const actualIndex = renderStart + v

      if (element && actualIndex < items.length) {
        // Only measure if we don't have a cached height OR if this is a newly rendered item
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

  let i = 0
  let y = 0

  while (i < items.length) {
    // Use itemHeight directly if canResize is false and no cached height
    const rowHeight = (canResize ? averageHeight || heightMap[i] : itemHeight) || 50
    if (y + rowHeight > scrollTop) {
      start = i
      top = y
      break
    }
    y += rowHeight
    i += 1
  }

  while (i < items.length) {
    const rowHeight = (canResize ? averageHeight || heightMap[i] : itemHeight) || 50
    y += rowHeight
    i += 1
    if (y > scrollTop + viewportHeight) break
  }

  end = i

  // Only recalculate average if canResize is true AND we have meaningful data
  if (canResize && end > 0) {
    // Dampen average height changes to prevent scrollbar jumping
    const newAverage = y / end || itemHeight || 50
    averageHeight = averageHeight ? averageHeight * 0.8 + newAverage * 0.2 : newAverage
  } else {
    averageHeight = itemHeight || 50
  }

  if (canResize) {
    // Only fill unknown heights for items in the current render range
    const newRenderStart = Math.max(0, start - bufferBefore)
    const newRenderEnd = Math.min(items.length, end + bufferAfter)

    for (let j = newRenderStart; j < newRenderEnd; j++) {
      if (!heightMap[j]) {
        heightMap[j] = averageHeight
      }
    }
  }

  // Calculate new top padding (items before renderStart)
  const newRenderStart = Math.max(0, start - bufferBefore)

  // Use itemHeight directly if canResize is false
  if (canResize) {
    top = heightMap
      .slice(0, newRenderStart)
      .reduce((sum, h) => sum + (h || averageHeight), 0)
  } else {
    top = newRenderStart * (itemHeight || 50)
  }

  // Calculate new bottom padding (items after renderEnd)
  const newRenderEnd = Math.min(items.length, end + bufferAfter)
  const newRemaining = items.length - newRenderEnd

  // Use itemHeight directly if canResize is false
  const estimatedHeight = canResize ? averageHeight : itemHeight || 50
  bottom = newRemaining * estimatedHeight
}

// ═══════════════════════
// 7. HANDLERS :: RESIZE
// ═══════════════════════

function handleHeightChange() {
  refresh(items, viewportHeight, itemHeight)
}

// ═══════════════════════
// 8. INITIALIZATION
// ═══════════════════════

$effect(() => {
  untrack(() => {
    if (viewport && contents) {
      renderedRows = contents.getElementsByTagName('svelte-virtual-list-row')
      resizeObserver = new ResizeObserver(handleHeightChange)

      // Chrome: Use passive scroll listener for better performance
      if (isChrome && viewport) {
        viewport.addEventListener('scroll', handle_scroll, { passive: true })
      }

      // Listen for custom scroll events from SafeSvrollbar (virtual mode)
      const handleVirtualScroll = (event: Event) => {
        const customEvent = event as CustomEvent
        if (viewport && customEvent.detail) {
          viewport.scrollTop = customEvent.detail.scrollTop
        }
      }

      window.addEventListener('virtualscroll', handleVirtualScroll)

      isMounted = true

      return () => {
        window.removeEventListener('virtualscroll', handleVirtualScroll)
      }
    }
  })
})
</script>

<svelte-virtual-list-viewport
  bind:this={viewport}
  bind:offsetHeight={viewportHeight}
  onscroll={isChrome ? undefined : handle_scroll}
  style="height: {height};"
>
  <svelte-virtual-list-contents
    bind:this={contents}
    style="padding-top: {top + padding}px; padding-bottom: {bottom +
      padding}px; padding-left: {padding}px; padding-right: {padding}px;"
  >
    {#each renderedItems as row (row.id)}
      <svelte-virtual-list-row>
        {@render children?.(row.data)}
      </svelte-virtual-list-row>
    {/each}
  </svelte-virtual-list-contents>
</svelte-virtual-list-viewport>

<!-- SafeSvrollbar Integration with virtual mode and calculated dimensions -->
{#if viewportHeight > 0 && totalContentHeight() > 0}
  <Scrollbar
    virtual={true}
    {viewportHeight}
    contentsHeight={totalContentHeight()}
    scrollTop={currentScrollTop}
    showThumbOnTrackEnter={true}
    alwaysVisible={true}
    width={{
      track: 18,
      thumb: 10,
      thumbActive: 12
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
  /* Fix Chrome text scrolling lag */
  will-change: scroll-position;
  /* contain: layout style paint; */
  overflow-anchor: none;
  /* Force immediate scrollbar updates in Chrome */
  scrollbar-width: auto;
  scrollbar-color: auto;
}

/* Force Chrome scrollbar to update immediately */
svelte-virtual-list-viewport::-webkit-scrollbar {
  width: 12px;
  /* Force scrollbar on same compositor layer */
  will-change: auto;
  contain: none;
}

svelte-virtual-list-viewport::-webkit-scrollbar-track {
  background: transparent;
  /* Immediate updates */
  will-change: auto;
  transform: translateZ(0);
}

svelte-virtual-list-viewport::-webkit-scrollbar-thumb {
  background-color: rgba(0, 0, 0, 0.3);
  border-radius: 6px;
  /* Force immediate position updates */
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
  /* Force hardware acceleration for consistent rendering */
  transform: translateZ(0);
  backface-visibility: hidden;
  will-change: transform;
}

svelte-virtual-list-row {
  overflow: visible;
  /* Ensure text renders consistently with container */
  text-rendering: geometricPrecision;
  -webkit-font-smoothing: subpixel-antialiased;
  /* Remove paint containment to allow shadows to extend beyond row bounds */
  contain: layout style;
  /* Create stacking context for proper z-index behavior */
  position: relative;
  z-index: 1;
}

/* Apply consistent rendering to all text content inside rows */
svelte-virtual-list-row * {
  transform: translateZ(0);
  backface-visibility: hidden;
}

/* Chrome-specific optimizations that won't affect Firefox */
@supports (-webkit-appearance: none) {
  svelte-virtual-list-viewport {
    /* Chrome: Smooth scrolling and stable scrollbar */
    overscroll-behavior: contain;
    scroll-behavior: auto !important;
    /* Prevent scrollbar jumping during content changes */
    overflow-anchor: auto;
  }
}

/* Firefox-specific GPU acceleration */
@supports (-moz-appearance: none) {
  svelte-virtual-list-viewport {
    /* Firefox: Force GPU layer creation */
    will-change: scroll-position;
    scroll-behavior: auto;
  }

  svelte-virtual-list-contents,
  svelte-virtual-list-row {
    /* Firefox: Simple GPU acceleration */
    will-change: transform;
  }

  svelte-virtual-list-row * {
    /* Firefox: GPU for child elements */
    will-change: transform;
  }
}
</style>
