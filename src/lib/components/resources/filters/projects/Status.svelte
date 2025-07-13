<script lang="ts">
// I18N
import { m } from '$lib/i18n';
// CONTEXT
import { getAdminCtx } from '$lib/context/admin.svelte';
// COMPONENTS
import FilterToggle from '../FilterToggle.svelte';
// SERVICES
import {
  getResourceFilterState,
  toggleResourceFilterState,
  setResourceFilterState,
  getFeatureTaskLabel
} from '$lib/client/services/filters';
// TYPES
import type { ProjectStatusFilterKey } from '$lib/types';

// CONTEXT
const adminCtx = getAdminCtx();

// ═══════════════════════════════════════════════════════════════════════
// STATUS FILTERS CONFIG
// ═══════════════════════════════════════════════════════════════════════

const statusFilters: Record<
  ProjectStatusFilterKey,
  {
    label: string;
    invertBoolean?: boolean;
    trueLabel?: string;
    falseLabel?: string;
    superAdminOnly?: boolean;
  }
> = {
  isPublished: {
    label: m.published(),
    trueLabel: m.filters__not(),
    falseLabel: m.filters__is()
  },
  isArchived: {
    label: m.bad_swift_cheetah_surge(),
    trueLabel: m.filters__not(),
    falseLabel: m.filters__is(),
    superAdminOnly: true
  }
};
</script>

{#each Object.entries(statusFilters) as [filterKey, filterDef], idx (filterKey)}
  {#if !filterDef.superAdminOnly || adminCtx.appCtx.user?.superAdmin}
    {@const currentValue = getResourceFilterState(
      adminCtx,
      'project',
      filterKey as ProjectStatusFilterKey
    )}
    {@const key = filterKey as ProjectStatusFilterKey}
    <FilterToggle
      label={filterDef.label}
      {currentValue}
      {idx}
      transformOffset={12}
      falseLabel={getFeatureTaskLabel(filterDef, false, filterDef.invertBoolean)}
      trueLabel={getFeatureTaskLabel(filterDef, true, filterDef.invertBoolean)}
      onToggleFalse={() => toggleResourceFilterState(adminCtx, 'project', key, false)}
      onToggleTrue={() => toggleResourceFilterState(adminCtx, 'project', key, true)}
      onToggleChange={() => {
        const nextState =
          currentValue === null ? true : currentValue === true ? false : null;
        setResourceFilterState(adminCtx, 'project', key, nextState);
      }} />
  {/if}
{/each}
