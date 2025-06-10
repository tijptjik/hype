<script lang="ts">
// I18N
import { m } from '$lib/i18n';
// CONTEXT
import { getAdminCtx } from '$lib/context/admin.svelte';
// ENUMS
import { FirstClassResource, CollectionStatistic } from '$lib/enums';
// TYPES
import type { ResourceTypeWithChildren } from '$lib/types';

// CONFIG
const adminCtx = getAdminCtx();
type Props = {
  statistic: CollectionStatistic;
  resourceType: FirstClassResource;
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
    return adminCtx.appCtx.state.resources[resourceType as FirstClassResource].length;
  } else if (statistic === CollectionStatistic.access) {
    return adminCtx.getFilteredResource(resourceType, {
      text: false,
      state: false
    }).length;
  } else if (statistic === CollectionStatistic.filtered) {
    return adminCtx.getFilteredResource(resourceType, {
      text: true,
      state: true
    }).length;
  } else if (statistic === CollectionStatistic.selected && resourceType !== 'feature') {
    return adminCtx.appCtx.state.prisms[resourceType as ResourceTypeWithChildren].length;
  }
};
let count = $derived(getCount(statistic));
</script>

<div class="flew-row tooltip-right flex flex-grow items-center justify-center gap-4">
  <p class="text-3xs">{label}</p>
  <p>{count || '-'}</p>
</div>
