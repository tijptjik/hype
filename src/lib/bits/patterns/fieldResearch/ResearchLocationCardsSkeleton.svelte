<script lang="ts">
// COMPONENTS
import Skeleton from '#lib/bits/custom/skeleton/Skeleton.svelte'
</script>

<div role="status" aria-label="Loading included Locations">
  <Skeleton class="mb-3 h-11 w-40" />
  <div class="grid grid-cols-[repeat(auto-fill,minmax(min(100%,16rem),1fr))] gap-8">
    {#each [1, 2, 3, 4] as card (card)}
      <div class="border-border flex gap-3 rounded-xl border p-4">
        <Skeleton class="mt-1 size-5 shrink-0" />
        <div class="min-w-0 flex-1 space-y-2">
          <Skeleton class="h-4 w-20" />
          <Skeleton class="h-5 w-3/4" />
          <Skeleton class="h-4 w-2/3" />
        </div>
      </div>
    {/each}
  </div>
</div>
