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
import type { OrganisationAuthorshipFilterKey } from '$lib/types'

// CONTEXT
const adminCtx = getAdminCtx()

// FILTER DEFINITIONS
const authorshipFilters: Record<
  OrganisationAuthorshipFilterKey,
  {
    label: string
    invertBoolean?: boolean
    trueLabel?: string
    falseLabel?: string
  }
> = {
  hasName: {
    label: m.admin__forms_common_name_full(),
    falseLabel: m.filters__no(),
    trueLabel: m.filters__has(),
  },
  hasContextualName: {
    label: m.admin__forms_common_name_short(),
    falseLabel: m.filters__no(),
    trueLabel: m.filters__has(),
  },
  hasDescription: {
    label: m.feature__description(),
    falseLabel: m.filters__no(),
    trueLabel: m.filters__has(),
  },
}
</script>

{#each Object.entries(authorshipFilters) as [ filterKey, filterDef ], idx (filterKey)}
  {@const currentValue = getResourceFilterState(
    adminCtx,
    'organisation',
    filterKey as OrganisationAuthorshipFilterKey
  )}
  {@const key = filterKey as OrganisationAuthorshipFilterKey}
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
