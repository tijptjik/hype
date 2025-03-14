<script lang="ts">
// CONTEXT
import { getHierarchicalResourceState } from '$lib/context/resources.svelte';
// ENUMS
import { HierarchicalResource, CollectionStatistic } from '$lib/types';
// TYPES
import type { ResourceTypeWithChildren } from '$lib/types';
import type { inspect } from 'util';

// CONFIG
const resourceState = getHierarchicalResourceState();
type Props = {
  statistic: CollectionStatistic;
  resourceType: HierarchicalResource;
};

// STATE
// $inspect(resourceState.state.prisms);
// $inspect(resourceState.state.resources);
// $inspect('statistic', statistic);
// $inspect('resourceType', resourceType);

let { statistic, resourceType } = $props();
let label = $derived(
  statistic === CollectionStatistic.total
    ? 'Total'
    : statistic === CollectionStatistic.filtered
      ? 'Filtered'
      : 'Selected'
);
let count = $derived(
  statistic === CollectionStatistic.total
    ? resourceState.state.resources[resourceType as HierarchicalResource].length
    : statistic === CollectionStatistic.filtered
      ? resourceState.getFilteredResource(resourceType).length
      : statistic === CollectionStatistic.selected
        ? resourceState.state.prisms[resourceType as ResourceTypeWithChildren].length
        : 0
);
</script>

<p class="flex-grow">
  <span>{count || '-'}</span>
  <span class="text-3xs">{label}</span>
</p>
