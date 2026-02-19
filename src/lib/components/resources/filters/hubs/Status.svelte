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
import type { HubStatusFilterKey } from '$lib/types'

// CONTEXT
const adminCtx = getAdminCtx()

// FILTER DEFINITIONS
const statusFilters: Record<
  HubStatusFilterKey,
  {
    label: string
    invertBoolean?: boolean
    trueLabel?: string
    falseLabel?: string
    superAdminOnly?: boolean
  }
> = {
  isArchived: {
    label: m.bad_swift_cheetah_surge(),
    trueLabel: m.filters__is(),
    falseLabel: m.filters__not(),
    superAdminOnly: true,
  },
}
</script>

<!-- ═══════════════════════════════════════════════════════════════════════ -->
<!-- STATUS FILTERS -->
<!-- ═══════════════════════════════════════════════════════════════════════ -->

{#each Object.entries(statusFilters) as [ filterKey, filterDef ], idx (filterKey)}
  {#if !filterDef.superAdminOnly || adminCtx.appCtx.user?.superAdmin}
    {@const currentValue = getResourceFilterState(
      adminCtx,
      'hub',
      filterKey as HubStatusFilterKey
    )}
    {@const key = filterKey as HubStatusFilterKey}
    <FilterToggle
      label={filterDef.label}
      {currentValue}
      {idx}
      transformOffset={12}
      falseLabel={getFeatureTaskLabel(filterDef, false, filterDef.invertBoolean)}
      trueLabel={getFeatureTaskLabel(filterDef, true, filterDef.invertBoolean)}
      onToggleFalse={() => toggleResourceFilterState(adminCtx, 'hub', key, false)}
      onToggleTrue={() => toggleResourceFilterState(adminCtx, 'hub', key, true)}
      onToggleChange={() => {
        const nextState =
          currentValue === null ? true : currentValue === true ? false : null;
        setResourceFilterState(adminCtx, 'hub', key, nextState);
      }}
    />
  {/if}
{/each}
