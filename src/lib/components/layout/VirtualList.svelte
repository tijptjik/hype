<script lang="ts" generics="T">
import { onMount, tick, type Snippet } from 'svelte';
const {
  items,
  height,
  itemHeight,
  children,
  getKey
}: {
  items: Array<T>;
  height: string;
  itemHeight?: number | undefined;
  children: Snippet<[T]>;
  getKey?: (item: T) => string | number;
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
const visible: Array<{ id: number | string; data: T }> = $derived(
  items.slice(start, end).map((data, i) => {
    return { id: getKey?.(data) ?? i + start, data };
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
    let row = rows[i - start];

    if (!row) {
      end = i + 1;
      await tick(); // render the newly visible row
      row = rows[i - start];
    }

    // Defensive check - use itemHeight if DOM element isn't ready
    const row_height = (height_map[i] =
      itemHeight || (row && (row as HTMLElement).offsetHeight) || 50);
    content_height += row_height;
    i += 1;
  }

  end = i;
  const remaining = items.length - end;
  average_height = (top + content_height) / end;
  if (end === 0) {
    average_height = itemHeight || 50;
  }

  bottom = remaining * average_height;

  height_map.length = items.length;

  // Only check total height if we have meaningful measurements
  const totalHeight = height_map.reduce((x, y) => x + (y || average_height), 0);

  // Prevent scrolling beyond actual content
  if (scrollTop + viewport_height > totalHeight) {
    const maxScroll = Math.max(0, totalHeight - viewport_height);
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

// Force Chrome to update scrollbar position immediately
function forceScrollbarUpdate() {
  if (viewport) {
    // Force style recalculation to update scrollbar position
    viewport.style.transform = 'translateZ(0)';
    viewport.offsetHeight; // Force layout
    viewport.style.transform = '';
  }
}

async function handle_scroll() {
  // Force immediate scrollbar update in Chrome
  forceScrollbarUpdate();

  // Debounce with requestAnimationFrame for smoother Chrome performance
  if (scrollRAF) {
    cancelAnimationFrame(scrollRAF);
  }

  scrollRAF = requestAnimationFrame(async () => {
    const { scrollTop } = viewport;
    const old_start = start;

    // Defensive height mapping - handle missing DOM elements gracefully
    for (let v = 0; v < rows.length; v += 1) {
      const element = rows[v] as HTMLElement;
      if (element && start + v < items.length) {
        height_map[start + v] = itemHeight || element.offsetHeight;
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

    bottom = remaining * average_height;

    // prevent jumping if we scrolled up into unknown territory
    if (start < old_start) {
      await tick();
      let expected_height = 0;
      let actual_height = 0;

      for (let i = start; i < old_start; i += 1) {
        const rowElement = rows[i - start] as HTMLElement;
        if (rowElement) {
          expected_height += height_map[i] || average_height;
          actual_height += itemHeight || rowElement.offsetHeight;
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
    const maxScroll = Math.max(0, totalHeight - viewport_height);
    const isAtBottom = scrollTop >= maxScroll - 1; // Allow 1px tolerance

    if (scrollTop + viewport_height > totalHeight && !isAtBottom) {
      viewport.scrollTo(0, maxScroll);
    }

    scrollRAF = null;
  });
}

function handleHeightChange() {
  refresh(items, viewport_height, itemHeight);
}
// trigger initial refresh
onMount(() => {
  rows = contents.getElementsByTagName('svelte-virtual-list-row');
  resizeObserver = new ResizeObserver(handleHeightChange);
  mounted = true;
});
</script>

<svelte-virtual-list-viewport
  bind:this={viewport}
  bind:offsetHeight={viewport_height}
  onscroll={handle_scroll}
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
    /* Chrome: Enable smooth compositor scrolling */
    scroll-timeline: --scroll-timeline;
    overscroll-behavior: contain;
    /* Force synchronous scrollbar updates */
    scroll-behavior: auto !important;
  }

  svelte-virtual-list-contents {
    /* Chrome: Force immediate layout updates */
    contain: layout style paint;
  }

  svelte-virtual-list-row {
    /* Chrome: Optimize for fast content swapping */
    content-visibility: auto;
    contain-intrinsic-size: auto 50px;
  }
}

/* Firefox-specific GPU acceleration */
@supports (-moz-appearance: none) {
  svelte-virtual-list-viewport {
    /* Firefox: Force GPU layer creation */
    will-change: scroll-position, transform;
    -moz-transform: translateZ(0);
    /* Firefox smooth scrolling optimization */
    scroll-behavior: auto;
    overflow-anchor: none;
  }

  svelte-virtual-list-contents {
    /* Firefox: GPU layer for content container */
    will-change: transform, opacity;
    -moz-transform: translateZ(0);
    -moz-backface-visibility: hidden;
    /* Firefox: Optimize painting */
    -moz-osx-font-smoothing: grayscale;
  }

  svelte-virtual-list-row {
    /* Firefox: Individual row GPU acceleration */
    will-change: transform, opacity;
    -moz-transform: translateZ(0);
    -moz-backface-visibility: hidden;
    /* Firefox: Optimize text rendering */
    -moz-osx-font-smoothing: grayscale;
    text-rendering: optimizeSpeed;
  }

  /* Firefox: Force GPU for all child elements */
  svelte-virtual-list-row * {
    -moz-transform: translateZ(0);
    -moz-backface-visibility: hidden;
    will-change: transform;
  }

  /* Firefox: Optimize scrollbar rendering */
  svelte-virtual-list-viewport::-moz-scrollbar {
    width: 12px;
  }

  svelte-virtual-list-viewport::-moz-scrollbar-thumb {
    background-color: rgba(0, 0, 0, 0.3);
    border-radius: 6px;
    will-change: transform;
    -moz-transform: translateZ(0);
  }

  svelte-virtual-list-viewport::-moz-scrollbar-track {
    background: transparent;
    will-change: transform;
    -moz-transform: translateZ(0);
  }
}

/* Cross-browser GPU acceleration fallback */
@supports (transform: translateZ(0)) {
  svelte-virtual-list-viewport {
    /* Ensure GPU layer across all browsers */
    isolation: isolate;
    layer-name: virtual-list-viewport;
  }

  svelte-virtual-list-contents {
    /* Force compositing layer */
    isolation: isolate;
    layer-name: virtual-list-contents;
  }

  svelte-virtual-list-row {
    /* Individual row layers */
    isolation: isolate;
  }
}
</style>
