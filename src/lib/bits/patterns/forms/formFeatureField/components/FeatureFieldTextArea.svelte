<script lang="ts">
// VALIDATION
import { formatPhoneNumbers, readPhoneNumbers } from '#lib/utils/phone-property.js'
// I18N
import { m } from '#lib/i18n.js'
// BITS COMPONENTS
import { TextArea } from '#lib/bits/custom/index.js'

type Props = {
  isPhone?: boolean
  id: string
  value?: string | null
  placeholder?: string
  isEditing?: boolean
  onChange: (value: string) => void
}

let {
  isPhone = false,
  id,
  value = '',
  placeholder = '',
  isEditing = true,
  onChange,
}: Props = $props()

const resolvedPlaceholder = $derived(isEditing ? placeholder : '—')
</script>

<TextArea
  {id}
  name=""
  label=""
  value={isPhone && value?.trim().startsWith('[')
    ? formatPhoneNumbers(value, '\n')
    : (value ?? '')}
  issues={isPhone && readPhoneNumbers(value) === null
    ? [m.property__phone_hk_invalid()]
    : undefined}
  {isEditing}
  placeholder={resolvedPlaceholder}
  class="bits-feature-field__form-field"
  controlClass="bits-feature-field__control-wrap"
  onValueChange={nextValue => onChange(nextValue)}
/>
