<script lang="ts">
// I18N
import { m } from '$lib/i18n'
// CONTEXT
import { getAdminCtx } from '$lib/context/admin.svelte'
// SERVICES
import { getSimpleFilterState, setFilterState } from '$lib/client/services/filters'
// COMPONENTS
import FilterToggle from '../FilterToggle.svelte'
// TYPES
import type { FeatureImageFilterKey } from '$lib/types'

// CONTEXT
const adminCtx = getAdminCtx()

const filterConfig: Record<
  FeatureImageFilterKey,
  { label: string; trueLabel: string; falseLabel: string }
> = {
  hasImage: {
    label: m.feature__images(),
    falseLabel: m.filters__no(),
    trueLabel: m.awful_ok_polecat_rise(),
  },
  isOneImagePublished: {
    label: m.published(),
    falseLabel: m.royal_civil_goldfish_fetch(),
    trueLabel: m.awful_ok_polecat_rise(),
  },
  isAllImagePublished: {
    label: m.published(),
    falseLabel: m.filters__not_all(),
    trueLabel: m.filters__all(),
  },
}
</script>

{#each Object.entries(filterConfig) as [ filterKey, filterDef ], idx (filterKey)}
  {@const currentValue = getSimpleFilterState(
    adminCtx,
    filterKey as FeatureImageFilterKey
  )}
  {@const key = filterKey as FeatureImageFilterKey}
  {@const onToggleChange = () => {
    const nextState =
      currentValue === null ? true : currentValue === true ? false : null;
    setFilterState(adminCtx, key, nextState);
  }}
  {@const onToggleTrue = () => {
    const nextState = currentValue === true ? null : true;
    setFilterState(adminCtx, key, nextState);
  }}
  {@const onToggleFalse = () => {
    const nextState = currentValue === false ? null : false;
    setFilterState(adminCtx, key, nextState);
  }}
  <FilterToggle
    label={filterDef.label}
    {currentValue}
    {idx}
    transformOffset={8}
    falseLabel={filterDef.falseLabel}
    trueLabel={filterDef.trueLabel}
    {onToggleChange}
    {onToggleFalse}
    {onToggleTrue}
  />
{/each}
