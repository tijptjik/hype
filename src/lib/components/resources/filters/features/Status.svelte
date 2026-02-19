<script lang="ts">
// I18N
import { m } from '$lib/i18n'
// CONTEXT
import { getAdminCtx } from '$lib/context/admin.svelte'
// SERVICES
import {
  getSimpleFilterState,
  toggleFilterState,
  setFilterState,
  getFeatureTaskLabel,
} from '$lib/client/services/filters'
// COMPONENTS
import FilterToggle from '../FilterToggle.svelte'
// TYPES
import type { FeatureStatusFilterKey } from '$lib/types'

// CONTEXT
const adminCtx = getAdminCtx()

// FILTER DEFINITIONS
const statusFilters: Record<
  FeatureStatusFilterKey,
  {
    label: string
    invertBoolean?: boolean
    trueLabel?: string
    falseLabel?: string
    superAdminOnly?: boolean
  }
> = {
  isPendingReview: {
    label: m.plain_broad_shell_dart(),
    invertBoolean: true,
    falseLabel: m.filters__not(),
    trueLabel: m.filters__is(),
  },
  isPublished: {
    label: m.published(),
    falseLabel: m.filters__not(),
    trueLabel: m.filters__is(),
  },
  isVisitable: {
    label: m.dry_aware_squirrel_cheer(),
    falseLabel: m.filters__not(),
    trueLabel: m.filters__is(),
  },
  isIntangible: {
    label: m.teary_fit_maggot_heart(),
    falseLabel: m.filters__not(),
    trueLabel: m.filters__is(),
  },
  isArchived: {
    label: m.bad_swift_cheetah_surge(),
    superAdminOnly: true,
    falseLabel: m.filters__not(),
    trueLabel: m.filters__is(),
  },
}
</script>

{#each Object.entries(statusFilters) as [ filterKey, filterDef ], idx (filterKey)}
  {#if filterDef.superAdminOnly && !adminCtx.appCtx.user?.superAdmin}
  <!-- do nothing -->
  {:else}
    {@const currentValue = getSimpleFilterState(
      adminCtx,
      filterKey as FeatureStatusFilterKey
    )}
    {@const key = filterKey as FeatureStatusFilterKey}
    <FilterToggle
      label={filterDef.label}
      {currentValue}
      {idx}
      transformOffset={12}
      falseLabel={getFeatureTaskLabel(filterDef, false)}
      trueLabel={getFeatureTaskLabel(filterDef, true)}
      onToggleFalse={() => toggleFilterState(adminCtx, key, false)}
      onToggleTrue={() => toggleFilterState(adminCtx, key, true)}
      onToggleChange={() => {
        const nextState =
          currentValue === null ? true : currentValue === true ? false : null;
        setFilterState(adminCtx, key, nextState);
      }}
    />
  {/if}
{/each}
