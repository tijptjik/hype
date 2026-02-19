<script lang="ts">
// I18N
import { m } from '$lib/i18n'
// CONTEXT
import { getAdminCtx } from '$lib/context/admin.svelte'
// SERVICES
import {
  getResourceFilterState,
  toggleResourceFilterState,
  setResourceFilterState,
  getFeatureTaskLabel,
} from '$lib/client/services/filters'
// COMPONENTS
import FilterToggle from '../FilterToggle.svelte'
// TYPES
import type { OrganisationImageFilterKey } from '$lib/types'

// CONTEXT
const adminCtx = getAdminCtx()

// FILTER DEFINITIONS
const imageFilters: Record<
  OrganisationImageFilterKey,
  {
    label: string
    invertBoolean?: boolean
    trueLabel?: string
    falseLabel?: string
  }
> = {
  hasImage: {
    label: m.filters__image(),
    falseLabel: m.filters__no(),
    trueLabel: m.filters__has(),
  },
}
</script>

{#each Object.entries(imageFilters) as [ filterKey, filterDef ], idx (filterKey)}
  {@const currentValue = getResourceFilterState(
    adminCtx,
    'organisation',
    filterKey as OrganisationImageFilterKey
  )}
  {@const key = filterKey as OrganisationImageFilterKey}
  <FilterToggle
    label={filterDef.label}
    {currentValue}
    {idx}
    transformOffset={12}
    falseLabel={getFeatureTaskLabel(filterDef, false)}
    trueLabel={getFeatureTaskLabel(filterDef, true)}
    onToggleFalse={() =>
      toggleResourceFilterState(adminCtx, 'organisation', key, false)}
    onToggleTrue={() => toggleResourceFilterState(adminCtx, 'organisation', key, true)}
    onToggleChange={() => {
      const nextState =
        currentValue === null ? true : currentValue === true ? false : null;
      setResourceFilterState(adminCtx, 'organisation', key, nextState);
    }}
  />
{/each}
