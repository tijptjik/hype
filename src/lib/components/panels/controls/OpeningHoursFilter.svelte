<script lang="ts">
// SVELTE
import { ChevronDown, ChevronUp } from '@steeze-ui/heroicons';
// COMPONENTS
import Icon from '$lib/components/common/Icon.svelte';
import RangeSlider from 'svelte-range-slider-pips';
// I18N
import { m } from '$lib/i18n';
// SERVICES
import { setOpeningHoursFilter } from '$lib/client/services/property';
// CONTEXT
import { getAppCtx } from '$lib/context/app.svelte';
// TYPES
import type { OpeningHoursFilterValue } from '$lib/types';

let appCtx = getAppCtx();

type Props = {
  type: 'weekday' | 'weekend';
  defaultOpen?: boolean;
};

let { type, defaultOpen = false }: Props = $props();

const label = type === 'weekday' ? m.filters__weekdays() : m.filters__weekends();
const openKey = type === 'weekday' ? 'weekDayOpen' : 'weekEndOpen';
const closeKey = type === 'weekday' ? 'weekDayClose' : 'weekEndClose';

let isOpen = $state(defaultOpen);

// Get filter state from context (global filter, not per-layer)
let selectedRange = $derived.by((): OpeningHoursFilterValue | null => {
  const filter = appCtx.state.filters.feature.properties?.[`${type}Hours`];
  if (
    filter &&
    typeof filter === 'object' &&
    'rangeMin' in filter &&
    'rangeMax' in filter
  ) {
    return filter as OpeningHoursFilterValue;
  }
  return null;
});

// Default to full range (0-27 hours, where 25=01:00, 26=02:00, 27=03:00 next day)
let values: [number, number] = $derived.by(() => {
  const range = selectedRange;
  return [
    range?.rangeMin ?? 0,
    range?.rangeMax ?? 27
  ] as [number, number];
});

// Format hours as 24:00 format
function formatHour(hour: number): string {
  const h = hour >= 24 ? hour - 24 : hour;
  return `${String(h).padStart(2, '0')}:00`;
}

// Display text showing current selection
let displayText = $derived.by(() => {
  if (values[0] === 0 && values[1] === 27) {
    return m.filters__all_hours();
  }
  return `${formatHour(values[0])} - ${formatHour(values[1])}`;
});

// Pip formatter to show hours correctly
function pipFormatter(value: number): string {
  if (value >= 24) {
    return formatHour(value);
  }
  return formatHour(value);
}
</script>

<div class="min-h-10 flex-shrink-0 rounded-l-md bg-[#0a0a0a]">
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
      <div class="pb-6 pl-4 pr-6 pt-10">
        <RangeSlider
          min={0}
          max={27}
          step={1}
          bind:values
          pips
          all="label"
          first="label"
          last="label"
          rest="pip"
          pipstep={9}
          pushy
          float
          formatter={pipFormatter}
          on:change={() => {
            setOpeningHoursFilter(appCtx, type, openKey, closeKey, values);
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
  --range-handle: #f04d7f;
  --range-handle-focus: #d653b9;
  --range-handle-border: var(--range-handle);
  --range-range-inactive: theme(colors.base-300);
  --range-range: #d653b9;

  /* Handle dimensions */
  --range-handle-width: 16px;
  --range-handle-height: var(--range-handle-width);

  /* Float elements */
  --range-float-inactive: var(--range-handle-inactive);
  --range-float: #d653b9;
  --range-float-text: theme(colors.white);
  --range-float-background: theme(colors.base-content);
  --range-float-border: theme(colors.base-300);
  --range-float-width: 48px;

  /* Pips and labels */
  --range-pip: lightslategray;
  --range-pip-text: var(--range-pip);
  --range-pip-active: #a1a1aa;
  --range-pip-active-text: var(--range-pip-active);
  --range-pip-hover: theme(colors.base-50);
  --range-pip-hover-text: var(--range-pip-hover);
  --range-pip-in-range: theme(colors.base-50);
  --range-pip-in-range-text: var(--range-pip-active-text);

  /* Additional customizations */
  --range-track: theme(colors.base-300);

  /* Vertical spacing adjustments */
  margin: 2rem 0.5rem;
  font-size: 0.8rem;
}
:global(.rangeSlider > .rangeHandle:focus) {
  outline: none;
}
</style>
