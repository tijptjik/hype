<script lang="ts" generics="T">
import { onMount, tick, type Snippet } from 'svelte';
const {
  items,
  height,
  itemHeight,
  children,
  getKey,
  bufferBefore = 20,
  bufferAfter = 25
}: {
  items: Array<T>;
  height: string;
  itemHeight?: number | undefined;
  children: Snippet<[T]>;
  getKey?: (item: T) => string | number;
  bufferBefore?: number;
  bufferAfter?: number;
} = $props();
// read-only, but visible to consumers via bind:start
let start = $state(0);
let end = $state(0);
// local state
let height_map: Array<number> = $state([]);
let rows: HTMLCollectionOf<Element> = $state(null!);
let viewport: HTMLElement = $state(null!);
let contents: HTMLElement = $state(null!);
let viewport_height = $state(0);
let mounted: boolean = $state(false);
let resizeObserver: ResizeObserver | null = null;
let top = $state(0);
let bottom = $state(0);
let average_height: number = $state(null!);

// Calculate render bounds including buffers
const renderStart = $derived(Math.max(0, start - bufferBefore));
const renderEnd = $derived(Math.min(items.length, end + bufferAfter));

// Visible items now include buffered items
const visible: Array<{ id: number | string; data: T }> = $derived(
  items.slice(renderStart, renderEnd).map((data, i) => {
    return { id: getKey?.(data) ?? i + renderStart, data };
  })
);
// whenever `items` changes, invalidate the current heightmap
$effect(() => {
  if (mounted) {
    refresh(items, viewport_height, itemHeight);
  }
});
async function refresh(
  items: Array<any>,
  viewport_height: number,
  itemHeight?: number
) {
  const { scrollTop } = viewport;
  await tick(); // wait until the DOM is up to date

  let content_height = top - scrollTop;
  let i = start;

  while (content_height < viewport_height && i < items.length) {
    let row = rows[i - renderStart];

    if (!row) {
      end = i + 1;
      await tick(); // render the newly visible row
      row = rows[i - renderStart];
    }

    // Defensive check - use itemHeight if DOM element isn't ready
    const row_height = (height_map[i] =
      itemHeight || (row && (row as HTMLElement).offsetHeight) || 50);
    content_height += row_height;
    i += 1;
  }

  end = i;

  // Calculate average height based on all known heights
  const known_heights = height_map.filter((h) => h > 0);
  average_height =
    known_heights.length > 0
      ? known_heights.reduce((sum, h) => sum + h, 0) / known_heights.length
      : itemHeight || 50;

  // Adjust top padding: height of items before renderStart
  top = height_map
    .slice(0, renderStart)
    .reduce((sum, h) => sum + (h || average_height), 0);

  // Adjust bottom padding: height of items after renderEnd
  const remaining = items.length - renderEnd;
  const bottomOverflow = viewport_height * 0.25;
  bottom = remaining * average_height + bottomOverflow;

  height_map.length = items.length;

  // Only check total height if we have meaningful measurements
  const totalHeight = height_map.reduce((x, y) => x + (y || average_height), 0);

  // Prevent scrolling beyond actual content + overflow
  if (scrollTop + viewport_height > totalHeight + bottomOverflow) {
    const maxScroll = Math.max(0, totalHeight + bottomOverflow - viewport_height);
    if (scrollTop > maxScroll) {
      viewport.scrollTo(0, maxScroll);
    }
  }

  for (const row of rows) {
    if (row) {
      resizeObserver?.observe(row);
    }
  }
}

let scrollRAF: number | null = null;
let isChrome = typeof window !== 'undefined' && /Chrome/.test(navigator.userAgent);

async function handle_scroll() {
  // Chrome: Skip RAF debouncing for immediate response
  if (isChrome) {
    await handle_scroll_immediate();
    return;
  }

  // Firefox: Keep RAF for smooth performance
  if (scrollRAF) {
    cancelAnimationFrame(scrollRAF);
  }

  scrollRAF = requestAnimationFrame(async () => {
    await handle_scroll_immediate();
    scrollRAF = null;
  });
}

async function handle_scroll_immediate() {
  const { scrollTop } = viewport;
  const old_start = start;

  // Defensive height mapping - handle missing DOM elements gracefully
  for (let v = 0; v < rows.length; v += 1) {
    const element = rows[v] as HTMLElement;
    const actualIndex = renderStart + v;
    if (element && actualIndex < items.length) {
      height_map[actualIndex] = itemHeight || element.offsetHeight;
    }
  }

  let i = 0;
  let y = 0;

  while (i < items.length) {
    const row_height = height_map[i] || average_height || itemHeight || 50;
    if (y + row_height > scrollTop) {
      start = i;
      top = y;
      break;
    }
    y += row_height;
    i += 1;
  }

  while (i < items.length) {
    y += height_map[i] || average_height || itemHeight || 50;
    i += 1;
    if (y > scrollTop + viewport_height) break;
  }

  end = i;
  const remaining = items.length - end;
  average_height = y / end || itemHeight || 50;

  // Fill unknown heights more defensively
  for (let j = 0; j < items.length; j++) {
    if (!height_map[j]) {
      height_map[j] = average_height;
    }
  }

  // Calculate new top padding (items before renderStart)
  const new_renderStart = Math.max(0, start - bufferBefore);
  top = height_map.slice(0, new_renderStart).reduce((sum, h) => sum + h, 0);

  // Calculate new bottom padding (items after renderEnd)
  const new_renderEnd = Math.min(items.length, end + bufferAfter);
  const new_remaining = items.length - new_renderEnd;
  const new_bottomOverflow = viewport_height * 0.1;
  bottom = new_remaining * average_height + new_bottomOverflow;

  // prevent jumping if we scrolled up into unknown territory
  if (start < old_start) {
    await tick();
    let expected_height = 0;
    let actual_height = 0;

    for (let i = start; i < old_start; i += 1) {
      const rowIndex = i - new_renderStart;
      if (rows[rowIndex]) {
        expected_height += height_map[i] || average_height;
        actual_height += itemHeight || (rows[rowIndex] as HTMLElement).offsetHeight;
      }
    }

    const d = actual_height - expected_height;
    if (Math.abs(d) > 1) {
      // Only adjust if significant difference
      viewport.scrollTo(0, scrollTop + d);
    }
  }

  // Check if user is at bottom and prevent over-scrolling
  const totalHeight = height_map.reduce((x, y) => x + (y || average_height), 0);
  const maxScroll = Math.max(0, totalHeight + new_bottomOverflow - viewport_height);
  const isAtBottom = scrollTop >= maxScroll - 1; // Allow 1px tolerance

  if (scrollTop + viewport_height > totalHeight + new_bottomOverflow && !isAtBottom) {
    viewport.scrollTo(0, maxScroll);
  }
}

function handleHeightChange() {
  refresh(items, viewport_height, itemHeight);
}
// trigger initial refresh
onMount(() => {
  rows = contents.getElementsByTagName('svelte-virtual-list-row');
  resizeObserver = new ResizeObserver(handleHeightChange);

  // Chrome: Use passive scroll listener for better performance
  if (isChrome && viewport) {
    viewport.addEventListener('scroll', handle_scroll, { passive: true });
  }

  mounted = true;
});
</script>

<svelte-virtual-list-viewport
  bind:this={viewport}
  bind:offsetHeight={viewport_height}
  onscroll={isChrome ? undefined : handle_scroll}
  style="height: {height};">
  <svelte-virtual-list-contents
    bind:this={contents}
    style="padding-top: {top}px; padding-bottom: {bottom}px;">
    {#each visible as row (row.id)}
      <svelte-virtual-list-row>
        {@render children?.(row.data)}
      </svelte-virtual-list-row>
    {/each}
  </svelte-virtual-list-contents>
</svelte-virtual-list-viewport>

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
  overflow: hidden;
  /* Ensure text renders consistently with container */
  text-rendering: geometricPrecision;
  -webkit-font-smoothing: subpixel-antialiased;
  contain: layout style paint;
}

/* Apply consistent rendering to all text content inside rows */
svelte-virtual-list-row * {
  transform: translateZ(0);
  backface-visibility: hidden;
}

/* Chrome-specific optimizations that won't affect Firefox */
@supports (-webkit-appearance: none) {
  svelte-virtual-list-viewport {
    /* Chrome: Smooth scrolling */
    overscroll-behavior: contain;
    scroll-behavior: auto !important;
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
