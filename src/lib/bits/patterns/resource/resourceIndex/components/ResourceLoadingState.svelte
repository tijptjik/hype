<script lang="ts">
// I18N
import { m } from '#lib/i18n.js'
// BITS COMPONENTS
import Skeleton from '#lib/bits/custom/skeleton/Skeleton.svelte'

let { isRowLayout = false }: { isRowLayout?: boolean } = $props()
</script>

<div
  class="min-h-0 flex-1 overflow-hidden px-3"
  role="status"
  aria-live="polite"
  aria-busy="true"
  aria-label={m.resource_loading()}
>
  <span class="sr-only">{m.resource_loading()}</span>
  <div
    class={isRowLayout
      ? 'flex flex-col gap-1.5'
      : 'grid grid-cols-[repeat(auto-fit,minmax(min(100%,340px),1fr))] gap-4'}
    aria-hidden="true"
  >
    {#each Array(8) as _, index (index)}
      {#if isRowLayout}
        <div
          class="flex h-18 shrink-0 items-center gap-4 rounded-xl border border-border bg-panel px-4"
        >
          <Skeleton class="size-10 shrink-0 rounded-lg" />
          <Skeleton class="h-4 w-1/3" />
          <Skeleton class="ml-auto h-3 w-1/5" />
        </div>
      {:else}
        <div
          class="h-[396px] overflow-hidden rounded-2xl border border-border bg-panel"
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
