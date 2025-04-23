<script lang="ts">
import { ChevronDown, ChevronUp } from '@steeze-ui/heroicons';
import Icon from '$lib/components/common/Icon.svelte';
// I18N
import { m, getLocale } from '$lib/i18n';
// CONTEXT
import { getMapContext } from '$lib/context/map.svelte';

let mapContext = getMapContext();

// Add this to your existing types
export type TranslatedValue = {
  value: string;
  translations?: {
    lang: string;
    value: string;
  }[];
};

let {
  key,
  label,
  values = [],
  selected = []
} = $props<{
  key: string;
  label: string;
  values: Array<string | TranslatedValue>;
  selected: string[];
}>();

let isOpen = $state(false);

// Helper function to get translated value
function getTranslatedValue(value: string | TranslatedValue): string {
  if (typeof value === 'string') return value;

  const currentLang = getLocale();
  if (currentLang === 'en') return value.value;

  const translation = value.translations?.find((t) => t.lang === currentLang);
  return translation?.value || value.value; // fallback to English if no translation
}

function toggleValue(value: string | TranslatedValue) {
  const originalValue = typeof value === 'string' ? value : value.value;
  const index = selected.indexOf(originalValue);
  if (index === -1) {
    selected = [...selected, originalValue];
  } else {
    selected = selected.filter((v: string) => v !== originalValue);
  }
  if (selected.length > 0) {
    mapContext.state.filters.properties[key] = selected;
  } else {
    delete mapContext.state.filters.properties[key];
  }
}

let displayText = $derived(() => {
  if (!selected) return '-';
  // Update display text whenever selected changes
  if (selected.length === 0) return m.filters__all();
  if (selected.length === 1) {
    const selectedValue = values.find(
      (v) => (typeof v === 'string' ? v : v.value) === selected[0]
    );
    return getTranslatedValue(selectedValue!);
  }
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
      <p class="font-medium">{displayText()}</p>
    </div>
    {#if isOpen}
      <Icon src={ChevronUp} class="h-5 w-5 flex-shrink-0" />
    {:else}
      <Icon src={ChevronDown} class="h-5 w-5 flex-shrink-0" />
    {/if}
  </button>

  <!-- Options -->
  {#if isOpen}
    <div
      class="flex max-h-[260px] flex-col overflow-y-auto rounded-none bg-base-300 px-3 py-1">
      {#each values as value}
        {@const displayValue = getTranslatedValue(value)}
        {@const originalValue = typeof value === 'string' ? value : value.value}
        <label class="flex cursor-pointer items-center px-3 py-3 hover:bg-base-300/70">
          <input
            name={originalValue}
            type="checkbox"
            class="checkbox checkbox-sm"
            checked={selected.includes(originalValue)}
            onchange={() => toggleValue(value)} />
          <span class="pl-3 text-sm font-normal">{displayValue}</span>
        </label>
      {/each}
    </div>
  {/if}
</div>
