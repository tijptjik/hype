//I18N
import { m } from '$lib/i18n';
// CONTEXT
import { AdminCtx } from '../../context/admin.svelte';
// TYPES
import type { FilterTriState, FeatureStatusFilterKey } from '$lib/types';

// HELPERS
export function getFeatureFilterState(
  adminCtx: AdminCtx,
  filterKey: FeatureStatusFilterKey
): FilterTriState {
  // Access the status filters from adminCtx
  const featureFilters = adminCtx.state?.viewFilters?.feature;
  if (
    featureFilters &&
    typeof featureFilters === 'object' &&
    filterKey in featureFilters
  ) {
    return featureFilters[filterKey] as FilterTriState;
  }
  return null;
}

export function setFeatureFilterState(
  adminCtx: AdminCtx,
  filterKey: FeatureStatusFilterKey,
  value: FilterTriState
) {
  // Set the status filter value
  const featureFilters = adminCtx.state?.viewFilters?.feature;
  if (featureFilters && typeof featureFilters === 'object') {
    featureFilters[filterKey] = value;
  }
}

export function handleToggleChange(
  adminCtx: AdminCtx,
  filterKey: FeatureStatusFilterKey,
  event: Event
) {
  const target = event.target as HTMLInputElement;
  const currentState = getFeatureFilterState(adminCtx, filterKey);

  let newState: FilterTriState;
  if (currentState === null) {
    newState = true;
  } else if (currentState === false) {
    newState = null;
    // Set indeterminate on next tick
    setTimeout(() => {
      target.indeterminate = true;
      target.checked = false;
    }, 0);
    return;
  } else {
    newState = false;
  }

  setFeatureFilterState(adminCtx, filterKey, newState);
  target.indeterminate = newState === null;
}

export function toggleBooleanState(
  adminCtx: AdminCtx,
  filterKey: FeatureStatusFilterKey,
  value: FilterTriState
) {
  const currentState = getFeatureFilterState(adminCtx, filterKey);
  const newValue = value == currentState ? null : value;
  setFeatureFilterState(adminCtx, filterKey, newValue);
}

export function getFeatureFilterLabel(
  adminCtx: AdminCtx,
  filterDef: any,
  targetState: boolean
): string {
  if (!targetState) {
    return filterDef.falseLabel || m.filters__not();
  } else {
    return filterDef.trueLabel || m.filters__only();
  }
}
