<script lang="ts">
import FilterStat from '$lib/components/sidebar/FilterStat.svelte';
import { CollectionStatistic } from '$lib/types';

let { resourceType } = $props();
</script>

{#if resourceType}
  <footer
    class="base-content flex w-full flex-shrink-0 flex-row justify-between border-b-1 border-base-100 px-3 py-2 text-center font-mono text-sm font-light uppercase opacity-60">
    <FilterStat statistic={CollectionStatistic.access} {resourceType} />
    <FilterStat statistic={CollectionStatistic.filtered} {resourceType} />
    {#if resourceType !== 'feature'}
      <FilterStat statistic={CollectionStatistic.selected} {resourceType} />
    {/if}
  </footer>
{/if}
