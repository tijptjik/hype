<script lang="ts">
// SVELTE
import { onMount } from 'svelte'
// ROUTE READINESS
import { holdRouteWhileLoading } from '#lib/bits/custom/transition/routeReadiness.js'
// I18N
import { m } from '#lib/i18n.js'
// BITS COMPONENTS
import Skeleton from '#lib/bits/custom/skeleton/Skeleton.svelte'
import { getRowRootClass, rowShellClass } from '#lib/bits/custom/rows/row.styles.js'
// BITS COMPONENTS
import IndexCardSkeleton from '#lib/bits/patterns/cards/indexCard/IndexCardSkeleton.svelte'

let {
  isRowLayout = false,
  showGroupHeader = false,
}: { isRowLayout?: boolean; showGroupHeader?: boolean } = $props()
holdRouteWhileLoading()

// Use the loaded index's column budget, including its outer 12px and inner 8px gutters.
let width = $state(0)
let viewport = $state<HTMLDivElement>()
let grid = $state<HTMLDivElement>()
let visibleHeight = $state(0)
let rowHeight = $state(0)
let rowGap = $state(0)

// Measure the actual responsive row/card rather than assuming a fixed card height.
onMount(() => {
  if (!viewport || !grid) return
  const measure = (): void => {
    if (!viewport || !grid) return
    visibleHeight = Math.max(
      0,
      viewport.getBoundingClientRect().bottom - grid.getBoundingClientRect().top,
    )
    rowHeight = grid.firstElementChild?.getBoundingClientRect().height ?? 0
    rowGap = Number.parseFloat(getComputedStyle(grid).rowGap) || 0
  }
  const observer = new ResizeObserver(measure)
  observer.observe(viewport)
  observer.observe(grid)
  if (grid.firstElementChild) observer.observe(grid.firstElementChild)
  measure()
  return () => observer.disconnect()
})
const columns = $derived(Math.max(1, Math.floor((width - 24 + 16) / (340 + 16))))
const itemCount = $derived(
  rowHeight > 0
    ? Math.max(1, Math.ceil(visibleHeight / (rowHeight + rowGap)) + 1) *
        (isRowLayout ? 1 : columns)
    : 8,
)
</script>

<div
  bind:this={viewport}
  bind:clientWidth={width}
  class="min-h-0 flex-1 overflow-hidden px-3 pt-3"
  role="status"
  aria-live="polite"
  aria-busy="true"
  aria-label={m.resource_loading()}
>
  <span class="sr-only">{m.resource_loading()}</span>
  {#if showGroupHeader}
    <div class="pt-4 pb-2" aria-hidden="true">
      <div class="@container flex h-10 items-center gap-4 px-3">
        <Skeleton class="size-5 shrink-0" />
        <Skeleton class="h-5 w-44 max-w-[50%]" />
        <Skeleton class="mr-3 ml-auto hidden h-3 w-16 @sm:block" />
      </div>
    </div>
  {/if}
  <div
    bind:this={grid}
    class={isRowLayout
      ? `flex flex-col gap-1.5 ${showGroupHeader ? '' : 'px-2'}`
      : 'grid gap-4 px-2'}
    style:grid-template-columns={isRowLayout
      ? undefined
      : `repeat(${columns}, minmax(0, 1fr))`}
    aria-hidden="true"
  >
    {#each Array(itemCount) as _, index (index)}
      {#if isRowLayout && showGroupHeader}
        <div class="px-2">
          <div class={rowShellClass}>
            <div
              class={getRowRootClass({
                className:
                  'grid-cols-[minmax(0,1fr)_auto] gap-x-4 gap-y-2 pr-3 @min-[48rem]:grid-cols-[minmax(0,1fr)_11rem_12rem_8rem]',
              })}
            >
              <div class="flex min-w-0 items-center gap-4">
                <Skeleton class="size-16 shrink-0 rounded-md" />
                <div class="flex min-w-0 flex-1 flex-col gap-2 pt-1">
                  <Skeleton class="h-4 w-2/5" />
                  <Skeleton class="h-3 w-3/5" />
                </div>
              </div>
              <div
                class="col-start-1 row-start-2 pb-2 pl-20 @min-[48rem]:col-start-2 @min-[48rem]:row-start-1 @min-[48rem]:p-0"
              >
                <Skeleton class="h-6 w-22 rounded-md" />
              </div>
              <div class="hidden flex-col gap-2 @min-[48rem]:flex">
                <Skeleton class="h-3 w-20" />
                <Skeleton class="h-3.5 w-24" />
              </div>
              <div
                class="border-border/60 col-start-2 row-span-2 row-start-1 flex items-center justify-end self-stretch border-l pl-3 @min-[48rem]:col-start-4 @min-[48rem]:row-span-1"
              >
                <Skeleton class="h-3 w-20" />
              </div>
            </div>
          </div>
        </div>
      {:else if isRowLayout}
        <div
          data-resource-skeleton-item
          class="border-border bg-panel flex h-18 shrink-0 items-center gap-4 rounded-xl border px-4"
        >
          <Skeleton class="size-10 shrink-0 rounded-lg" />
          <Skeleton class="h-4 w-1/3" />
          <Skeleton class="ml-auto h-3 w-1/5" />
        </div>
      {:else}
        <div data-resource-skeleton-item><IndexCardSkeleton /></div>
      {/if}
    {/each}
  </div>
</div>
