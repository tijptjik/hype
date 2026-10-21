<script lang="ts">
// I18N
import { m } from '#lib/i18n.js'
// BITS
import { Popover } from '#lib/bits/core/popover/index.js'
// ICONS
import StoreIcon from 'virtual:icons/lucide/store'
import BuildingIcon from 'virtual:icons/lucide/building-2'
import NatureIcon from 'virtual:icons/lucide/mountain'
import AddressIcon from 'virtual:icons/lucide/map-pin-house'
import FilterIcon from 'virtual:icons/lucide/list-filter'
// DOMAIN
import {
  LOCATION_DISCOVERY_TYPES,
  type AvailableDiscoveryType,
} from '#lib/locations/kinds.js'

let {
  value,
  disabled = false,
  onChange,
}: {
  value: AvailableDiscoveryType[]
  disabled?: boolean
  onChange: (value: AvailableDiscoveryType[]) => void
} = $props()
const options = $derived([
  {
    ...LOCATION_DISCOVERY_TYPES[0],
    label: m.location_type_establishments(),
    Icon: StoreIcon,
  },
  {
    ...LOCATION_DISCOVERY_TYPES[1],
    label: m.location_type_addresses(),
    Icon: AddressIcon,
  },
  {
    ...LOCATION_DISCOVERY_TYPES[2],
    label: m.location_type_buildings(),
    Icon: BuildingIcon,
  },
  {
    ...LOCATION_DISCOVERY_TYPES[3],
    label: m.location_type_natural(),
    Icon: NatureIcon,
  },
])
</script>

<Popover
  triggerProps={{ 'aria-label': m.location_types(), role: 'button', tabindex: 0 }}
  triggerClass="flex min-h-11 shrink-0 cursor-pointer items-center gap-2 rounded-lg border border-border bg-panel px-3 text-sm text-foreground hover:bg-primary/5 focus-visible:outline-2 focus-visible:outline-primary"
  contentProps={{ align: 'end' }}
  contentClass="z-[250] w-72 rounded-xl border border-border bg-panel p-3 text-foreground shadow-lg"
>
  {#snippet trigger()}
    <FilterIcon class="size-4" aria-hidden="true" />
    <span>{m.location_types()}</span>
  {/snippet}
  <fieldset class="space-y-1">
    <legend class="mb-2 text-sm font-semibold">{m.location_types()}</legend>
    {#each options as option (option.type)}
      <label
        class="flex items-center gap-3 rounded-lg px-2 py-2 text-sm {option.available
          ? 'cursor-pointer hover:bg-primary/5'
          : 'cursor-not-allowed opacity-45'}"
      >
        <input
          type="checkbox"
          disabled={disabled || !option.available}
          checked={option.available && value.includes(option.type)}
          onchange={event => {
            if (!option.available) return
            onChange(
              event.currentTarget.checked
                ? [...value, option.type]
                : value.filter(type => type !== option.type),
            )
          }}
          class="size-4 accent-primary"
        >
        <option.Icon class="size-4 shrink-0" aria-hidden="true" />
        <span class="flex-1">{option.label}</span>
        {#if !option.available}
          <span class="text-xs">{m.location_unavailable()}</span>
        {/if}
      </label>
    {/each}
  </fieldset>
  <p class="mt-2 text-xs text-muted-foreground">{m.location_unavailable_help()}</p>
</Popover>
