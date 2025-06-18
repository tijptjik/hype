<script lang="ts">
// SVELTE
import { getContext } from 'svelte';
// I18N
import { m } from '$lib/i18n';
import { getLocale } from '$lib/i18n';
// CONTEXT
import { getAdminCtx } from '$lib/context/admin.svelte';
// ENUMS
import { FirstClassResource } from '$lib/enums';
// SERVICES
import { getSimpleFilterState, setFilterState } from '$lib/client/services/filters';
// COMPONENTS
import FilterToggle from '../FilterToggle.svelte';
// TYPES
import type { Property } from '$lib/types';

const adminCtx = getAdminCtx();

let properties = $derived(
  [...adminCtx.appCtx.cache.property.values()].filter(
    (p: Property) => p.type === 'specifier'
  )
);
</script>

{#each properties as property, idx (property.id)}
  {@const currentValue = getSimpleFilterState(adminCtx, 'properties', property.id)}
  {@const onToggleChange = () => {
    const nextState = currentValue === null ? true : currentValue === true ? false : null;
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
    transformOffset=20,
    {currentValue}
    {idx}
    {onToggleChange}
    {onToggleFalse}
    {onToggleTrue} />
{/each} 