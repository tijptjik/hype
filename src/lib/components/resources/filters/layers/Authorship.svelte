<!-- 
═══════════════════════════════════════════════════════════════════════════
LAYERS :: FILTERS :: AUTHORSHIP
═══════════════════════════════════════════════════════════════════════════
-->

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
import type { LayerAuthorshipFilterKey } from '$lib/types'

// CONTEXT
const adminCtx = getAdminCtx()

// FILTER DEFINITIONS
const authorshipFilters: Record<
  LayerAuthorshipFilterKey,
  {
    label: string
    invertBoolean?: boolean
    trueLabel?: string
    falseLabel?: string
  }
> = {
  hasName: {
    label: m.admin__forms_common_name_full(),
    falseLabel: m.filters__no(),
    trueLabel: m.filters__has(),
  },
  hasContextualName: {
    label: m.admin__forms_common_name_short(),
    falseLabel: m.filters__no(),
    trueLabel: m.filters__has(),
  },
  hasDescription: {
    label: m.feature__description(),
    falseLabel: m.filters__no(),
    trueLabel: m.filters__has(),
  },
}
</script>

<!-- ═══════════════════════════════════════════════════════════════════════ -->
<!-- AUTHORSHIP FILTERS -->
<!-- ═══════════════════════════════════════════════════════════════════════ -->

{#each Object.entries(authorshipFilters) as [ filterKey, filterDef ], idx (filterKey)}
  {@const currentValue = getResourceFilterState(
    adminCtx,
    'layer',
    filterKey as LayerAuthorshipFilterKey
  )}
  {@const key = filterKey as LayerAuthorshipFilterKey}
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
{/each}
