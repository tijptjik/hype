<script lang="ts">
// COMPONENTS
import PanelRoot from './components/PanelRoot.svelte'
import Skeleton from '#lib/bits/custom/skeleton/Skeleton.svelte'
// TYPES
import type { PanelProps } from './panel.types'
let { panel }: { panel: PanelProps } = $props()
</script>
<PanelRoot {...panel} isOpen preserveContentWidth>
  <div
    class="flex h-full min-h-0 flex-col overflow-hidden"
    role="status"
    aria-label="Loading panel"
    aria-busy="true"
  >
    <div class="flex h-20 shrink-0 items-center gap-4 p-5">
      <Skeleton class="size-7" /><Skeleton class="h-6 w-1/2" />
      <Skeleton class="ml-auto size-8" />
    </div>
    <div class="flex min-h-0 flex-1 flex-col gap-4 overflow-hidden px-5 pb-5">
      {#each Array(6) as _, index (index)}
        <div
          class="border-border flex min-h-18 items-center gap-3 rounded-xl border p-3"
        >
          <Skeleton class="size-10" />
          <div class="flex-1 space-y-2">
            <Skeleton class="h-4 w-3/4" /><Skeleton class="h-3 w-1/2" />
          </div>
        </div>
      {/each}
    </div>
  </div>
</PanelRoot>
