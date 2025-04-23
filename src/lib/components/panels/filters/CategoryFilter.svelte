<script lang="ts">
import { ChevronDown, ChevronUp } from '@steeze-ui/heroicons';
import Icon from '$lib/components/common/Icon.svelte';
// I18N
import { getLocale } from '$lib/i18n';
import * as m from '$lib/paraglide/messages';
// CONTEXT
import { getMapContext } from '$lib/context/map.svelte';
// TYPES
import type { Id } from '$lib/types';

let mapContext = getMapContext();

// Add this to your existing types
export type TranslatedValue = {
  value: string;
  translations?: {
    lang: string;
    value: string;
  }[];
};

type Props = {
  key: string;
  label: string;
  values: Array<string | TranslatedValue>; // Property definition values
  layerId: Id;
};

let { key, label, values = [], layerId }: Props = $props();

// Derive selected values directly from context's propertyFilters
let selected = $derived(mapContext.propertyFilters?.[layerId]?.[key] ?? []);

let isOpen = $state(false);

// Helper function to get translated display value
function getTranslatedValue(value: string | TranslatedValue): string {
  if (typeof value === 'string') return value;
  const currentLang = getLocale();
  if (currentLang === 'en') return value.value;
  const translation = value.translations?.find((t) => t.lang === currentLang);
  return translation?.value || value.value; // fallback to English if no translation
}

// Get the original (non-translated) value for storing in state
function getOriginalValue(value: string | TranslatedValue): string {
  return typeof value === 'string' ? value : value.value;
}

function toggleValue(value: string | TranslatedValue) {
  const originalValue = getOriginalValue(value);
  // Read the current selection *directly* from the context state for accuracy
  const currentSelection = mapContext.propertyFilters?.[layerId]?.[key] ?? [];
  const index = currentSelection.indexOf(originalValue);
  let newSelection: string[];

  if (index === -1) {
    newSelection = [...currentSelection, originalValue];
  } else {
    newSelection = currentSelection.filter((v: string) => v !== originalValue);
  }

  // Update context using the dedicated methods
  if (newSelection.length > 0) {
    mapContext.setCategoricalPropertyFilter(layerId, key, newSelection);
  } else {
    // If selection becomes empty, remove the key from the filter object for this layer
    mapContext.removeCategoricalPropertyFilter(layerId, key);
  }
  console.info(
    `[FilterDebug] CategoryFilter ${layerId}/${key} updated context with:`,
    newSelection
  );
}

// Determine display text based on the derived selection from context
let displayText = $derived.by(() => {
  if (!selected) return '-';
  // Use the derived 'selected' state which reads from context
  if (selected.length === 0) {
    return m.filters__all();
  } else if (selected.length === 1) {
    // Find the corresponding value object to get potential translation
    const valueObject = values.find((v) => getOriginalValue(v) === selected[0]);
    return valueObject ? getTranslatedValue(valueObject) : selected[0];
  } else {
    // Use count from the derived 'selected' state
    return (
      selected
        .map((s) => {
          const value = values.find((v) => (typeof v === 'string' ? v : v.value) === s);
          return getTranslatedValue(value!);
        })
        .slice(0, -1)
        .join(', ') +
      ' & ' +
      getTranslatedValue(
        values.find(
          (v) => (typeof v === 'string' ? v : v.value) === selected[selected.length - 1]
        )!
      )
    );
  }
});
</script>

<div class="min-h-10 w-full flex-shrink-0 bg-[#0A0A0A]">
  <button
    class="flex w-full flex-shrink-0 items-center justify-between rounded-none py-2 pl-6 pr-9"
    onclick={() => (isOpen = !isOpen)}>
    <div class="flex flex-col justify-start gap-0 text-left">
      <p class="text-xs font-thin uppercase tracking-widest text-base-content/60">
        {label}
      </p>
      <p class="font-medium">{displayText}</p>
    </div>
    <Icon src={isOpen ? ChevronUp : ChevronDown} class="h-5 w-5 flex-shrink-0" />
  </button>
  <!-- Options -->
  {#if isOpen}
    <div
      class="flex max-h-[260px] flex-col overflow-y-auto rounded-none bg-base-300 px-3">
      {#each values as value (getOriginalValue(value))}
        {@const originalValue = getOriginalValue(value)}
        <label
          class="label cursor-pointer justify-start gap-3 rounded-none px-6 py-2 hover:bg-base-100">
          <input
            type="checkbox"
            checked={selected.includes(originalValue)}
            class="checkbox checkbox-sm"
            onchange={() => toggleValue(value)} />
          <span class="label-text text-sm font-medium"
            >{getTranslatedValue(value)}</span>
        </label>
      {/each}
    </div>
  {/if}
</div>
