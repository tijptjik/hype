<script lang="ts">
import { ChevronDown, ChevronUp } from '@steeze-ui/heroicons';
import Icon from '$lib/components/common/Icon.svelte';
import RangeSlider from 'svelte-range-slider-pips';
// I18N
import { m } from '$lib/i18n';
import { getI18n } from '$lib/i18n';
// SERVICES
import {
  setRangePropertyFilter,
  displayRangeFilter
} from '$lib/client/services/property';
// CONTEXT
import { getAppCtx } from '$lib/context/app.svelte';
// TYPES
import type { Id, Property } from '$lib/types';
let appCtx = getAppCtx();

type Props = {
  property: Property;
  layerId: Id;
  defaultOpen: boolean;
};

let { property, layerId, defaultOpen = false }: Props = $props();

// Derive values from property
let label = $derived(
  getI18n(property, 'label', appCtx.getUserPreferences(), property.key)
);
let min = $derived(property.min!);
let max = $derived(property.max!);

let isOpen = $state(defaultOpen);
let selectedRange = $derived(
  appCtx.state.filters.feature.properties?.[layerId]?.[property.id]
);

let values: [number, number] = $derived([
  selectedRange?.rangeMin ?? min,
  selectedRange?.rangeMax ?? max
]);

let displayText = $derived(displayRangeFilter(min, max, values));
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
      class="flex max-h-[260px] flex-col overflow-y-auto overscroll-contain rounded-l-md bg-base-300 px-3">
      <div class="pb-4 pl-2 pr-4 pt-8">
        <RangeSlider
          {min}
          {max}
          step={1}
          bind:values
          pips
          all="label"
          first="label"
          last="label"
          rest="pip"
          pipstep={Math.max(1, Math.ceil((max - min) / 10))}
          pushy
          float
          on:change={() => {
            setRangePropertyFilter(appCtx, layerId, property.id, values);
          }} />
      </div>
    </div>
  {/if}
</div>

<style>
:global(.rangeSlider) {
  /* Slider main elements */
  --range-slider: var(--color-base-100);
  --range-handle-inactive: color-mix(
    in srgb,
    var(--color-base-content) 30%,
    transparent
  );
  --range-handle: var(--color-sky-600);
  --range-handle-focus: var(--color-sky-600);
  --range-handle-border: var(--range-handle);
  --range-range-inactive: var(--range-handle-inactive);
  --range-range: var(--range-handle-focus);

  /* Handle dimensions */
  --range-handle-width: 16px;
  --range-handle-height: var(--range-handle-width);

  /* Float elements */
  --range-float-inactive: var(--range-handle-inactive);
  --range-float: var(--color-sky-600);
  --range-float-text: var(--color-white);
  --range-float-background: var(--color-base-content);
  --range-float-border: var(--color-base-300);
  --range-float-width: 32px;

  /* Pips and labels */
  --range-pip: lightslategray; /* color of the base pips */
  --range-pip-text: var(--range-pip); /* color of the base labels */
  --range-pip-active: #a1a1aa; /* active pips (when handle is on a slider-stop) */
  --range-pip-active-text: var(--range-pip-active);
  --range-pip-hover: var(--color-base-50); /* when a slider-stop is hovered */
  --range-pip-hover-text: var(--range-pip-hover); /* when a slider-stop is hovered */
  --range-pip-in-range: var(--color-base-50); /* pips inside the range */
  --range-pip-in-range-text: var(--range-pip-active-text); /* labels inside the range */

  /* Additional customizations */
  --range-track: var(--color-base-300);

  /* Vertical spacing adjustments */
  margin: 2rem 0.5rem;
  font-size: 0.8rem; /* default size */
}
:global(.rangeSlider > .rangeHandle:focus) {
  outline: none;
}
</style>
