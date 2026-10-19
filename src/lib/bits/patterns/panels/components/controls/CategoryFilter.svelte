<script lang="ts">
// SVELTE
import { untrack } from 'svelte'
import { slide } from 'svelte/transition'
import { cubicOut } from 'svelte/easing'
import { prefersReducedMotion } from 'svelte/motion'
// ICONS
import ChevronDown from 'virtual:icons/proicons/chevron-down'
import Check from 'virtual:icons/proicons/checkmark'
// ADAPTERS
import type { useFilterPanelModel } from '#lib/adapters/panels/useFilterPanelModel.svelte.js'
// TYPES
import type { Property, PropertyValue } from '#lib/db/zod/schema/property.types.js'

type Props = {
  property: Property
  filter: ReturnType<ReturnType<typeof useFilterPanelModel>['propertyFilter']>
  defaultOpen?: boolean
}

let { property, filter, defaultOpen = false }: Props = $props()

// Get property values from the property
let propertyValues = $derived((property.values as PropertyValue[]) || [])

// Create localized options map for display
let label = $derived(filter.label)
let localisedOptions = $derived(filter.options)
let selectedPropertyValueIds = $derived(filter.selectedIds)

// Apply the default once so user toggles remain independent of prop updates.
let isOpen = $state(untrack(() => defaultOpen))

/** Toggles one category value. @param value Option to update. @returns Nothing. */
function toggleValue(value: PropertyValue): void {
  filter.toggle(value.id)
}
let displayText = $derived(filter.displayText)
const optionsId = $props.id()
</script>

<div
  class="mx-6 shrink-0 border-b border-base-content/10 text-base-content last:border-b-0"
>
  <button
    type="button"
    class="-mx-6 flex w-[calc(100%+3rem)] cursor-pointer items-center justify-between gap-4 px-6 py-3 text-left outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-focus"
    aria-expanded={isOpen}
    aria-controls={optionsId}
    onclick={() => (isOpen = !isOpen)}
  >
    <span class="flex min-w-0 flex-col gap-1">
      <span class="text-xs font-medium uppercase tracking-widest text-base-content/60"
        >{label}</span
      >
      <span
        class="break-words text-sm leading-5 {selectedPropertyValueIds.length
          ? 'text-base-content'
          : 'text-base-content/60'}"
        >{displayText}</span
      >
    </span>
    <ChevronDown
      class="size-4 shrink-0 text-base-content/60 transition-transform duration-200 motion-reduce:transition-none {isOpen
        ? 'rotate-180'
        : ''}"
      aria-hidden="true"
    />
  </button>
  <!-- Options -->
  {#if isOpen}
    <div
      transition:slide={{
        duration: prefersReducedMotion.current ? 0 : 200,
        easing: cubicOut,
      }}
      id={optionsId}
      class="flex max-h-72 flex-col gap-1 overflow-y-auto overscroll-contain pb-3"
    >
      {#each propertyValues as value (value.id)}
        {@const optionLabel = localisedOptions.get(value.id) || '?'}
        {@const selected = selectedPropertyValueIds.includes(value.id)}
        <button
          type="button"
          aria-pressed={selected}
          class="flex w-full cursor-pointer items-start gap-3 rounded-md px-2 py-2 text-left text-sm leading-5 outline-none hover:bg-base-content/5 focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-focus {selected
            ? 'bg-base-content/5'
            : ''}"
          onclick={() => toggleValue(value)}
        >
          <span
            class="mt-0.5 flex size-4 shrink-0 items-center justify-center rounded border {selected
              ? 'border-base-content bg-base-content text-panel'
              : 'border-base-content/30'}"
            aria-hidden="true"
          >
            {#if selected}
              <Check class="size-3" />
            {/if}
          </span>
          <span class="min-w-0 flex-1 break-words font-normal">{optionLabel}</span>
        </button>
      {/each}
    </div>
  {/if}
</div>
