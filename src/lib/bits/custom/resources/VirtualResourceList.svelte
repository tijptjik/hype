<script lang="ts" generics="T extends Record<'id', string>">
// SVELTE
import { untrack, type Snippet } from 'svelte'
import { flip } from 'svelte/animate'
import { prefersReducedMotion } from 'svelte/motion'
// ICONS
import RetryIcon from 'virtual:icons/proicons/arrow-sync'
import EmptyIcon from 'virtual:icons/proicons/subtract'
// VIRTUALIZATION
import { createVirtualizer } from '@tanstack/svelte-virtual'
// I18N
import { m } from '#lib/i18n.js'
// TYPES
import type { AnimationConfig } from 'svelte/animate'

let {
  items,
  item,
  onNearEnd,
  onVisibleItems,
  loading = false,
  error = false,
  compact = false,
  onRetry,
  viewKey = '',
  animateRows = false,
  estimateSize = 56,
  contentHeight = $bindable(0),
}: {
  items: T[]
  item: Snippet<[T]>
  onNearEnd?: () => void
  onVisibleItems?: (items: T[]) => void
  loading?: boolean
  error?: boolean
  /** Icon-only status controls for collapsed navigation rails. */
  compact?: boolean
  onRetry?: () => void
  animateRows?: boolean
  /** Intrinsic list height, including padding and status rows, for content-capped layouts. */
  contentHeight?: number
  estimateSize?: number
  viewKey?: string
} = $props()
const flow = $derived(animateRows && items.length <= 50)
let container: HTMLDivElement | undefined = $state()
const virtualizer = createVirtualizer<HTMLDivElement, HTMLDivElement>({
  count: 0,
  getScrollElement: () => container ?? null,
  estimateSize: () => estimateSize,
  overscan: 3,
  getItemKey: index => items[index]?.id ?? index,
})
$effect(() => {
  const count = items.length
  const keys = items.map(item => item.id)
  const element = container
  untrack(() =>
    $virtualizer.setOptions({
      count,
      getItemKey: index => keys[index] ?? index,
      getScrollElement: () => element ?? null,
    }),
  )
})
$effect(() => {
  viewKey
  untrack(() => container?.scrollTo({ top: 0 }))
})
$effect(() => {
  if (flow) {
    const current = items
    untrack(() => onVisibleItems?.(current))
    if (!loading && !error && current.length) untrack(() => onNearEnd?.())
    return
  }
  const range = $virtualizer.range
  if (range)
    untrack(() => onVisibleItems?.(items.slice(range.startIndex, range.endIndex + 1)))
  if (
    !loading &&
    !error &&
    items.length &&
    range &&
    range.endIndex >= items.length - 11
  ) {
    untrack(() => onNearEnd?.())
  }
})
/** Registers actual row height so breadcrumbs and wrapping do not break scroll offsets. */
function measure(node: HTMLDivElement): void {
  $virtualizer.measureElement(node)
}

/**
 * Animates vertical reordering without counteracting the containing panel's motion.
 * @param node - Keyed row wrapper.
 * @param rects - Viewport rectangles before and after the list update.
 * @returns A vertical FLIP animation, disabled when motion is reduced or not requested.
 * @remarks Panel travel and width changes must not translate or scale individual rows.
 */
function animateRow(
  node: Element,
  { from, to }: { from: DOMRect; to: DOMRect },
): AnimationConfig {
  if (!animateRows || prefersReducedMotion.current) return { duration: 0 }

  // Keep the final row dimensions and horizontal position throughout the animation.
  return flip(
    node,
    { from: new DOMRect(to.x, from.y, to.width, to.height), to },
    { duration: 200 },
  )
}
</script>

<div
  bind:this={container}
  class="bg-panel relative min-h-0 flex-1 scrollbar-thin overflow-x-hidden overflow-y-auto overscroll-contain"
  aria-busy={loading}
>
  <div data-resource-list-content class="py-1" bind:clientHeight={contentHeight}>
    {#if flow}
      {#each items as row (row.id)}
        <div animate:animateRow>{@render item(row)}</div>
      {/each}
    {:else}
      <div class="relative w-full" style:height={`${$virtualizer.getTotalSize()}px`}>
        {#each $virtualizer
          .getVirtualItems()
          .filter(row => items[row.index]) as row (row.key)}
          <!-- A search can shrink items before the virtualizer updates its measured range. -->
          <div
            data-index={row.index}
            use:measure
            animate:animateRow
            class="absolute left-0 w-full"
            style:top={`${row.start}px`}
          >
            {@render item(items[row.index])}
          </div>
        {/each}
      </div>
    {/if}
    {#if loading && !items.length}
      <div
        role="status"
        class="bg-base-200 h-8 animate-pulse"
        aria-label={m.resource_loading()}
      ></div>
    {:else if error}
      <button
        type="button"
        class={compact
          ? 'focus-override hover:bg-surface mx-auto flex size-8 items-center justify-center rounded-md'
          : 'w-full px-3 py-2 text-sm'}
        aria-label={m.resource_retry()}
        title={compact ? m.resource_retry() : undefined}
        onclick={onRetry}
      >
        {#if compact}
          <RetryIcon class="size-4" aria-hidden="true" />
        {:else}
          {m.resource_retry()}
        {/if}
      </button>
    {:else if items.length === 0}
      <p
        class={compact
          ? 'flex h-8 items-center justify-center opacity-60'
          : 'px-3 py-2 text-sm opacity-60'}
        title={compact ? m.resource_no_results() : undefined}
      >
        {#if compact}
          <EmptyIcon class="size-4" aria-hidden="true" />
          <span class="sr-only">{m.resource_no_results()}</span>
        {:else}
          {m.resource_no_results()}
        {/if}
      </p>
    {/if}
  </div>
</div>
