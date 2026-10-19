<script lang="ts">
// I18N
import { m } from '#lib/i18n.js'
// BITS COMPONENTS
import { TextInput } from '#lib/bits/custom/index.js'
// VALIDATION
import { normalizeHongKongPhoneNumber } from '#lib/utils/phone-property.js'

type Props = {
  id: string
  isPhone?: boolean
  value?: string | null
  placeholder?: string
  isEditing?: boolean
  onChange: (value: string) => void
}

let {
  id,
  isPhone = false,
  value = '',
  placeholder = '',
  isEditing = true,
  onChange,
}: Props = $props()

const resolvedPlaceholder = $derived(isEditing ? placeholder : '—')
</script>

<TextInput
  {id}
  inputType={isPhone ? 'tel' : 'text'}
  inputAttrs={isPhone ? { autocomplete: 'tel', inputmode: 'tel' } : {}}
  issues={isPhone && value?.trim() && !normalizeHongKongPhoneNumber(value)
    ? [m.property__phone_hk_invalid()]
    : undefined}
  name=""
  label=""
  value={value ?? ''}
  {isEditing}
  placeholder={resolvedPlaceholder}
  class="bits-feature-field__form-field"
  controlClass="bits-feature-field__control-wrap"
  onValueChange={nextValue => onChange(nextValue)}
/>
