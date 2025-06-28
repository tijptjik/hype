<script lang="ts">
// SERVICES
import { displaySelectedFilters } from '$lib/client/services/property';
// TYPES
import type { Id, Property } from '$lib/types';
import type { AppCtx } from '$lib/context/app.svelte';

type Props = {
  layerId: Id;
  appCtx: AppCtx;
  properties: Property[];
};

let { layerId, appCtx, properties }: Props = $props();

let displayText = $derived(
  displaySelectedFilters(
    appCtx,
    appCtx.state.filters.feature.properties?.[layerId],
    properties
  )
);
</script>

<div class="flex flex-wrap justify-start gap-2 px-[34px] pt-2">
  <p class="pb-2 text-sm text-base-content/60">
    {@html displayText}
  </p>
</div>
