<script lang="ts">
// SVELTE
import { untrack } from 'svelte'
// BITS COMPONENTS
import ScrollableText from '#lib/bits/custom/text/ScrollableText.svelte'
// ICONS
import ChevronDown from 'virtual:icons/proicons/chevron-down'
import ChevronUp from 'virtual:icons/proicons/chevron-up'
import { Icon } from '#lib/bits/index.js'
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

function toggleValue(value: PropertyValue): void {
  filter.toggle(value.id)
}
let displayText = $derived(filter.displayText)
</script>

<div class="mx-6 min-h-10 shrink-0 rounded-lg border border-border bg-surface">
  <button
    type="button"
    class="flex w-full shrink-0 items-center justify-between rounded-none py-2 px-3 focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-focus"
    aria-expanded={isOpen}
    onclick={() => (isOpen = !isOpen)}
  >
    <div class="flex flex-col justify-start gap-0 text-left">
      <p class="text-xs font-medium uppercase tracking-widest text-muted-foreground">
        {label}
      </p>
      <p class="font-medium">{displayText}</p>
    </div>
    <Icon src={isOpen ? ChevronUp : ChevronDown} class="h-5 w-5 shrink-0" />
  </button>
  <!-- Options -->
  {#if isOpen}
    <div
      class="flex max-h-65 flex-col overflow-y-auto gap-3 overscroll-auto rounded-b-lg bg-surface"
      tabindex="-1"
    >
      {#each propertyValues as value (value.id)}
        {@const optionLabel = localisedOptions.get(value.id) || '?'}
        <button
          type="button"
          aria-label={optionLabel}
          aria-pressed={selectedPropertyValueIds.includes(value.id)}
          class="group label flex w-full cursor-pointer items-center justify-start gap-3 px-3 first:pt-4 last:pb-4 focus:outline-none focus:ring-0"
          onclick={() => toggleValue(value)}
        >
          <div
            class="h-2 w-2 shrink-0 rounded-full group-hover:bg-base-content/60 group-focus:outline-none group-focus:ring-0 group-focus-visible:bg-base-content/60 {selectedPropertyValueIds.includes(
              value.id,
            )
              ? 'bg-primary group-hover:bg-primary/60 group-focus-visible:bg-primary/60'
              : 'border-1 border-border bg-transparent'}"
          ></div>
          <ScrollableText
            text={optionLabel}
            class="min-w-0 flex-1 text-left"
            containerClass="label-text block w-full"
            textClass="text-md font-medium"
          />
        </button>
      {/each}
    </div>
  {/if}
</div>
