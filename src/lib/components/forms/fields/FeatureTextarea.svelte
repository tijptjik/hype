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
  rows?: number
}

let {
  property,
  value,
  userPreferences,
  onChange,
  placeholder,
  rows = 3,
}: Props = $props()

// STATE : DERIVED
let computedPlaceholder = $derived(
  placeholder ||
    getI18n(property, 'placeholder', userPreferences) ||
    m.key_full_raven_wish(),
)
</script>

<div
  class="relative rounded-lg border-none bg-neutral pl-0 pr-3 focus-within:outline-neutral-500"
>
  <textarea
    class="w-full resize-none rounded-md bg-neutral p-2 focus:border-none focus:outline-none focus:ring-0 active:border-none active:outline-none {value ==
    ''
      ? 'italic text-base-content/60'
      : 'text-bold text-base-content'}"
    {value}
    {rows}
    placeholder={computedPlaceholder}
    oninput={(e) => onChange((e.target as HTMLTextAreaElement).value)}
  ></textarea>
</div>
