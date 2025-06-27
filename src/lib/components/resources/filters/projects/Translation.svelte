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
// ENUM
import { supportedLocales, localeCodes } from '$lib/enums';
// TYPES
import type { ProjectTranslationFilterKey, Locale } from '$lib/types';

// CONTEXT
const adminCtx = getAdminCtx();

// ═══════════════════════════════════════════════════════════════════════
// TRANSLATION FILTERS CONFIG
// ═══════════════════════════════════════════════════════════════════════

const translationFilters: Record<
  ProjectTranslationFilterKey,
  {
    label: string;
    invertBoolean?: boolean;
    trueLabel?: string;
    falseLabel?: string;
  }
> = {
  isNameTranslated: {
    label: m.admin__forms_common_name_full(),
    falseLabel: m.filters__todo(),
    trueLabel: m.filters__done()
  },
  isContextualNameTranslated: {
    label: m.admin__forms_common_name_short(),
    falseLabel: m.filters__todo(),
    trueLabel: m.filters__done()
  },
  isDescriptionTranslated: {
    label: m.admin__forms_common_description(),
    falseLabel: m.filters__todo(),
    trueLabel: m.filters__done()
  },
  isAttributionTranslated: {
    label: m.admin__forms_projects_attribution(),
    falseLabel: m.filters__todo(),
    trueLabel: m.filters__done()
  },
  isLicenseTranslated: {
    label: m.admin__forms_projects_license(),
    falseLabel: m.filters__todo(),
    trueLabel: m.filters__done()
  }
};

// REACTIVE LOCALES from admin context
const activeLocales = $derived.by(() => {
  const locales = new Set<Locale>();
  const translationLocales = adminCtx.state.viewFilters.project.translationLocales;
  for (const [locale, isActive] of Object.entries(translationLocales)) {
    if (isActive) {
      locales.add(locale as Locale);
    }
  }
  return locales;
});

function toggleLocale(locale: Locale) {
  const current = adminCtx.state.viewFilters.project.translationLocales[locale];
  adminCtx.state.viewFilters.project.translationLocales[locale] = !current;
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
          class:text-white={adminCtx.state.viewFilters.project.translationLocales[
            locale
          ]}
          class:btn-secondary={adminCtx.state.viewFilters.project.translationLocales[
            locale
          ]}
          class:btn-ghost={!adminCtx.state.viewFilters.project.translationLocales[
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
    {@const currentValue = getResourceFilterState(
      adminCtx,
      'project',
      filterKey as ProjectTranslationFilterKey,
      activeLocales
    )}
    {@const key = filterKey as ProjectTranslationFilterKey}
    <FilterToggle
      label={filterDef.label}
      {currentValue}
      {idx}
      transformOffset={12}
      falseLabel={getFeatureTaskLabel(filterDef, false, true)}
      trueLabel={getFeatureTaskLabel(filterDef, true, true)}
      onToggleFalse={() =>
        toggleResourceFilterState(adminCtx, 'project', key, false, activeLocales)}
      onToggleTrue={() =>
        toggleResourceFilterState(adminCtx, 'project', key, true, activeLocales)}
      onToggleChange={() => {
        const nextState =
          currentValue === null ? true : currentValue === true ? false : null;
        setResourceFilterState(adminCtx, 'project', key, nextState, activeLocales);
      }} />
  {/each}
</div>
