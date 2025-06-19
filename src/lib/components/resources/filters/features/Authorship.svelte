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
// TYPES
import type { FeatureAuthorshipFilterKey } from '$lib/types';

// CONTEXT
const adminCtx = getAdminCtx();

// FILTER DEFINITIONS
const authorshipFilters: Record<
  FeatureAuthorshipFilterKey,
  { label: string; trueLabel?: string; falseLabel?: string }
> = {
  hasTitle: {
    label: m.feature__title(),
    falseLabel: m.filters__no(),
    trueLabel: m.filters__has()
  },
  hasDescription: {
    label: m.feature__description(),
    falseLabel: m.filters__no(),
    trueLabel: m.filters__has()
  },
  hasDisplayAddress: {
    label: m.feature__address(),
    falseLabel: m.filters__no(),
    trueLabel: m.filters__has()
  }
};
</script>

{#each Object.entries(authorshipFilters) as [filterKey, filterDef], idx (filterKey)}
  {@const currentValue = getAuthorshipFilterState(
    adminCtx,
    filterKey as FeatureAuthorshipFilterKey
  )}
  {@const key = filterKey as FeatureAuthorshipFilterKey}
  <FilterToggle
    label={filterDef.label}
    {currentValue}
    {idx}
    transformOffset={8}
    falseLabel={getFeatureTaskLabel(filterDef, false)}
    trueLabel={getFeatureTaskLabel(filterDef, true)}
    onToggleFalse={() => toggleFilterState(adminCtx, key, false)}
    onToggleTrue={() => toggleFilterState(adminCtx, key, true)}
    onToggleChange={() => {
      const nextState =
        currentValue === null ? true : currentValue === true ? false : null;
      toggleFilterState(adminCtx, key, nextState);
    }} />
{/each}
