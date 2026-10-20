<script lang="ts">
// COMPONENTS
import DatePicker from '#lib/bits/custom/datePicker/DatePicker.svelte'
// I18N
import { m } from '#lib/i18n.js'
// BITS COMPONENTS
import { TextInput } from '#lib/bits/custom/index.js'
// VALIDATION
import { normalizePhoneNumber } from '#lib/utils/phone-property.js'

type Props = {
  id: string
  inputType?: 'text' | 'date' | 'number'
  isPhone?: boolean
  value?: string | null
  placeholder?: string
  isEditing?: boolean
  onChange: (value: string) => void
}

let {
  id,
  isPhone = false,
  inputType = 'text',
  value = '',
  placeholder = '',
  isEditing = true,
  onChange,
}: Props = $props()

let blurred = $state(false)
let invalidOnSubmit = $state(false)
const resolvedPlaceholder = $derived(isEditing ? placeholder : '—')
</script>

{#if inputType === 'date'}
  <DatePicker
    value={value ?? ''}
    label={placeholder || 'Choose date'}
    disabled={!isEditing}
    {onChange}
  />
{:else}
  <TextInput
    {id}
    inputType={isPhone ? 'tel' : inputType}
    inputAttrs={isPhone
      ? {
          'data-feature-phone': true,
          autocomplete: 'tel',
          inputmode: 'tel',
          oninvalid: () => {
            invalidOnSubmit = true
          },
          oninput: (event: Event) => {
            invalidOnSubmit = false
            ;(event.currentTarget as HTMLInputElement).setCustomValidity('')
          },
          onfocus: () => (blurred = false),
          onblur: () => (blurred = true),
        }
      : {}}
    issues={isPhone &&
    (blurred || invalidOnSubmit) &&
    value?.trim() &&
    !normalizePhoneNumber(value)
      ? [m.property__phone_invalid()]
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
{/if}
