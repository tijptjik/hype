<script lang="ts">
// I18N
import { getI18n } from '$lib/i18n';
// COMPONENTS
import Toggle from '$lib/components/forms/elements/Toggle.svelte';
// TYPES
import type { Property } from '$lib/types';

type Props = {
  property: Property;
  checked: boolean;
  userPreferences: any;
  onChange: (checked: boolean) => void;
  size?: 'sm' | 'md' | 'lg';
  isSolid?: boolean;
};

let { property, checked, userPreferences, onChange, size = 'sm' }: Props = $props();

// STATE : DERIVED
let label = $derived(getI18n(property, 'label', userPreferences) || 'Toggle');

function handleToggle(e: Event) {
  e.preventDefault();
  onChange(!checked);
}
</script>

<Toggle {label} {checked} {size} onChange={handleToggle} />
