<script lang="ts">
import { SelectField } from '$lib/bits/custom'

type Props = {
  id: string
  value?: string | null
  placeholder?: string
  isEditing?: boolean
  options?: Array<{ value: string; label: string }>
  onChange: (value: string) => void
}

let {
  id,
  value = '',
  placeholder = '',
  isEditing = true,
  options = [],
  onChange,
}: Props = $props()

const resolvedPlaceholder = $derived(isEditing ? placeholder : '—')
</script>

<SelectField
  {id}
  name=""
  label=""
  items={options.map(option => ({ value: option.value, label: option.label }))}
  value={value ?? ''}
  {isEditing}
  placeholder={resolvedPlaceholder}
  class="bits-feature-field__form-field"
  triggerClass="bits-feature-field__select-trigger"
  displayClass="bits-feature-field__select-display"
  onValueChange={nextValue => onChange(nextValue)}
/>
