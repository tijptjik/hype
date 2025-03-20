<script lang="ts">
import { ChevronDown, ChevronUp } from '@steeze-ui/heroicons';
import Icon from '$lib/components/common/Icon.svelte';
import RangeSlider from 'svelte-range-slider-pips';
// I18N
import * as m from '$lib/paraglide/messages';
import { getI18nValue } from '$lib/i18n';
// CONTEXT
import { getMapContext } from '$lib/context/map.svelte';

let mapContext = getMapContext();

let { property, selectedCategories } = $props();

// Initialize the range values if not already set
$effect(() => {
  if (!selectedCategories[property.key]) {
    selectedCategories[property.key] = {
      rangeMin: property.min,
      rangeMax: property.max,
      globalMin: property.min,
      globalMax: property.max
    };
  }
});

let isOpen = $state(false);

let displayText = $derived(() => {
  if (
    selectedCategories[property.key]?.rangeMin ===
      selectedCategories[property.key]?.globalMin &&
    selectedCategories[property.key]?.rangeMax ===
      selectedCategories[property.key]?.globalMax
  ) {
    return m.filters__all();
  } else if (
    selectedCategories[property.key]?.rangeMin ===
    selectedCategories[property.key]?.rangeMax
  ) {
    return `${m.filters__only()} ${selectedCategories[property.key]?.rangeMin ?? property.min} ${m.filters__stars()}`;
  } else {
    return `${m.filters__between()} ${selectedCategories[property.key]?.rangeMin ?? property.min} ${m.filters__and()} ${
      selectedCategories[property.key]?.rangeMax ?? property.max
    } ${m.filters__stars()}`;
  }
});

// Handle range updates
// TODO Fix the range filter
function handleRangeChange(e: CustomEvent) {
  const [rangeMin, rangeMax] = e.detail.values;
  // selectedCategories[property.key] = {
  //   ...selectedCategories[property.key],
  //   rangeMin,
  //   rangeMax
  // };
  mapContext.state.filters.properties[property.key] = {
    ...selectedCategories[property.key],
    rangeMin,
    rangeMax
  };
}
</script>

<div class="min-h-10 w-full flex-shrink-0 bg-[#0A0A0A]">
  <button
    class="flex w-full flex-shrink-0 items-center justify-between rounded-none py-2 pl-6 pr-9"
    onclick={() => (isOpen = !isOpen)}>
    <div class="flex flex-col justify-start gap-0 text-left">
      <p class="text-xs font-thin uppercase tracking-widest text-base-content/60">
        {getI18nValue(property, 'label')}
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
      class="flex max-h-[260px] flex-col overflow-y-auto rounded-none bg-base-300 px-3">
      <div class="px-2 pb-4 pt-8">
        <RangeSlider
          min={property.min}
          max={property.max}
          step={1}
          values={[
            selectedCategories[property.key]?.rangeMin ?? property.min,
            selectedCategories[property.key]?.rangeMax ?? property.max
          ]}
          onchange={handleRangeChange}
          pips
          all="label"
          first="label"
          last="label"
          rest="pip"
          pipstep={Math.ceil((property.max - property.min) / 10)}
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
