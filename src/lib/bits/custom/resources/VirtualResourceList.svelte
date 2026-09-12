<script lang="ts" generics="T extends Record<'id', string>">
// SVELTE
import { untrack, type Snippet } from 'svelte'
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
}: {
  items: T[]
  item: Snippet<[T]>
  onNearEnd?: () => void
  onVisibleItems?: (items: T[]) => void
  loading?: boolean
  error?: boolean
  onRetry?: () => void
  viewKey?: string
} = $props()
let container: HTMLDivElement | undefined = $state()
const virtualizer = createVirtualizer<HTMLDivElement, HTMLDivElement>({
  count: 0,
  getScrollElement: () => container ?? null,
  estimateSize: () => 56,
  overscan: 3,
  getItemKey: index => items[index]?.id ?? index,
})
$effect(() => {
  const count = items.length
  const element = container
  untrack(() =>
    $virtualizer.setOptions({ count, getScrollElement: () => element ?? null }),
  )
})
$effect(() => {
  viewKey
  untrack(() => container?.scrollTo({ top: 0 }))
})
$effect(() => {
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
  class="scrollbar-thin relative min-h-0 flex-1 overflow-x-hidden overflow-y-auto overscroll-contain bg-black py-1"
  aria-busy={loading}
>
  <div class="relative w-full" style:height={`${$virtualizer.getTotalSize()}px`}>
    {#each $virtualizer.getVirtualItems() as row (row.key)}
      <div
        data-index={row.index}
        use:measure
        class="absolute left-0 top-0 w-full"
        style:transform={`translateY(${row.start}px)`}
      >
        {@render item(items[row.index])}
      </div>
    {/each}
  </div>
  {#if loading}
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
