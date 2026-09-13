<script lang="ts" generics="T extends Record<'id', string>">
// SVELTE
import { untrack, type Snippet } from 'svelte'
import { flip } from 'svelte/animate'
// VIRTUALIZATION
import { createVirtualizer } from '@tanstack/svelte-virtual'
// I18N
import { m } from '$lib/i18n'

let {
  items,
  item,
  onNearEnd,
  onVisibleItems,
  loading = false,
  error = false,
  onRetry,
  viewKey = '',
  animateRows = false,
  estimateSize = 56,
}: {
  items: T[]
  item: Snippet<[T]>
  onNearEnd?: () => void
  onVisibleItems?: (items: T[]) => void
  loading?: boolean
  error?: boolean
  onRetry?: () => void
  animateRows?: boolean
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
</script>

<div
  bind:this={container}
  class="scrollbar-thin relative min-h-0 flex-1 overflow-x-hidden overflow-y-auto overscroll-contain bg-panel py-1"
  aria-busy={loading}
>
  {#if flow}
    {#each items as row (row.id)}
      <div animate:flip={{ duration: 200 }}>{@render item(row)}</div>
    {/each}
  {:else}
    <div class="relative w-full" style:height={`${$virtualizer.getTotalSize()}px`}>
      {#each $virtualizer.getVirtualItems().filter(row => items[row.index]) as row (row.key)}
        <!-- A search can shrink items before the virtualizer updates its measured range. -->
        <div
          data-index={row.index}
          use:measure
          animate:flip={{ duration: animateRows ? 200 : 0 }}
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
      class="h-8 animate-pulse bg-base-200"
      aria-label={m.resource_loading()}
    ></div>
  {:else if error}
    <button type="button" class="w-full px-3 py-2 text-sm" onclick={onRetry}>
      {m.resource_retry()}
    </button>
  {:else if items.length === 0}
    <p class="px-3 py-2 text-sm opacity-60">{m.resource_no_results()}</p>
  {/if}
</div>
