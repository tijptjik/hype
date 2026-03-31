<script lang="ts">
// SERVICES
import { displaySelectedFilters } from '$lib/client/services/property'
// TYPES
import type { Id, RangeFilterValue } from '$lib/types'
import type { Property } from '$lib/db/zod/schema/property.types'
import type { AppCtx } from '$lib/context/app.svelte'

type Props = {
  layerId: Id
  appCtx: AppCtx
  properties: Property[]
}

let { layerId, appCtx, properties }: Props = $props()

let displayText = $derived(
  displaySelectedFilters(
    appCtx,
    appCtx.state.filters.feature.properties?.[layerId] as
      | Record<Id, string[] | RangeFilterValue>
      | undefined,
    properties,
  ),
)
</script>

<div class="bits-theme bits-panel-selected-filter">
  <p class="bits-panel-selected-filter__text">{@html displayText}</p>
</div>
