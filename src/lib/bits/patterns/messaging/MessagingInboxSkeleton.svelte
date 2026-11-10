<script lang="ts">
// COMPONENTS
import Skeleton from '#lib/bits/custom/skeleton/Skeleton.svelte'
</script>
<div
  role="status"
  aria-label="Loading messaging"
  aria-busy="true"
  class="grid min-h-0 min-w-0 flex-1 grid-cols-1 grid-rows-[minmax(100px,0.7fr)_minmax(0,2fr)] overflow-hidden @min-[48rem]:grid-cols-[minmax(0,0.8fr)_minmax(0,2fr)] @min-[48rem]:grid-rows-1"
>
  <aside
    class="border-border bg-panel flex max-h-[34dvh] min-h-0 min-w-0 flex-col overflow-hidden border-b @min-[48rem]:max-h-none @min-[48rem]:border-r @min-[48rem]:border-b-0"
  >
    <div class="shrink-0 space-y-2 p-3">
      <Skeleton class="h-4 w-3/4" /><Skeleton class="h-10 w-full" />
    </div>
    <div class="min-h-0 space-y-1 overflow-hidden px-2 pb-2">
      {#each Array(6) as _, index (index)}
        <div
          class="grid grid-cols-[auto_minmax(0,1fr)] items-center gap-4 rounded-xl px-3 py-3"
        >
          <Skeleton class="size-10 rounded-full" />
          <div class="space-y-2">
            <Skeleton class="h-4 w-3/4" /><Skeleton class="h-3 w-full" />
          </div>
        </div>
      {/each}
    </div>
  </aside>
  <div class="flex h-full min-h-0 flex-col">
    <div class="border-border flex h-16 shrink-0 items-center gap-3 border-b p-3">
      <Skeleton class="size-10 rounded-full" /><Skeleton class="h-4 w-1/3" />
    </div>
    <div class="min-h-0 flex-1 space-y-4 overflow-hidden p-4">
      <Skeleton class="h-16 w-2/3 rounded-xl" />
      <Skeleton class="ml-auto h-20 w-2/3 rounded-xl" />
    </div>
    <div class="p-3"><Skeleton class="h-12 w-full rounded-xl" /></div>
  </div>
</div>
