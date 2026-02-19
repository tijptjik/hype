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
import type { ProjectImageFilterKey } from '$lib/types'

// CONTEXT
const adminCtx = getAdminCtx()

// ═══════════════════════════════════════════════════════════════════════
// IMAGE FILTERS CONFIG
// ═══════════════════════════════════════════════════════════════════════

const imageFilters: Record<
  ProjectImageFilterKey,
  {
    label: string
    invertBoolean?: boolean
    trueLabel?: string
    falseLabel?: string
  }
> = {
  hasImage: {
    label: m.filters__image(),
    falseLabel: m.filters__no(),
    trueLabel: m.filters__has(),
  },
}
</script>

{#each Object.entries(imageFilters) as [ filterKey, filterDef ], idx (filterKey)}
  {@const currentValue = getResourceFilterState(
    adminCtx,
    'project',
    filterKey as ProjectImageFilterKey
  )}
  {@const key = filterKey as ProjectImageFilterKey}
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
    }}
  />
{/each}
