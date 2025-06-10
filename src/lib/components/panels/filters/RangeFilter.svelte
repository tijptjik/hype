<script lang="ts">
import { ChevronDown, ChevronUp } from '@steeze-ui/heroicons';
import Icon from '$lib/components/common/Icon.svelte';
import RangeSlider from 'svelte-range-slider-pips';
// I18N
import { m } from '$lib/i18n';
// CONTEXT
import { getAppCtx } from '$lib/context/app.svelte';
// TYPES
import type { Id } from '$lib/types';
let appCtx = getAppCtx();

type Props = {
  key: string;
  label: string;
  min: number;
  max: number;
  layerId: Id;
  defaultOpen: boolean;
};

let { key, label, min, max, layerId, defaultOpen = false }: Props = $props();

let isOpen = $state(defaultOpen);
let selectedRange = $derived(appCtx.propertyFilters?.[layerId]?.[key]);

let displayText = $derived.by(() => {
  if (min === values[0] && max === values[1]) {
    return m.filters__all();
  } else if (values[0] === values[1]) {
    return `${m.filters__only()} ${values[0]} ${m.filters__stars()}`;
  } else {
    return `${m.filters__between()} ${values[0]} ${m.filters__and()} ${values[1]} ${m.filters__stars()}`;
  }
});

let values: [number, number] = $derived([
  selectedRange?.rangeMin ?? min,
  selectedRange?.rangeMax ?? max
]);
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
          pipstep={Math.ceil((max - min) / 10)}
          pushy
          float
          on:change={() => {
            appCtx.setRangePropertyFilter(layerId, key, values);
            appCtx.zoomToAllVisibleFeatures();
          }} />
      </div>
    </div>
  {/if}
</div>

<style>
:global(.rangeSlider) {
  /* Slider main elements */
  --range-slider: theme(colors.base-100);
  --range-handle-inactive: theme(colors.base-content / 0.3);
  --range-handle: theme(colors.sky.600);
  --range-handle-focus: theme(colors.sky.600);
  --range-handle-border: var(--range-handle);
  --range-range-inactive: var(--range-handle-inactive);
  --range-range: var(--range-handle-focus);

  /* Handle dimensions */
  --range-handle-width: 16px;
  --range-handle-height: var(--range-handle-width);

  /* Float elements */
  --range-float-inactive: var(--range-handle-inactive);
  --range-float: theme(colors.sky.600);
  --range-float-text: theme(colors.white);
  --range-float-background: theme(colors.base-content);
  --range-float-border: theme(colors.base-300);
  --range-float-width: 32px;

  /* Pips and labels */
  --range-pip: lightslategray; /* color of the base pips */
  --range-pip-text: var(--range-pip); /* color of the base labels */
  --range-pip-active: #a1a1aa; /* active pips (when handle is on a slider-stop) */
  --range-pip-active-text: var(--range-pip-active);
  --range-pip-hover: theme(colors.base-50); /* when a slider-stop is hovered */
  --range-pip-hover-text: var(--range-pip-hover); /* when a slider-stop is hovered */
  --range-pip-in-range: theme(colors.base-50); /* pips inside the range */
  --range-pip-in-range-text: var(--range-pip-active-text); /* labels inside the range */

  /* Additional customizations */
  --range-track: theme(colors.base-300);

  /* Vertical spacing adjustments */
  margin: 2rem 0.5rem;
  font-size: 0.8rem; /* default size */
}
:global(.rangeSlider > .rangeHandle:focus) {
  outline: none;
}
</style>
