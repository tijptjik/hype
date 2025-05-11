<script lang="ts">
// ICONS
import { ChevronDown, ChevronUp } from '@steeze-ui/heroicons';
import Icon from '$lib/components/common/Icon.svelte';
// UTILS
import {
  getOriginalValue,
  getTranslatedValue,
  displaySelectedProperties
} from '$lib/utils/formatting';
// CONTEXT
import { getMapContext } from '$lib/context/map.svelte';
// TYPES
import type { Id, TranslatedValue } from '$lib/types';

let mapCtx = getMapContext();

type Props = {
  key: string;
  label: string;
  values: Array<string | TranslatedValue>; // Property definition values
  layerId: Id;
  defaultOpen: boolean;
};

let { key, label, values = [], layerId, defaultOpen = false }: Props = $props();

// Derive selected values directly from context's propertyFilters
let selected = $derived(mapCtx.propertyFilters?.[layerId]?.[key] ?? []);

let isOpen = $state(defaultOpen);

function toggleValue(value: string | TranslatedValue) {
  const originalValue = getOriginalValue(value);
  const currentSelection = mapCtx.propertyFilters?.[layerId]?.[key] ?? [];
  const index = currentSelection.indexOf(originalValue);
  let newSelection: string[];

  if (index === -1) {
    newSelection = [...currentSelection, originalValue];
  } else {
    newSelection = currentSelection.filter((v: string) => v !== originalValue);
  }

  // Update context using the dedicated methods
  if (newSelection.length > 0) {
    mapCtx.setCategoricalPropertyFilter(layerId, key, newSelection);
  } else {
    // If selection becomes empty, remove the key from the filter object for this layer
    mapCtx.removeCategoricalPropertyFilter(layerId, key);
  }

  mapCtx.zoomToAllVisibleFeatures();
}

let displayText = $derived(displaySelectedProperties(selected, values));
</script>

<div class="ml-4 min-h-10 flex-shrink-0 rounded-l-md bg-[#0a0a0a]">
  <button
    class="flex w-full flex-shrink-0 items-center justify-between rounded-none py-2 pl-6 pr-9 focus:outline-none focus:ring-0 focus-visible:text-primary"
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
      class="flex max-h-[260px] flex-col overflow-y-auto overscroll-contain rounded-l-md bg-base-300">
      {#each values as value (getOriginalValue(value))}
        {@const originalValue = getOriginalValue(value)}
        <label
          class="label cursor-pointer justify-start gap-3 px-6 pr-2 transition-all duration-300 first:pt-3 last:pb-3 hover:bg-base-100">
          <div
            class="flex h-2 w-2 items-center gap-2 rounded-full {selected.includes(
              originalValue
            )
              ? 'bg-sky-600'
              : 'border-1 border-base-content/60 bg-transparent'}">
          </div>
          <input
            type="checkbox"
            checked={selected.includes(originalValue)}
            class="checkbox checkbox-sm hidden"
            onchange={() => toggleValue(value)} />
          <span class="label-text text-sm font-medium"
            >{getTranslatedValue(value)}</span>
        </label>
      {/each}
    </div>
  {/if}
</div>
