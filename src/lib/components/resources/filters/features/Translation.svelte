<script lang="ts">
// SVELTE
import { SvelteSet } from 'svelte/reactivity';
// I18N
import { m } from '$lib/i18n';
import { getLocale } from '$lib/i18n';
// CONTEXT
import { getAdminCtx } from '$lib/context/admin.svelte';
// SERVICES
import {
  getTranslationFilterState,
  toggleBooleanState,
  handleToggleChange,
  getFeatureTaskLabel
} from '$lib/client/services/filters';
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
  }
};

// ACTIVE LOCALES (defaulting to non-english)
let activeLocales = $state(new SvelteSet<Locale>(['zh-hant', 'zh-hans']));

function toggleLocale(locale: Locale) {
  if (activeLocales.has(locale)) {
    activeLocales.delete(locale);
  } else {
    activeLocales.add(locale);
  }
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
          class:text-white={activeLocales.has(locale)}
          class:btn-secondary={activeLocales.has(locale)}
          class:btn-ghost={!activeLocales.has(locale)}
          onclick={() => toggleLocale(locale)}>
          {localeCodes[locale]}
        </button>
      {/each}
    </div>
    <div class="divider divider-horizontal"></div>
  </div>

  <!-- Translation Filters -->
  {#each Object.entries(translationFilters) as [filterKey, filterDef], idx (filterKey)}
    {@const currentValue = getTranslationFilterState(
      adminCtx,
      filterKey as FeatureTranslationFilterKey,
      activeLocales
    )}
    {@const key = filterKey as FeatureTranslationFilterKey}
    <div
      class="group flex flex-col items-center gap-[8px] tracking-widest"
      style="transform: translateX({-32 * idx}px)">
      <label class="text-xs uppercase leading-none text-base-content/70">
        {filterDef.label}
      </label>
      <div class="flex items-center gap-2">
        <span
          onclick={() =>
            toggleBooleanState(adminCtx, key, false, undefined, activeLocales)}
          class="text text-sm uppercase text-base-content opacity-0 transition-opacity duration-300 group-hover:opacity-40">
          {getFeatureTaskLabel(adminCtx, filterDef, false, true)}
        </span>
        <input
          type="checkbox"
          class="toggle toggle-sm"
          checked={currentValue === true}
          indeterminate={currentValue === null}
          onchange={(e) =>
            handleToggleChange(adminCtx, key, e, undefined, activeLocales)} />
        <span
          onclick={() =>
            toggleBooleanState(adminCtx, key, true, undefined, activeLocales)}
          class="text text-sm uppercase text-base-content opacity-0 transition-opacity duration-300 group-hover:opacity-40">
          {getFeatureTaskLabel(adminCtx, filterDef, true, true)}
        </span>
      </div>
    </div>
  {/each}
  <!-- Specifier Translation (TODO) -->
  <div class="self-center text-xs text-base-content/60"></div>
</div>
