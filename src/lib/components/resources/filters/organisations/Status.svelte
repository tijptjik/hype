<script lang="ts">
// I18N
import { m } from '$lib/i18n';
// CONTEXT
import { getAdminCtx } from '$lib/context/admin.svelte';
// SERVICES
import {
  getResourceFilterState,
  toggleResourceFilterState,
  setResourceFilterState,
  getFeatureTaskLabel
} from '$lib/client/services/filters';
// COMPONENTS
import FilterToggle from '../FilterToggle.svelte';
// TYPES
import type { OrganisationStatusFilterKey } from '$lib/types';

// CONTEXT
const adminCtx = getAdminCtx();

// FILTER DEFINITIONS
const statusFilters: Record<
  OrganisationStatusFilterKey,
  {
    label: string;
    invertBoolean?: boolean;
    trueLabel?: string;
    falseLabel?: string;
    superAdminOnly?: boolean;
  }
> = {
  isPublished: {
    label: m.yummy_ornate_snail_bend(),
    falseLabel: m.filters__not(),
    trueLabel: m.filters__is()
  },
  isArchived: {
    label: m.bad_swift_cheetah_surge(),
    superAdminOnly: true,
    falseLabel: m.filters__not(),
    trueLabel: m.filters__is()
  }
};
</script>

{#each Object.entries(statusFilters) as [filterKey, filterDef], idx (filterKey)}
  {#if !filterDef.superAdminOnly || adminCtx.appCtx.user?.superAdmin}
    {@const currentValue = getResourceFilterState(
      adminCtx,
      'organisation',
      filterKey as OrganisationStatusFilterKey
    )}
    {@const key = filterKey as OrganisationStatusFilterKey}
    <FilterToggle
      label={filterDef.label}
      {currentValue}
      {idx}
      transformOffset={12}
      falseLabel={getFeatureTaskLabel(filterDef, false)}
      trueLabel={getFeatureTaskLabel(filterDef, true)}
      onToggleFalse={() =>
        toggleResourceFilterState(adminCtx, 'organisation', key, false)}
      onToggleTrue={() =>
        toggleResourceFilterState(adminCtx, 'organisation', key, true)}
      onToggleChange={() => {
        const nextState =
          currentValue === null ? true : currentValue === true ? false : null;
        setResourceFilterState(adminCtx, 'organisation', key, nextState);
      }} />
  {/if}
{/each}
