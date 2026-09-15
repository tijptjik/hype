// TYPES
import type { Snippet } from 'svelte'

/* ----------------- */
// VIRUAL LIST
/* -------- */

// Courtesy of https://github.com/humanspeak/svelte-virtual-list/blob/main/src/lib/types.ts

/**
 * Defines the scroll direction and rendering mode for the virtual list.
 *
 * @typedef {'topToBottom' | 'bottomToTop'} SvelteVirtualListMode
 */
type SvelteVirtualListMode = 'topToBottom' | 'bottomToTop'

/**
 * Configuration properties for the SvelteVirtualList component.
 *
 * @typedef {Object} SvelteVirtualListProps
 */
type SvelteVirtualListProps = {
  /**
   * Number of items to render outside the visible viewport for smooth scrolling.
   * @default 20
   */
  bufferSize?: number
  /**
   * CSS class to apply to the outer container element.
   */
  containerClass?: string
  /**
   * CSS class to apply to the content wrapper element.
   */
  contentClass?: string
  /**
   * Initial height estimate for each item in pixels. Used for optimization before actual measurements are available.
   * @default 40
   */
  defaultEstimatedItemHeight?: number
  /**
   * When true, enables debug mode with additional logging and information.
   * @default false
   */
  debug?: boolean
  /**
   * Custom callback to handle debug information. Receives a SvelteVirtualListDebugInfo object.
   */
  debugFunction?: (_info: SvelteVirtualListDebugInfo) => void
  /**
   * The complete array of items to be virtualized.
   */
  items: unknown[]
  /**
   * CSS class to apply to individual item containers.
   */
  itemsClass?: string
  /**
   * Determines the scroll and render direction.
   * @default 'topToBottom'
   */
  mode?: SvelteVirtualListMode
  /**
   * Svelte snippet function that defines how each item should be rendered. Receives the item and its index as arguments.
   */
  renderItem: Snippet<[item: unknown, index: number]>
  /**
   * Base test ID for component elements to facilitate testing.
   */
  testId?: string
  /**
   * CSS class to apply to the scrollable viewport element.
   */
  viewportClass?: string
  /**
   * Top padding in pixels for the viewport (affects content height calculation).
   * @default 0
   */
  viewportPaddingTop?: number
}

/**
 * Debug information provided by the virtual list during rendering.
 */
type SvelteVirtualListDebugInfo = {
  /** Index of the last rendered item in the viewport. */
  endIndex: number
  /** Index of the first rendered item in the viewport. */
  startIndex: number
  /** Total number of items in the list. */
  totalItems: number
  /** Number of items currently visible in the viewport. */
  visibleItemsCount: number
  /** Number of items processed in the viewport. */
  processedItems: number
  /** Average height of the processed items in pixels. */
  averageItemHeight: number
}
