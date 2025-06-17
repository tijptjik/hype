<script lang="ts">
// I18N
import { m } from '$lib/i18n';
// CONTEXT
import { getAdminCtx } from '$lib/context/admin.svelte';
// SERVICES
import {
  getAuthorshipFilterState,
  handleLabelClick,
  handleToggleClick,
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
    onToggleFalse={() => handleLabelClick(adminCtx, key, false)}
    onToggleTrue={() => handleLabelClick(adminCtx, key, true)}
    onToggleChange={(e) => handleToggleClick(adminCtx, key, e)} />
{/each}
