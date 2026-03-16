<script lang="ts">
// ICONS
import ChevronDown from 'virtual:icons/lucide/chevron-down'
import ChevronUp from 'virtual:icons/lucide/chevron-up'
import Icon from '$lib/components/common/Icon.svelte'
// SERVICES
import {
  toggleCategoricalPropertyValue,
  displaySelectedProperties,
  propertyValuesToLocalisedOptions,
} from '$lib/client/services/property'
// I18N
import { getI18n } from '$lib/i18n'
// CONTEXT
import { getAppCtx } from '$lib/context/app.svelte'
// TYPES
import type { Id } from '$lib/types'
import type { Property, PropertyValue } from '$lib/db/zod/schema/property.types'

let appCtx = getAppCtx()

type Props = {
  property: Property
  layerId: Id
  defaultOpen?: boolean
}

let { property, layerId, defaultOpen = false }: Props = $props()

// Derive label from property i18n
let label = $derived(
  getI18n(property, 'label', appCtx.getUserPreferences(), property.key),
)

// Get property values from the property
let propertyValues = $derived((property.values as PropertyValue[]) || [])

// Create localized options map for display
let localisedOptions = $derived(
  propertyValuesToLocalisedOptions(appCtx, propertyValues),
)

// Derive selected values directly from context's propertyFilters using property ID
let selectedPropertyValueIds = $derived(
  appCtx.state.filters.feature.properties?.[layerId]?.[property.id] ?? [],
)

let isOpen = $state(defaultOpen)

function toggleValue(value: PropertyValue) {
  toggleCategoricalPropertyValue(appCtx, layerId, property.id, value.id)
}

let displayText = $derived(
  displaySelectedProperties(selectedPropertyValueIds, localisedOptions),
)
</script>

<div class="ml-4 min-h-10 flex-shrink-0 rounded-l-md bg-[#0a0a0a]">
  <button
    class="flex w-full flex-shrink-0 items-center justify-between rounded-none py-2 pl-6 pr-9 focus:outline-none focus:ring-0 focus-visible:text-sky-600"
    onclick={() => (isOpen = !isOpen)}
  >
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
      class="flex max-h-[260px] flex-col overflow-y-auto overscroll-contain rounded-l-md bg-base-300"
      tabindex="-1"
    >
      {#each propertyValues as value (value.id)}
        <label
          class="group label cursor-pointer justify-start gap-3 px-6 pr-2 first:pt-4 last:pb-4 focus:outline-none focus:ring-0"
          tabindex="0"
          onkeydown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault();
              toggleValue(value);
            }
          }}
        >
          <div
            class="flex h-2 w-2 items-center gap-2 rounded-full group-hover:bg-base-content/60 group-focus:outline-none group-focus:ring-0 group-focus-visible:bg-base-content/60 {selectedPropertyValueIds.includes(
              value.id
            )
              ? 'bg-sky-600 group-hover:bg-sky-600/60 group-focus-visible:bg-sky-600/60'
              : 'border-1 border-base-content/60 bg-transparent'}"
          ></div>
          <input
            type="checkbox"
            checked={selectedPropertyValueIds.includes(value.id)}
            class="checkbox checkbox-sm hidden"
            onchange={() => toggleValue(value)}
          >
          <span class="label-text text-sm font-medium"
            >{localisedOptions.get(value.id) || '?'}</span
          >
        </label>
      {/each}
    </div>
  {/if}
</div>
