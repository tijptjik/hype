<script lang="ts">
// I18N
import * as m from '$lib/paraglide/messages';
// CONTEXT
import { getHierarchicalResourceState } from '$lib/context/resources.svelte';
// ENUMS
import { HierarchicalResource, CollectionStatistic } from '$lib/types';
// TYPES
import type { ResourceTypeWithChildren } from '$lib/types';

// CONFIG
const resourceState = getHierarchicalResourceState();
type Props = {
  statistic: CollectionStatistic;
  resourceType: HierarchicalResource;
};

let { statistic, resourceType } = $props();
let getLabel = (statistic: CollectionStatistic) => {
  if (statistic === CollectionStatistic.access) {
    return m.admin__filter_stat_access();
  } else if (statistic === CollectionStatistic.filtered) {
    return m.admin__filter_stat_filtered();
  } else if (statistic === CollectionStatistic.selected) {
    return m.admin__filter_stat_selected();
  }
};

let label = $derived(getLabel(statistic));

let getCount = (statistic: CollectionStatistic) => {
  if (statistic === CollectionStatistic.total) {
    return resourceState.state.resources[resourceType as HierarchicalResource].length;
  } else if (statistic === CollectionStatistic.access) {
    return resourceState.getFilteredResource(resourceType, {
      text: false,
      state: false,
      access: true
    }).length;
  } else if (statistic === CollectionStatistic.filtered) {
    return resourceState.getFilteredResource(resourceType, {
      text: true,
      state: true,
      access: true
    }).length;
  } else if (statistic === CollectionStatistic.selected && resourceType !== 'feature') {
    return resourceState.state.prisms[resourceType as ResourceTypeWithChildren].length;
  }
};
let count = $derived(getCount(statistic));
</script>

<div class="flew-row tooltip-right flex flex-grow items-center justify-center gap-4">
  <p class="text-3xs">{label}</p>
  <p>{count || '-'}</p>
</div>
