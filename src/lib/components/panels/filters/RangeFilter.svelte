<script lang="ts">
import { ChevronDown, ChevronUp } from '@steeze-ui/heroicons';
import Icon from '$lib/components/common/Icon.svelte';
import RangeSlider from 'svelte-range-slider-pips';
// I18N
import { m } from '$lib/i18n';
// CONTEXT
import { getMapContext } from '$lib/context/map.svelte';
// TYPES
import type { Id } from '$lib/types';
import { onMount } from 'svelte';
let mapContext = getMapContext();

type Props = {
  key: string;
  label: string;
  min: number;
  max: number;
  layerId: Id;
};

let { key, label, min, max, layerId }: Props = $props();

let isOpen = $state(false);

let displayText = $derived.by(() => {
  if (min === values[0] && max === values[1]) {
    return m.filters__all();
  } else if (values[0] === values[1]) {
    return `${m.filters__only()} ${values[0]} ${m.filters__stars()}`;
  } else {
    return `${m.filters__between()} ${values[0]} ${m.filters__and()} ${values[1]} ${m.filters__stars()}`;
  }
});

let values: [number, number] = $state([min, max]);

$effect(() => {
  mapContext.setRangePropertyFilter(layerId, key, values);
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
      <div class="px-2 pb-4 pt-8">
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
          float />
      </div>
    </div>
  {/if}
</div>

<style>
:global(.rangeSlider) {
  /* Slider main elements */
  --range-slider: theme(colors.base-100);
  --range-handle-inactive: theme(colors.base-content / 0.3);
  --range-handle: theme(colors.primary);
  --range-handle-focus: theme(colors.primary);
  --range-handle-border: var(--range-handle);
  --range-range-inactive: var(--range-handle-inactive);
  --range-range: var(--range-handle-focus);

  /* Handle dimensions */
  --range-handle-width: 16px;
  --range-handle-height: var(--range-handle-width);

  /* Float elements */
  --range-float-inactive: var(--range-handle-inactive);
  --range-float: var(--range-handle-focus);
  --range-float-text: theme(colors.base-content);
  --range-float-background: theme(colors.base-content);
  --range-float-border: theme(colors.base-300);
  --range-float-width: 32px;

  /* Pips and labels */
  --range-pip: lightslategray; /* color of the base pips */
  --range-pip-text: var(--range-pip); /* color of the base labels */
  --range-pip-active: darkslategrey; /* active pips (when handle is on a slider-stop) */
  --range-pip-active-text: var(
    --range-pip-active
  ); /* active labels (when handle is on a slider-stop) */
  --range-pip-hover: darkslategrey; /* when a slider-stop is hovered */
  --range-pip-hover-text: var(--range-pip-hover); /* when a slider-stop is hovered */
  --range-pip-in-range: var(--range-pip-active); /* pips inside the range */
  --range-pip-in-range-text: var(--range-pip-active-text); /* labels inside the range */

  /* Additional customizations */
  --range-track: theme(colors.base-300);

  /* Vertical spacing adjustments */
  margin: 2rem 0.5rem;
}
</style>
