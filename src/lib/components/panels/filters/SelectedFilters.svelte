<script lang="ts">
// UTILS
import { displaySelectedFilters } from '$lib/utils/formatting';
// TYPES
import type { Id, Property } from '$lib/types';


type Props = {
  layerId: Id;
  appCtx: any;
  properties: Property[];
};

let { layerId, appCtx, properties }: Props = $props();

let displayText = $derived(
  displaySelectedFilters(appCtx.propertyFilters?.[layerId], properties, appCtx)
);
</script>

<div class="flex flex-wrap justify-start gap-2 px-[34px] pt-2">
  <p class="pb-2 text-sm text-base-content/60">
    {@html displayText}
  </p>
</div>
