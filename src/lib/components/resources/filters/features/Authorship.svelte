<script lang="ts">
// I18N
import { m } from '$lib/i18n';
// CONTEXT
import { getAdminCtx } from '$lib/context/admin.svelte';
// SERVICES
import {
  getAuthorshipFilterState,
  toggleFilterState,
  getFeatureTaskLabel
} from '$lib/client/services/filters';
// COMPONENTS
import FilterToggle from '../FilterToggle.svelte';

// CONTEXT
const adminCtx = getAdminCtx();

// FILTER DEFINITIONS
const authorshipFilters: Record<'hasTitle' | 'hasDescription', { label: string }> = {
  hasTitle: {
    label: m.feature__title()
  },
  hasDescription: {
    label: m.feature__description()
  }
};
</script>

{#each Object.entries(authorshipFilters) as [filterKey, filterDef], idx (filterKey)}
  {@const currentValue = getAuthorshipFilterState(
    adminCtx,
    filterKey as 'hasTitle' | 'hasDescription'
  )}
  {@const key = filterKey as 'hasTitle' | 'hasDescription'}
  <FilterToggle
    label={filterDef.label}
    {currentValue}
    {idx}
    falseLabel={getFeatureTaskLabel(filterDef, false)}
    trueLabel={getFeatureTaskLabel(filterDef, true)}
    onToggleFalse={() => toggleFilterState(adminCtx, key, false)}
    onToggleTrue={() => toggleFilterState(adminCtx, key, true)}
    onToggleChange={() => {
      const nextState = currentValue === null ? true : currentValue === true ? false : null;
      toggleFilterState(adminCtx, key, nextState);
    }} />
{/each}
