<script lang="ts">
// I18N
import { getI18n } from '$lib/i18n';
// TYPES
import type { Property } from '$lib/types';

type Props = {
  property: Property;
  value: string;
  userPreferences: any;
  onChange: (value: string) => void;
  placeholder?: string;
};

let { property, value, userPreferences, onChange, placeholder }: Props = $props();

// STATE : DERIVED
let computedPlaceholder = $derived(
  placeholder || 
  getI18n(property, 'placeholder', userPreferences) || 
  'Enter value...'
);
</script>

<div class="group relative rounded-lg bg-neutral pl-2 pr-3">
  <input
    type="text"
    class="w-full truncate rounded-md bg-neutral p-2 focus:border-none focus:outline-none focus:ring-0 h-12 active:border-none active:outline-none text-sm {value == "" ? 'text-base-content/60 italic' : 'text-base-content text-bold'}"
    {value}
    placeholder={computedPlaceholder}
    oninput={(e) => onChange((e.target as HTMLInputElement).value)} />
</div> 