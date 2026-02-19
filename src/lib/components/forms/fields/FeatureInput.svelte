<script lang="ts">
// I18N
import { m } from '$lib/i18n'
import { getI18n } from '$lib/i18n'
// TYPES
import type { Property } from '$lib/types'

type Props = {
  property: Property
  value: string
  userPreferences: any
  onChange: (value: string) => void
  placeholder?: string
}

let { property, value, userPreferences, onChange, placeholder }: Props = $props()

// STATE : DERIVED
let computedPlaceholder = $derived(
  placeholder ||
    getI18n(property, 'placeholder', userPreferences) ||
    m.key_full_raven_wish(),
)
</script>

<div class="group relative rounded-lg bg-glass-100 pl-2 pr-3">
  <input
    type="text"
    class="h-12 w-full truncate rounded-md bg-transparent p-2 text-sm focus:border-none focus:outline-none focus:ring-0 active:border-none active:outline-none {value ==
    ''
      ? 'italic text-base-content/70'
      : 'text-bold text-base-content'}"
    {value}
    placeholder={computedPlaceholder}
    oninput={(e) => onChange((e.target as HTMLInputElement).value)}
  >
</div>
