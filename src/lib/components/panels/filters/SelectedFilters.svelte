<script lang="ts">
// SERVICES
import { displaySelectedFilters } from '$lib/client/services/property';
// TYPES
import type { Id, Property } from '$lib/types';

type Props = {
  layerId: Id;
  appCtx: any;
  properties: Property[];
};

let { layerId, appCtx, properties }: Props = $props();

let displayText = $derived(
  displaySelectedFilters(appCtx, appCtx.propertyFilters?.[layerId], properties)
);
</script>

<div class="flex flex-wrap justify-start gap-2 px-[34px] pt-2">
  <p class="pb-2 text-sm text-base-content/60">
    {@html displayText}
  </p>
</div>
