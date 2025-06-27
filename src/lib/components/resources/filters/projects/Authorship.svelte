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
import type { ProjectAuthorshipFilterKey } from '$lib/types';

// CONTEXT
const adminCtx = getAdminCtx();

// ═══════════════════════════════════════════════════════════════════════
// AUTHORSHIP FILTERS CONFIG
// ═══════════════════════════════════════════════════════════════════════

const authorshipFilters: Record<
  ProjectAuthorshipFilterKey,
  {
    label: string;
    invertBoolean?: boolean;
    trueLabel?: string;
    falseLabel?: string;
  }
> = {
  hasName: {
    label: m.admin__forms_common_name_full(),
    falseLabel: m.filters__no(),
    trueLabel: m.filters__has()
  },
  hasContextualName: {
    label: m.admin__forms_common_name_short(),
    falseLabel: m.filters__no(),
    trueLabel: m.filters__has()
  },
  hasDescription: {
    label: m.admin__forms_common_description(),
    falseLabel: m.filters__no(),
    trueLabel: m.filters__has()
  },
  hasAttribution: {
    label: m.admin__forms_projects_attribution(),
    falseLabel: m.filters__no(),
    trueLabel: m.filters__has()
  },
  hasLicense: {
    label: m.admin__forms_projects_license(),
    falseLabel: m.filters__no(),
    trueLabel: m.filters__has()
  }
};
</script>

{#each Object.entries(authorshipFilters) as [filterKey, filterDef], idx (filterKey)}
  {@const currentValue = getResourceFilterState(
    adminCtx,
    'project',
    filterKey as ProjectAuthorshipFilterKey
  )}
  {@const key = filterKey as ProjectAuthorshipFilterKey}
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
{/each}
