<script lang="ts">
// I18N
import { getI18n } from '$lib/i18n'
// SERVICES
import { getLocalisedPropertyValues } from '$lib/client/services/property'
// TYPES
import type { Property } from '$lib/db/zod/schema/property.types'
import type { AppCtx } from '$lib/context/app.svelte'

type Props = {
  property: Property
  value: string
  userPreferences: any
  appCtx: AppCtx
  propertyId: string
  onChange: (value: string) => void
}

let { property, value, userPreferences, appCtx, propertyId, onChange }: Props = $props()

// STATE : DERIVED
let propertyValues = $derived(getLocalisedPropertyValues(appCtx, propertyId))
let placeholder = $derived(
  getI18n(property, 'placeholder', userPreferences) || 'Select...',
)
</script>

<select
  class="text select select-md h-12 w-full rounded-md border-none bg-glass-100 px-4 py-2 outline-none focus-within:border-none focus-within:outline-none focus:border-none focus:outline-none {value ==
  ''
    ? 'italic placeholder:text-base-content/70'
    : 'text-bold text-[1rem] text-base-content'}"
  {value}
  onchange={(e) => {
    const target = e.target as HTMLSelectElement;
    onChange(target.value);
  }}
>
  <option value="" class="text-primary">{placeholder}</option>
  {#each propertyValues.entries() as [ id, localisedValue ]}
    <option value={id}>{localisedValue}</option>
  {/each}
</select>
