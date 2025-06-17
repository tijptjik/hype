<script lang="ts">
// I18N
import { m } from '$lib/i18n';
// CONTEXT
import { getAdminCtx } from '$lib/context/admin.svelte';
// SERVICES
import {
  getImageFilterState,
  toggleFilterState,
  getFeatureTaskLabel
} from '$lib/client/services/filters';
// COMPONENTS
import FilterToggle from '../FilterToggle.svelte';

// CONTEXT
const adminCtx = getAdminCtx();

// FILTER DEFINITIONS
const imageFilters: Record<
  'hasImage' | 'isOneImagePublished' | 'isAllImagePublished',
  { label: string }
> = {
  hasImage: {
    label: m.feature__images()
  },
  isOneImagePublished: {
    label: m.long_zippy_felix_mix()
  },
  isAllImagePublished: {
    label: m.these_weary_shark_revive()
  }
};
</script>

{#each Object.entries(imageFilters) as [filterKey, filterDef], idx (filterKey)}
  {@const currentValue = getImageFilterState(
    adminCtx,
    filterKey as 'hasImage' | 'isOneImagePublished' | 'isAllImagePublished'
  )}
  {@const key = filterKey as 'hasImage' | 'isOneImagePublished' | 'isAllImagePublished'}
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