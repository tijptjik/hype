<script lang="ts">
// COMPONENTS
import ImportHeaderStat from './ImportHeaderStat.svelte'
// TYPES
import type { ImportHeaderStatItem } from './importLayout.types'

type Props = {
  stats?: ImportHeaderStatItem[]
}

let { stats = [] }: Props = $props()
</script>

{#if stats.length > 0}
  <div class="mt-4 flex flex-wrap gap-2">
    {#each stats as stat}
      <ImportHeaderStat {...stat} />
    {/each}
  </div>
{/if}
