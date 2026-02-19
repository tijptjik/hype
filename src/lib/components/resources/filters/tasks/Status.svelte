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
// ENUMS
import { FirstClassResource } from '$lib/enums'
// TYPES
import type { TaskStatusFilterKey } from '$lib/types'

// CONTEXT
const adminCtx = getAdminCtx()

// FILTER DEFINITIONS
const statusFilters: Record<
  TaskStatusFilterKey,
  {
    label: string
    invertBoolean?: boolean
    trueLabel?: string
    falseLabel?: string
  }
> = {
  isReviewed: {
    label: m.plain_broad_shell_dart(),
    trueLabel: m.filters__is(),
    falseLabel: m.filters__not(),
  },
}
</script>

<!-- ═══════════════════════════════════════════════════════════════════════ -->
<!-- STATUS FILTERS -->
<!-- ═══════════════════════════════════════════════════════════════════════ -->

{#each Object.entries(statusFilters) as [ filterKey, filterDef ], idx (filterKey)}
  {@const currentValue = getResourceFilterState(
    adminCtx,
    'task',
    filterKey as TaskStatusFilterKey
  )}
  {@const key = filterKey as TaskStatusFilterKey}
  <FilterToggle
    label={filterDef.label}
    {currentValue}
    {idx}
    transformOffset={12}
    falseLabel={getFeatureTaskLabel(filterDef, false, filterDef.invertBoolean)}
    trueLabel={getFeatureTaskLabel(filterDef, true, filterDef.invertBoolean)}
    onToggleFalse={() => {
      toggleResourceFilterState(adminCtx, 'task', key, false);
      adminCtx.appCtx.refresh(FirstClassResource.task);
    }}
    onToggleTrue={() => {
      toggleResourceFilterState(adminCtx, 'task', key, true);
      adminCtx.appCtx.refresh(FirstClassResource.task);
    }}
    onToggleChange={() => {
      const nextState =
        currentValue === null ? true : currentValue === true ? false : null;
      setResourceFilterState(adminCtx, 'task', key, nextState);
      adminCtx.appCtx.refresh(FirstClassResource.task);
    }}
  />
{/each}
