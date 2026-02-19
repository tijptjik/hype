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
import type { LayerStatusFilterKey } from '$lib/types'

// CONTEXT
const adminCtx = getAdminCtx()

// FILTER DEFINITIONS
const statusFilters: Record<
  LayerStatusFilterKey,
  {
    label: string
    invertBoolean?: boolean
    trueLabel?: string
    falseLabel?: string
    superAdminOnly?: boolean
  }
> = {
  isPublished: {
    label: m.published(),
    trueLabel: m.filters__is(),
    falseLabel: m.filters__not(),
  },
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
      'layer',
      filterKey as LayerStatusFilterKey
    )}
    {@const key = filterKey as LayerStatusFilterKey}
    <FilterToggle
      label={filterDef.label}
      {currentValue}
      {idx}
      transformOffset={12}
      falseLabel={getFeatureTaskLabel(filterDef, false, filterDef.invertBoolean)}
      trueLabel={getFeatureTaskLabel(filterDef, true, filterDef.invertBoolean)}
      onToggleFalse={() => toggleResourceFilterState(adminCtx, 'layer', key, false)}
      onToggleTrue={() => toggleResourceFilterState(adminCtx, 'layer', key, true)}
      onToggleChange={() => {
        const nextState =
          currentValue === null ? true : currentValue === true ? false : null;
        setResourceFilterState(adminCtx, 'layer', key, nextState);
      }}
    />
  {/if}
{/each}
