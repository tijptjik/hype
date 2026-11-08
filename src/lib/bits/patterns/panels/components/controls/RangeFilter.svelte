<script lang="ts">
// SVELTE
import { untrack } from 'svelte'
import { slide } from 'svelte/transition'
import { cubicOut } from 'svelte/easing'
import { prefersReducedMotion } from 'svelte/motion'
import ChevronDown from 'virtual:icons/proicons/chevron-down'
import { Icon } from '#lib/bits/index.js'
import PropertyRangeControl from '#lib/bits/patterns/forms/formFeatureField/components/PropertyRangeControl.svelte'
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

// Apply the default once so user toggles remain independent of prop updates.
let isOpen = $state(untrack(() => defaultOpen))
let values: [number, number] = $state(untrack(() => filter.rangeValues))
$effect(() => {
  values = filter.rangeValues
})
let displayText = $derived(filter.displayText)
</script>

<div
  class="border-base-content/10 text-base-content mx-6 min-h-10 shrink-0 border-b last:border-b-0"
>
  <button
    type="button"
    class="focus-visible:ring-focus -mx-6 flex w-[calc(100%+3rem)] shrink-0 items-center justify-between gap-4 px-6 py-3 outline-none focus-visible:ring-2 focus-visible:ring-inset"
    aria-expanded={isOpen}
    onclick={() => (isOpen = !isOpen)}
  >
    <div class="flex min-w-0 flex-col justify-start gap-1 text-left">
      <p class="text-base-content/60 text-xs font-medium tracking-widest uppercase">
        {label}
      </p>
      <p class="text-base-content/60 text-sm leading-5 break-words">{displayText}</p>
    </div>
    <Icon
      src={ChevronDown}
      class="size-4 shrink-0 text-base-content/60 transition-transform duration-200 motion-reduce:transition-none {isOpen
        ? 'rotate-180'
        : ''}"
    />
  </button>
  <!-- Options -->
  {#if isOpen}
    <div
      transition:slide={{
        duration: prefersReducedMotion.current ? 0 : 200,
        easing: cubicOut,
      }}
      class="flex flex-col overflow-visible px-1"
    >
      <div class="pt-2.5 pb-3.5">
        <PropertyRangeControl
          compact
          definition={filter.definition}
          {values}
          onChange={range => filter.setRange(range)}
        />
      </div>
    </div>
  {/if}
</div>

<style>
:global(.rangeSlider) {
  /* Slider main elements */
  --range-slider: var(--color-base-100);
  --range-handle-inactive: var(--color-muted-foreground);
  --range-handle: var(--color-primary);
  --range-handle-focus: var(--color-primary);
  --range-handle-border: var(--range-handle);
  --range-range-inactive: var(--range-handle-inactive);
  --range-range: var(--range-handle-focus);

  /* Handle dimensions */
  --range-handle-width: 16px;
  --range-handle-height: var(--range-handle-width);

  /* Float elements */
  --range-float-inactive: var(--range-handle-inactive);
  --range-float: var(--color-primary);
  --range-float-text: var(--color-white);
  --range-float-background: var(--color-base-content);
  --range-float-border: var(--color-base-300);
  --range-float-width: 32px;

  /* Pips and labels */
  --range-pip: var(--color-muted-foreground); /* color of the base pips */
  --range-pip-text: var(--range-pip); /* color of the base labels */
  --range-pip-active: var(
    --color-base-content
  ); /* active pips (when handle is on a slider-stop) */
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
