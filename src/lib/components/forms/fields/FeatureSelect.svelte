<script lang="ts">
// I18N
import { getI18n } from '$lib/i18n';
// SERVICES
import { getLocalisedPropertyValues } from '$lib/client/services/property';
// TYPES
import type { Property, AppCtx } from '$lib/types';

type Props = {
  property: Property;
  value: string;
  userPreferences: any;
  appCtx: AppCtx;
  propertyId: string;
  onChange: (value: string) => void;
};

let { property, value, userPreferences, appCtx, propertyId, onChange }: Props = $props();

// STATE : DERIVED
let propertyValues = $derived(getLocalisedPropertyValues(appCtx, propertyId));
let placeholder = $derived(
  getI18n(property, 'placeholder', userPreferences) || 'Select...'
);
</script>

<select
  class="select select-sm w-full rounded-md border-none bg-neutral p-2 px-4 outline-none focus-within:border-none focus-within:outline-none focus:border-none focus:outline-none h-12 {value == "" ? 'text-base-content/60 italic' : 'text-base-content text-bold'}"
  {value}
  onchange={(e) => {
    const target = e.target as HTMLSelectElement;
    onChange(target.value);
  }}>
  <option value="" class="text-primary">{placeholder}</option>
  {#each propertyValues.entries() as [id, localisedValue]}
    <option value={id}>{localisedValue}</option>
  {/each}
</select> 