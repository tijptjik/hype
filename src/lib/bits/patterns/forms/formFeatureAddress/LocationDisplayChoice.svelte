<script lang="ts">
// ICONS
import What3WordsIcon from 'virtual:icons/lucide/whole-word'
import AutomaticIcon from 'virtual:icons/lucide/sparkles'
import AddressIcon from 'virtual:icons/lucide/map-pin-house'
import PlusCodeIcon from 'virtual:icons/lucide/grid-2x2'
// TYPES
import type { FeatureAddress } from '#lib/addresses/featureAddress.js'
let {
  value = 'automatic',
  onChange,
}: {
  value?: FeatureAddress['locationDisplayMode']
  onChange: (value: NonNullable<FeatureAddress['locationDisplayMode']>) => void
} = $props()
const options = [
  {
    value: 'automatic',
    label: 'Automatic',
    icon: AutomaticIcon,
    description: 'Use an address when available, otherwise a Plus Code',
  },
  {
    value: 'address',
    label: 'Address',
    icon: AddressIcon,
    description: 'Display the associated address',
  },
  {
    value: 'plus_code',
    label: 'Plus Code',
    icon: PlusCodeIcon,
    description: 'Display a Plus Code from the feature marker',
  },
] as const
</script>

<fieldset
  aria-label="Display location using"
  class="border-border flex shrink-0 items-center rounded-lg border p-0.5"
>
  {#each options as option (option.value)}
    <button
      type="button"
      aria-label={option.label}
      aria-pressed={value === option.value}
      data-tooltip={option.description}
      class="text-muted-foreground hover:bg-primary/10 hover:text-primary aria-pressed:bg-primary/10 aria-pressed:text-primary focus-visible:outline-primary flex size-9 items-center justify-center rounded-md transition-colors focus-visible:outline-2 focus-visible:outline-offset-2"
      onclick={() => onChange(option.value)}
    >
      <option.icon class="size-4" aria-hidden="true" />
    </button>
  {/each}
  <button
    type="button"
    disabled
    aria-label="What3Words — not yet available"
    data-tooltip="What3Words integration is not yet available"
    class="text-muted-foreground flex size-9 cursor-not-allowed items-center justify-center rounded-md opacity-40"
  >
    <What3WordsIcon class="size-4" aria-hidden="true" />
  </button>
</fieldset>
