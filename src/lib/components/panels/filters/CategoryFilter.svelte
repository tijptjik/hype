<script lang="ts">
// ICONS
import { ChevronDown, ChevronUp } from '@steeze-ui/heroicons';
import Icon from '$lib/components/common/Icon.svelte';
// UTILS
import {
  getOriginalValue,
  getPropValueInCurrentLocale,
  displaySelectedProperties
} from '$lib/utils/formatting';
// CONTEXT
import { getAppCtx } from '$lib/context/app.svelte';
// TYPES
import type { Id, TranslatedValue } from '$lib/types';

let appCtx = getAppCtx();

type Props = {
  key: string;
  label: string;
  values: Array<string | TranslatedValue>; // Property definition values
  layerId: Id;
  defaultOpen: boolean;
};

let { key, label, values = [], layerId, defaultOpen = false }: Props = $props();

// Derive selected values directly from context's propertyFilters
let selected = $derived(appCtx.propertyFilters?.[layerId]?.[key] ?? []);

let isOpen = $state(defaultOpen);

function toggleValue(value: string | TranslatedValue) {
  const originalValue = getOriginalValue(value);
  const currentSelection = appCtx.propertyFilters?.[layerId]?.[key] ?? [];
  const index = currentSelection.indexOf(originalValue);
  let newSelection: string[];

  if (index === -1) {
    newSelection = [...currentSelection, originalValue];
  } else {
    newSelection = currentSelection.filter((v: string) => v !== originalValue);
  }

  // Update context using the dedicated methods
  if (newSelection.length > 0) {
    appCtx.setCategoricalPropertyFilter(layerId, key, newSelection);
  } else {
    // If selection becomes empty, remove the key from the filter object for this layer
    appCtx.removeCategoricalPropertyFilter(layerId, key);
  }

  appCtx.zoomToAllVisibleFeatures();
}

let displayText = $derived(displaySelectedProperties(selected, values));
</script>

<div class="ml-4 min-h-10 flex-shrink-0 rounded-l-md bg-[#0a0a0a]">
  <button
    class="flex w-full flex-shrink-0 items-center justify-between rounded-none py-2 pl-6 pr-9 focus:outline-none focus:ring-0 focus-visible:text-sky-600"
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
      class="flex max-h-[260px] flex-col overflow-y-auto overscroll-contain rounded-l-md bg-base-300"
      tabindex="-1">
      {#each values as value (getOriginalValue(value))}
        {@const originalValue = getOriginalValue(value)}
        <label
          class="group label cursor-pointer justify-start gap-3 px-6 pr-2 first:pt-4 last:pb-4 focus:outline-none focus:ring-0"
          tabindex="0"
          onkeydown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault();
              toggleValue(value);
            }
          }}>
          <div
            class="flex h-2 w-2 items-center gap-2 rounded-full group-hover:bg-base-content/60 group-focus:outline-none group-focus:ring-0 group-focus-visible:bg-base-content/60 {selected.includes(
              originalValue
            )
              ? 'bg-sky-600 group-hover:bg-sky-600/60 group-focus-visible:bg-sky-600/60'
              : 'border-1 border-base-content/60 bg-transparent'}">
          </div>
          <input
            type="checkbox"
            checked={selected.includes(originalValue)}
            class="checkbox checkbox-sm hidden"
            onchange={() => toggleValue(value)} />
          <span class="label-text text-sm font-medium"
            >{getPropValueInCurrentLocale(value)}</span>
        </label>
      {/each}
    </div>
  {/if}
</div>
