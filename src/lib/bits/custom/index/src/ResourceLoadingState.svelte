<script lang="ts">
// COMPONENTS
import Skeleton from '#lib/bits/custom/skeleton/Skeleton.svelte'
// I18N
import { m } from '#lib/i18n.js' // BITS COMPONENTS
import IndexCardSkeleton from '#lib/bits/patterns/cards/indexCard/IndexCardSkeleton.svelte'

let { isRowLayout = false }: { isRowLayout?: boolean } = $props()
</script>
<div
  class="h-full min-h-0 w-full overflow-hidden p-2"
  role="status"
  aria-label={m.resource_loading()}
  aria-busy="true"
>
  <div
    class={isRowLayout
      ? 'flex flex-col gap-3'
      : 'grid grid-cols-[repeat(auto-fit,minmax(min(100%,340px),1fr))] gap-4'}
  >
    {#each Array(8) as _, index (index)}
      <div
        class={isRowLayout
          ? 'border-border flex h-22 items-center gap-4 rounded-lg border px-4'
          : 'min-w-0'}
      >
        {#if isRowLayout}
          <Skeleton class="size-12 shrink-0" /><Skeleton class="h-4 w-1/2" />
        {:else}
          <IndexCardSkeleton />
        {/if}
      </div>
    {/each}
  </div>
</div>
