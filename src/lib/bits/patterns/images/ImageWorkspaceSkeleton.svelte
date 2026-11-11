<script lang="ts">
// COMPONENTS
import Skeleton from '#lib/bits/custom/skeleton/Skeleton.svelte'
import ImageSkeleton from './components/ImageSkeleton.svelte'
// I18N
import { m } from '#lib/i18n.js'
let { gallery = false }: { gallery?: boolean } = $props()
</script>

<div
  class="relative flex h-full min-h-0 w-full overflow-hidden"
  role="status"
  aria-busy="true"
  aria-label={m.resource_loading()}
>
  <div class="relative min-h-0 min-w-0 flex-1"><ImageSkeleton /></div>
  {#if gallery}
    <!-- ImageEditor owns a 192px thumbnail with 16px gutters on each side. -->
    <div class="bg-surface h-full w-56 shrink-0 overflow-hidden" aria-hidden="true">
      <div class="flex flex-col gap-4 p-4">
        {#each Array(3) as _}
          <Skeleton class="size-48 shrink-0 rounded-xl" />
        {/each}
      </div>
    </div>
  {/if}
</div>
