<script lang="ts">
// CONTEXT
import { getAdminCtx } from '$lib/context/admin.svelte';
// SERVICES
import {
  getFeatureFilterState,
  toggleBooleanState,
  handleToggleChange,
  getFeatureFilterLabel
} from '$lib/client/services/filters';
// TYPES
import type { FeatureStatusFilterKey } from '$lib/types';

// CONTEXT
const adminCtx = getAdminCtx();

// FILTER DEFINITIONS
const statusFilters: Record<
  FeatureStatusFilterKey,
  { label: string; invertBoolean?: boolean }
> = {
  isPublished: {
    label: 'Published'
  },
  isPendingReview: {
    label: 'Reviewed',
    invertBoolean: true
  },
  isArchived: {
    label: 'Archived'
  },
  isIntangible: {
    label: 'Intangible'
  },
  isVisitable: {
    label: 'Visitable'
  }
};
</script>

{#each Object.entries(statusFilters) as [filterKey, filterDef], idx (filterKey)}
  {@const currentValue = getFeatureFilterState(
    adminCtx,
    filterKey as FeatureStatusFilterKey
  )}
  {@const key = filterKey as FeatureStatusFilterKey}
  <div class="group flex flex-col items-center gap-[6px] tracking-widest">
    <label class="text-xs uppercase leading-none text-base-content/70">
      {filterDef.label}
    </label>
    <div class="flex items-center gap-2">
      <span
        onclick={() => toggleBooleanState(adminCtx, key, false)}
        class="text text-sm uppercase text-base-content opacity-0 transition-opacity duration-300 group-hover:opacity-40">
        {getFeatureFilterLabel(adminCtx, filterDef, false)}
      </span>
      <input
        type="checkbox"
        class="toggle toggle-sm"
        checked={currentValue === true}
        indeterminate={currentValue === null}
        onchange={(e) => handleToggleChange(adminCtx, key, e)} />
      <span
        onclick={() => toggleBooleanState(adminCtx, key, true)}
        class="text text-sm uppercase text-base-content opacity-0 transition-opacity duration-300 group-hover:opacity-40">
        {getFeatureFilterLabel(adminCtx, filterDef, true)}
      </span>
    </div>
  </div>
{/each}
