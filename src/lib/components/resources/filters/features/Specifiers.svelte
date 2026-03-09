<script lang="ts">
// I18N
import { m } from '$lib/i18n'
import { getLocale } from '$lib/i18n'
// CONTEXT
import { getAdminCtx } from '$lib/context/admin.svelte'
// SERVICES
import { getSimpleFilterState, setFilterState } from '$lib/client/services/filters'
import { sortProperties } from '$lib/client/services/property'
// COMPONENTS
import FilterToggle from '../FilterToggle.svelte'
// TYPES
import type { Property } from '$lib/db/zod/schema/property.types'

const adminCtx = getAdminCtx()

let properties = $derived(
  sortProperties(
    [...adminCtx.appCtx.cache.property.values()]
      .filter((p: Property) => p.type === 'specifier')
      .map(property => ({ property })),
  ).map(item => item.property),
)
</script>

{#each properties as property, idx (property.id)}
  {@const currentValue = getSimpleFilterState(adminCtx, 'properties', property.id)}
  {@const onToggleChange = (e: Event) => {
    const nextState =
      currentValue === null ? true : currentValue === true ? false : null;
    setFilterState(adminCtx, 'properties', nextState, property.id);
  }}
  {@const onToggleTrue = () => {
    const nextState = currentValue === true ? null : true;
    setFilterState(adminCtx, 'properties', nextState, property.id);
  }}
  {@const onToggleFalse = () => {
    const nextState = currentValue === false ? null : false;
    setFilterState(adminCtx, 'properties', nextState, property.id);
  }}
  <FilterToggle
    label={property.i18n?.[getLocale()]?.label ?? property.id}
    transformOffset={-10}
    {currentValue}
    {idx}
    falseLabel={m.filters__no()}
    trueLabel={m.filters__has()}
    {onToggleChange}
    {onToggleFalse}
    {onToggleTrue}
  />
{/each}
