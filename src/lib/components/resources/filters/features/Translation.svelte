<script lang="ts">
// I18N
import { m } from '$lib/i18n';
// CONTEXT
import { getAdminCtx } from '$lib/context/admin.svelte';
// SERVICES
import {
  getTranslationFilterState,
  toggleFilterState,
  getFeatureTaskLabel
} from '$lib/client/services/filters';
// COMPONENTS
import FilterToggle from '../FilterToggle.svelte';
// ENUM
import { supportedLocales, localeCodes } from '$lib/enums';
// TYPES
import type { FeatureTranslationFilterKey, Locale } from '$lib/types';

// CONTEXT
const adminCtx = getAdminCtx();

// TRANSLATION FILTERS
const translationFilters: Record<FeatureTranslationFilterKey, { label: string }> = {
  isTitleTranslated: {
    label: m.feature__title()
  },
  isDescriptionTranslated: {
    label: m.feature__description()
  },
  isAddressTranslated: {
    label: m.feature__address()
  },
  isSpecifierTranslated: {
    label: m.spicy_ideal_butterfly_revive()
  }
};

// REACTIVE LOCALES from admin context - this fixes BUG 3
const activeLocales = $derived.by(() => {
  const locales = new Set<Locale>();
  const translationLocales = adminCtx.state.viewFilters.feature.translationLocales;
  for (const [locale, isActive] of Object.entries(translationLocales)) {
    if (isActive) {
      locales.add(locale as Locale);
    }
  }
  return locales;
});

function toggleLocale(locale: Locale) {
  const current = adminCtx.state.viewFilters.feature.translationLocales[locale];
  adminCtx.state.viewFilters.feature.translationLocales[locale] = !current;
}
</script>

<div class="flex h-16 flex-row items-center justify-center gap-4">
  <!-- Locale Selection -->
  <div class="flex">
    <div class="divider divider-horizontal mx-0"></div>
    <div class="flex flex-row gap-3">
      {#each supportedLocales as locale}
        <button
          class="btn btn-xs"
          class:text-white={adminCtx.state.viewFilters.feature.translationLocales[
            locale
          ]}
          class:btn-secondary={adminCtx.state.viewFilters.feature.translationLocales[
            locale
          ]}
          class:btn-ghost={!adminCtx.state.viewFilters.feature.translationLocales[
            locale
          ]}
          onclick={() => toggleLocale(locale)}>
          {localeCodes[locale]}
        </button>
      {/each}
    </div>
    <div class="divider divider-horizontal"></div>
  </div>

  <!-- Translation Filters -->
  {#each Object.entries(translationFilters) as [filterKey, filterDef], idx (filterKey)}
    {#if filterKey !== 'isSpecifierTranslated' || adminCtx.appCtx.user?.superAdmin}
      {@const currentValue = getTranslationFilterState(
        adminCtx,
        filterKey as FeatureTranslationFilterKey,
        activeLocales
      )}
      {@const key = filterKey as FeatureTranslationFilterKey}
      <FilterToggle
        label={filterDef.label}
        {currentValue}
        {idx}
        transformOffset={12}
        falseLabel={getFeatureTaskLabel(filterDef, false, true)}
        trueLabel={getFeatureTaskLabel(filterDef, true, true)}
        onToggleFalse={() =>
          toggleFilterState(adminCtx, key, false, undefined, activeLocales)}
        onToggleTrue={() =>
          toggleFilterState(adminCtx, key, true, undefined, activeLocales)}
        onToggleChange={() => {
          const nextState =
            currentValue === null ? true : currentValue === true ? false : null;
          toggleFilterState(adminCtx, key, nextState, undefined, activeLocales);
        }} />
    {/if}
  {/each}
</div>
