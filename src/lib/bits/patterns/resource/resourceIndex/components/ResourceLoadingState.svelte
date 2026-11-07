<script lang="ts">
// I18N
import { m } from '#lib/i18n.js'
// BITS COMPONENTS
import Skeleton from '#lib/bits/custom/skeleton/Skeleton.svelte'
import { getRowRootClass, rowShellClass } from '#lib/bits/custom/rows/row.styles.js'

let {
  isRowLayout = false,
  showGroupHeader = false,
}: { isRowLayout?: boolean; showGroupHeader?: boolean } = $props()
</script>

<div
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
    class={isRowLayout
      ? 'flex flex-col gap-1.5'
      : 'grid grid-cols-[repeat(auto-fit,minmax(min(100%,340px),1fr))] gap-4'}
    aria-hidden="true"
  >
    {#each Array(8) as _, index (index)}
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
          class="border-border bg-panel flex h-18 shrink-0 items-center gap-4 rounded-xl border px-4"
        >
          <Skeleton class="size-10 shrink-0 rounded-lg" />
          <Skeleton class="h-4 w-1/3" />
          <Skeleton class="ml-auto h-3 w-1/5" />
        </div>
      {:else}
        <div
          class="border-border bg-panel h-[396px] overflow-hidden rounded-2xl border"
        >
          <Skeleton class="h-56 w-full rounded-none" />
          <div class="space-y-4 p-5">
            <Skeleton class="h-5 w-2/3" />
            <Skeleton class="h-3 w-1/3" />
            <Skeleton class="h-3 w-5/6" />
            <Skeleton class="h-3 w-1/2" />
          </div>
        </div>
      {/if}
    {/each}
  </div>
</div>
