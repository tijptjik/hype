<script lang="ts">
// SVELTE
import { untrack } from 'svelte'
import ChevronDown from 'virtual:icons/proicons/chevron-down'
import ChevronUp from 'virtual:icons/proicons/chevron-up'
import { Icon } from '#lib/bits/index.js'
import RangeSlider from 'svelte-range-slider-pips'
// ADAPTERS
import type { useFilterPanelModel } from '#lib/adapters/panels/useFilterPanelModel.svelte.js'
// TYPES

type Props = {
  filter: ReturnType<ReturnType<typeof useFilterPanelModel>['propertyFilter']>
  defaultOpen: boolean
}

let { filter, defaultOpen = false }: Props = $props()

// Derive values from property
let label = $derived(filter.label)
let min = $derived(filter.min)
let max = $derived(filter.max)

// Apply the default once so user toggles remain independent of prop updates.
let isOpen = $state(untrack(() => defaultOpen))
let values: [number, number] = $state(untrack(() => filter.rangeValues))
$effect(() => {
  values = filter.rangeValues
})
let displayText = $derived(filter.displayText)
</script>

<div class="ml-4 min-h-10 shrink-0 rounded-l-md bg-[#0a0a0a]">
  <button
    type="button"
    class="flex w-full shrink-0 items-center justify-between rounded-none py-2 pl-6 pr-9 focus:outline-none focus:ring-0 focus-visible:text-primary"
    onclick={() => (isOpen = !isOpen)}
  >
    <div class="flex flex-col justify-start gap-0 text-left">
      <p class="text-xs font-thin uppercase tracking-widest text-base-content/60">
        {label}
      </p>
      <p class="font-medium">{displayText}</p>
    </div>
    <Icon src={isOpen ? ChevronUp : ChevronDown} class="h-5 w-5 shrink-0" />
  </button>
  <!-- Options -->
  {#if isOpen}
    <div
      class="flex max-h-65 flex-col overflow-y-auto overscroll-contain rounded-l-md bg-base-300 px-3"
    >
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
          on:change={() => filter.setRange(values)}
        />
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
