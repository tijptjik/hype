<script lang="ts">
// BITS
import Skeleton from '#lib/bits/custom/skeleton/Skeleton.svelte'
let { count = 3 }: { count?: number } = $props()
</script>

<div aria-hidden="true">
  <div
    class="mx-6 flex justify-between border-b border-border px-3 py-2 text-xs font-medium text-muted-foreground"
  >
    <span>Name</span><span class="w-36 pr-3 text-right">Role</span>
  </div>
  {#each Array.from({ length: count }) as _, index}
    <div class="bits-form__user-card-root flex gap-4">
      <Skeleton class="size-8 shrink-0 rounded-full" />
      <Skeleton class={index % 2 ? 'h-3 w-32 max-w-[40%]' : 'h-3 w-44 max-w-[40%]'} />
      <div class="ml-auto flex w-36 shrink-0 justify-end pr-3">
        <Skeleton class="h-3 w-14" />
      </div>
    </div>
  {/each}
</div>
